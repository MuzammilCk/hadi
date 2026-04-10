jest.setTimeout(30000);

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { CommissionCalculationService } from '../../src/modules/commission/services/commission-calculation.service';
import { AdminPolicyService } from '../../src/modules/commission/services/admin-policy.service';
import { LedgerService } from '../../src/modules/ledger/services/ledger.service';
import {
  LedgerEntryType,
  LedgerEntryStatus,
  LedgerEntry,
} from '../../src/modules/ledger/entities/ledger-entry.entity';
import { CommissionEvent } from '../../src/modules/commission/entities/commission-event.entity';
import { CommissionEventSource } from '../../src/modules/commission/entities/commission-event-source.entity';
import { MoneyEventOutbox } from '../../src/modules/order/entities/money-event-outbox.entity';
import { NetworkNode } from '../../src/modules/network/entities/network-node.entity';
import { QualificationState } from '../../src/modules/network/entities/qualification-state.entity';
import { Order } from '../../src/modules/order/entities/order.entity';
import { User } from '../../src/modules/user/entities/user.entity';
import { CompensationPolicyVersion } from '../../src/modules/commission/entities/compensation-policy-version.entity';
import { CommissionRule } from '../../src/modules/commission/entities/commission-rule.entity';
import { RankRule } from '../../src/modules/commission/entities/rank-rule.entity';
import { ComplianceDisclosure } from '../../src/modules/commission/entities/compliance-disclosure.entity';
import { AllowedEarningsClaim } from '../../src/modules/commission/entities/allowed-earnings-claim.entity';
import { RuleAuditLog } from '../../src/modules/commission/entities/rule-audit-log.entity';

describe('CommissionCalculation Workflow (Integration)', () => {
  let calcService: CommissionCalculationService;
  let ledgerService: LedgerService;
  let policyService: AdminPolicyService;
  let dataSource: DataSource;

  const rootId = uuidv4();
  const sponsorId = uuidv4();
  const buyerId = uuidv4();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          synchronize: true,
          entities: [__dirname + '/../../src/**/*.entity{.ts,.js}'],
        }),
        TypeOrmModule.forFeature([
          CommissionEvent,
          CommissionEventSource,
          MoneyEventOutbox,
          NetworkNode,
          QualificationState,
          Order,
          User,
          CompensationPolicyVersion,
          CommissionRule,
          RankRule,
          ComplianceDisclosure,
          AllowedEarningsClaim,
          RuleAuditLog,
          LedgerEntry,
        ]),
      ],
      providers: [
        CommissionCalculationService,
        AdminPolicyService,
        LedgerService,
      ],
    }).compile();

    calcService = module.get(CommissionCalculationService);
    ledgerService = module.get(LedgerService);
    policyService = module.get(AdminPolicyService);
    dataSource = module.get(DataSource);
  }, 30000);

  async function setupTestData() {
    const userRepo = dataSource.getRepository(User);
    await userRepo.save([
      userRepo.create({ id: rootId, phone: '+910000000001', status: 'active' }),
      userRepo.create({
        id: sponsorId,
        phone: '+910000000002',
        status: 'active',
      }),
      userRepo.create({
        id: buyerId,
        phone: '+910000000003',
        status: 'active',
      }),
    ]);

    const nodeRepo = dataSource.getRepository(NetworkNode);
    await nodeRepo.save(
      nodeRepo.create({
        user_id: buyerId,
        sponsor_id: sponsorId,
        upline_path: [rootId, sponsorId],
        depth: 2,
        direct_count: 0,
        total_downline: 0,
        last_rebuilt_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      }),
    );

    const qualRepo = dataSource.getRepository(QualificationState);
    await qualRepo.save([
      qualRepo.create({
        user_id: rootId,
        is_active: true,
        is_qualified: true,
        evaluated_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      }),
      qualRepo.create({
        user_id: sponsorId,
        is_active: true,
        is_qualified: true,
        evaluated_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      }),
    ]);

    // Create active policy with rules
    const policyRepo = dataSource.getRepository(CompensationPolicyVersion);
    const discRepo = dataSource.getRepository(ComplianceDisclosure);
    const policy = await policyRepo.save(
      policyRepo.create({
        version: 1,
        name: 'Test Policy',
        status: 'active',
        effective_from: new Date(),
      }),
    );

    await discRepo.save(
      discRepo.create({
        policy_version: policy,
        disclosure_key: 'income-disclosure',
        disclosure_text: 'Earnings vary. See income disclosure statement.',
        is_mandatory: true,
      }),
    );

    const ruleRepo = dataSource.getRepository(CommissionRule);
    await ruleRepo.save([
      ruleRepo.create({
        policy_version: policy,
        level: 1,
        percentage: 0.1,
        min_order_value: 0,
        payout_delay_days: 14,
        clawback_window_days: 30,
      }),
      ruleRepo.create({
        policy_version: policy,
        level: 2,
        percentage: 0.05,
        min_order_value: 0,
        payout_delay_days: 14,
        clawback_window_days: 30,
      }),
    ]);

    // Create order
    const orderRepo = dataSource.getRepository(Order);
    const orderId = uuidv4();
    await orderRepo.save(
      orderRepo.create({
        id: orderId,
        idempotency_key: uuidv4(),
        buyer_id: buyerId,
        status: 'paid',
        subtotal: 1000,
        total_amount: 1000,
        currency: 'INR',
        platform_revenue: 1000,
      }),
    );

    // Create outbox event
    const outboxRepo = dataSource.getRepository(MoneyEventOutbox);
    const outbox = await outboxRepo.save(
      outboxRepo.create({
        event_type: 'order.paid',
        aggregate_id: orderId,
        published: false,
        payload: {
          order_id: orderId,
          buyer_id: buyerId,
          total_amount: 1000,
          currency: 'INR',
          paid_at: new Date().toISOString(),
        },
      }),
    );

    return { orderId, outbox };
  }

  it('Full flow: outbox → commission events + ledger entries + outbox marked published', async () => {
    const { orderId, outbox } = await setupTestData();

    await calcService.processOutboxEvent(outbox);

    // Verify commission events
    const ceRepo = dataSource.getRepository(CommissionEvent);
    const events = await ceRepo.find({ where: { order_id: orderId } });
    expect(events.length).toBe(2); // L1 (sponsor) + L2 (root)

    const l1 = events.find((e) => e.commission_level === 1);
    const l2 = events.find((e) => e.commission_level === 2);
    expect(l1).toBeDefined();
    expect(l2).toBeDefined();
    expect(Number(l1!.calculated_amount)).toBe(100);
    expect(Number(l2!.calculated_amount)).toBe(50);

    // Verify commission event sources
    const csRepo = dataSource.getRepository(CommissionEventSource);
    const sources = await csRepo.find();
    expect(sources.length).toBe(2);

    // Verify ledger entries
    const leRepo = dataSource.getRepository(LedgerEntry);
    const entries = await leRepo.find({
      where: { entry_type: LedgerEntryType.COMMISSION_PENDING },
    });
    expect(entries.length).toBe(2);

    // Verify outbox marked published
    const outboxRepo = dataSource.getRepository(MoneyEventOutbox);
    const refreshed = await outboxRepo.findOne({ where: { id: outbox.id } });
    expect(refreshed!.published).toBe(true);
  });

  it('Idempotency: processOutboxEvent called twice → only ONE commission_event per (order,user,level)', async () => {
    // The test data from the previous test is still in the DB
    const outboxRepo = dataSource.getRepository(MoneyEventOutbox);
    const allOutbox = await outboxRepo.find();
    if (allOutbox.length === 0) return; // skip if no data

    const outbox = allOutbox[0];
    // Reset published for re-processing
    await outboxRepo.update({ id: outbox.id }, { published: false });

    await calcService.processOutboxEvent(outbox);

    const ceRepo = dataSource.getRepository(CommissionEvent);
    const orderId = (outbox.payload as any).order_id;
    const events = await ceRepo.find({ where: { order_id: orderId } });
    // Should still be exactly 2 events, not 4
    expect(events.length).toBe(2);
  });

  it('No active policy → outbox marked published, no commission_events written', async () => {
    // Deactivate all active policies
    const policyRepo = dataSource.getRepository(CompensationPolicyVersion);
    const activePolicies = await policyRepo.find({
      where: { status: 'active' as any },
    });
    for (const p of activePolicies) {
      await policyRepo.update({ id: p.id }, { status: 'archived' as any });
    }

    const outboxRepo = dataSource.getRepository(MoneyEventOutbox);
    const orderId = uuidv4();
    const orderRepo = dataSource.getRepository(Order);
    await orderRepo.save(
      orderRepo.create({
        id: orderId,
        idempotency_key: uuidv4(),
        buyer_id: buyerId,
        status: 'paid',
        subtotal: 500,
        total_amount: 500,
        currency: 'INR',
        platform_revenue: 500,
      }),
    );

    const newOutbox = await outboxRepo.save(
      outboxRepo.create({
        event_type: 'order.paid',
        aggregate_id: orderId,
        published: false,
        payload: {
          order_id: orderId,
          buyer_id: buyerId,
          total_amount: 500,
          currency: 'INR',
          paid_at: new Date().toISOString(),
        },
      }),
    );

    await calcService.processOutboxEvent(newOutbox);

    const refreshed = await outboxRepo.findOne({ where: { id: newOutbox.id } });
    expect(refreshed!.published).toBe(true);

    const ceRepo = dataSource.getRepository(CommissionEvent);
    const events = await ceRepo.find({ where: { order_id: orderId } });
    expect(events.length).toBe(0);
  });
});
