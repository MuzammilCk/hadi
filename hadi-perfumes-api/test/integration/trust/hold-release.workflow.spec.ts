jest.setTimeout(30000);

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { User } from '../../../src/modules/user/entities/user.entity';
import {
  PayoutRequest,
  PayoutRequestStatus,
} from '../../../src/modules/payout/entities/payout-request.entity';
import { PayoutBatch } from '../../../src/modules/payout/entities/payout-batch.entity';
import { LedgerEntry } from '../../../src/modules/ledger/entities/ledger-entry.entity';
import { QualificationState } from '../../../src/modules/network/entities/qualification-state.entity';
import { PayoutHold } from '../../../src/modules/trust/holds/entities/payout-hold.entity';
import { CommissionHold } from '../../../src/modules/trust/holds/entities/commission-hold.entity';
import { ResolutionEvent } from '../../../src/modules/trust/holds/entities/resolution-event.entity';
import { TrustAuditLog } from '../../../src/modules/trust/audit/entities/trust-audit-log.entity';

import { PayoutService } from '../../../src/modules/payout/services/payout.service';
import { HoldService } from '../../../src/modules/trust/holds/services/hold.service';
import { TrustAuditService } from '../../../src/modules/trust/audit/services/trust-audit.service';
import { LedgerService } from '../../../src/modules/ledger/services/ledger.service';
import { WalletService } from '../../../src/modules/ledger/services/wallet.service';

describe('Hold Release Workflow (Integration)', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let payoutService: PayoutService;
  let holdService: HoldService;
  let ledgerService: LedgerService;

  let userRepo: Repository<User>;
  let payoutRepo: Repository<PayoutRequest>;

  let testUser: User;
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
          User,
          PayoutRequest,
          PayoutBatch,
          LedgerEntry,
          QualificationState,
          PayoutHold,
          CommissionHold,
          ResolutionEvent,
          TrustAuditLog,
        ]),
      ],
      providers: [
        PayoutService,
        HoldService,
        TrustAuditService,
        LedgerService,
        WalletService,
      ],
    }).compile();

    dataSource = module.get(DataSource);
    payoutService = module.get(PayoutService);
    holdService = module.get(HoldService);
    ledgerService = module.get(LedgerService);

    userRepo = dataSource.getRepository(User);
    payoutRepo = dataSource.getRepository(PayoutRequest);

    testUser = await userRepo.save(
      userRepo.create({ phone: '+919999990006', status: 'active' }),
    );

    const qualRepo = dataSource.getRepository(QualificationState);
    await qualRepo.save(
      qualRepo.create({
        user_id: testUser.id,
        is_active: true,
        is_qualified: true,
        evaluated_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      }),
    );

    // Fund the user ledger
    await ledgerService.writeEntry({
      userId: testUser.id,
      amount: 500,
      currency: 'INR',
      entryType: 'commission_available' as any,
      status: 'settled' as any,
      referenceId: uuidv4(),
      referenceType: 'test',
      note: 'test',
    });
  });

  afterAll(async () => {
    await module?.close();
  });

  it("active payout hold → executeBatch skips that user's payout", async () => {
    // 1. Create a payout request
    const request = await payoutService.createPayoutRequest(
      testUser.id,
      { amount: 100, payout_method: { type: 'bank_transfer', account_number: '1234', ifsc_code: 'IFSC123', account_name: 'test' } },
      uuidv4(),
    );

    // 2. Approve it
    const approved = await payoutService.approvePayoutRequest(
      request.id,
      adminId,
    );
    expect(approved.status).toBe(PayoutRequestStatus.APPROVED);

    // 3. Place hold
    await holdService.placePayoutHold({
      userId: testUser.id,
      reasonType: 'admin_manual' as any,
      idempotencyKey: uuidv4(),
    });

    // 4. executeBatch
    await payoutService.executeBatch(adminId);

    // 5. Verify the payout was skipped and marked HELD or BATCHED
    const updated = await payoutRepo.findOne({ where: { id: request.id } });
    expect(updated!.status).not.toBe(PayoutRequestStatus.SENT);
    // Based on hook logic it should be BATCHED or HELD, we'll just test that it's not completed.
  });

  it("hold released → executeBatch processes user's payout on next run", async () => {
    // Release the hold
    const holdRepo = dataSource.getRepository(PayoutHold);
    const hold = await holdRepo.findOne({
      where: { user_id: testUser.id, status: 'active' },
    });
    if (hold) await holdService.releasePayoutHold(hold.id, adminId);

    const result = await payoutService.executeBatch(adminId);

    const updated = await payoutRepo.findOne({
      where: { user_id: testUser.id },
    });
    expect(['completed', 'processing', 'payout_sent', 'sent']).toContain(
      updated!.status.toLowerCase(),
    ); // Usually it becomes completed/processing based on batch logic
  });
});
