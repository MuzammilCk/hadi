jest.setTimeout(30000);

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { User } from '../../../src/modules/user/entities/user.entity';
import { FraudSignal, FraudSignalType, FraudSignalSeverity, FraudSignalStatus } from '../../../src/modules/trust/fraud/entities/fraud-signal.entity';
import { RiskAssessment } from '../../../src/modules/trust/fraud/entities/risk-assessment.entity';
import { AbuseWatchlistEntry } from '../../../src/modules/trust/fraud/entities/abuse-watchlist-entry.entity';
import { PayoutHold } from '../../../src/modules/trust/holds/entities/payout-hold.entity';
import { CommissionHold } from '../../../src/modules/trust/holds/entities/commission-hold.entity';
import { TrustAuditLog } from '../../../src/modules/trust/audit/entities/trust-audit-log.entity';

import { FraudSignalService } from '../../../src/modules/trust/fraud/services/fraud-signal.service';
import { HoldService } from '../../../src/modules/trust/holds/services/hold.service';
import { FraudAggregationJob } from '../../../src/modules/trust/jobs/fraud-aggregation.job';
import { TrustAuditService } from '../../../src/modules/trust/audit/services/trust-audit.service';

describe('Fraud Hold Workflow (Integration)', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let fraudService: FraudSignalService;
  let aggregationJob: FraudAggregationJob;
  
  let userRepo: Repository<User>;
  let signalRepo: Repository<FraudSignal>;
  let riskRepo: Repository<RiskAssessment>;
  let holdRepo: Repository<PayoutHold>;

  let testUser1: User;
  let testUser2: User;
  const adminId = '00000000-0000-0000-0000-000000000000';

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          synchronize: true,
          entities: [__dirname + '/../../../src/**/*.entity{.ts,.js}'],
        }),
        TypeOrmModule.forFeature([
          User, FraudSignal, RiskAssessment, AbuseWatchlistEntry,
          PayoutHold, CommissionHold, TrustAuditLog
        ]),
      ],
      providers: [
        FraudSignalService,
        HoldService,
        TrustAuditService,
        FraudAggregationJob,
      ],
    }).compile();

    dataSource = module.get(DataSource);
    fraudService = module.get(FraudSignalService);
    aggregationJob = module.get(FraudAggregationJob);
    
    userRepo = dataSource.getRepository(User);
    signalRepo = dataSource.getRepository(FraudSignal);
    riskRepo = dataSource.getRepository(RiskAssessment);
    holdRepo = dataSource.getRepository(PayoutHold);

    testUser1 = await userRepo.save(userRepo.create({ phone: '+919999990004', status: 'active' }));
    testUser2 = await userRepo.save(userRepo.create({ phone: '+919999990005', status: 'active' }));
  });

  afterAll(async () => {
    await module?.close();
  });

  it('high severity signal → payout hold placed for user', async () => {
    const signal = await fraudService.recordSignal({
      userId: testUser1.id,
      signalType: FraudSignalType.VELOCITY_BREACH,
      severity: FraudSignalSeverity.HIGH,
      source: 'system',
      idempotencyKey: uuidv4(),
    });

    expect(signal).toBeDefined();
    expect(signal.severity).toBe(FraudSignalSeverity.HIGH);

    const holds = await holdRepo.find({ where: { user_id: testUser1.id, status: 'active' } });
    expect(holds.length).toBe(1);
    expect(holds[0].reason_type).toBe('fraud_review');
  });

  it('signal recorded twice with same idempotency_key → one row, one hold', async () => {
    const key = uuidv4();
    const first = await fraudService.recordSignal({
      userId: testUser2.id,
      signalType: FraudSignalType.SUSPICIOUS_NETWORK,
      severity: FraudSignalSeverity.HIGH,
      source: 'system',
      idempotencyKey: key,
    });

    const second = await fraudService.recordSignal({
      userId: testUser2.id,
      signalType: FraudSignalType.SUSPICIOUS_NETWORK,
      severity: FraudSignalSeverity.HIGH,
      source: 'system',
      idempotencyKey: key,
    });

    expect(first.id).toBe(second.id);

    const holds = await holdRepo.find({ where: { user_id: testUser2.id, status: 'active' } });
    expect(holds.length).toBe(1);
  });

  it('false_positive review → payout hold released', async () => {
    const signals = await signalRepo.find({ where: { user_id: testUser1.id, severity: FraudSignalSeverity.HIGH } });
    const targetSignal = signals[0];

    const reviewed = await fraudService.reviewSignal(targetSignal.id, adminId, 'false_positive', 'Looks fine');
    expect(reviewed.status).toBe(FraudSignalStatus.FALSE_POSITIVE);

    const holds = await holdRepo.find({ where: { user_id: testUser1.id, reason_ref_id: targetSignal.id } });
    expect(holds.length).toBe(1);
    expect(holds[0].status).toBe('released');
  });

  it('critical signal → risk_level=critical in RiskAssessment', async () => {
    // Generate critical signal
    await fraudService.recordSignal({
      userId: testUser2.id,
      signalType: FraudSignalType.SYNTHETIC_IDENTITY,
      severity: FraudSignalSeverity.CRITICAL,
      source: 'system',
      idempotencyKey: uuidv4(),
    });

    const risk = await riskRepo.findOne({ where: { user_id: testUser2.id } });
    expect(risk).toBeDefined();
    expect(risk!.risk_level).toBe('critical');
    // It should also place a hold if not already placed by critical sync process.
  });

  it('FraudAggregationJob → places hold for users crossing critical threshold', async () => {
    // We already have a critical risk level for testUser2 from the previous test.
    // Assuming aggregationJob scans risk and places holds
    
    // We manually update the risk assessment to simulate the job recalculation effect 
    // without the hold being synced instantly if the service was detached.
    // The previous critical signal actually placed a hold via recordSignal automatically.
    // Let's release the hold manually to let the job pick it up.
    await holdRepo.update({ user_id: testUser2.id }, { status: 'released' });
    
    // The instructions say: "FraudAggregationJob -> Recalculate risk_assessments for users with new fraud signals... If new risk_level is 'critical' and no active hold → place payout hold."
    await aggregationJob.run();

    const holdsAfterJob = await holdRepo.find({ where: { user_id: testUser2.id, status: 'active' } });
    expect(holdsAfterJob.length).toBeGreaterThanOrEqual(1);
  });
});
