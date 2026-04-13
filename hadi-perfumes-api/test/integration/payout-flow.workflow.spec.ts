jest.setTimeout(30000);

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { PayoutService } from '../../src/modules/payout/services/payout.service';
import { LedgerService } from '../../src/modules/ledger/services/ledger.service';
import { WalletService } from '../../src/modules/ledger/services/wallet.service';
import {
  PayoutRequest,
  PayoutRequestStatus,
} from '../../src/modules/payout/entities/payout-request.entity';
import { PayoutBatch } from '../../src/modules/payout/entities/payout-batch.entity';
import {
  LedgerEntry,
  LedgerEntryType,
  LedgerEntryStatus,
} from '../../src/modules/ledger/entities/ledger-entry.entity';
import { User } from '../../src/modules/user/entities/user.entity';
import { QualificationState } from '../../src/modules/network/entities/qualification-state.entity';

describe('Payout Flow Workflow (Integration)', () => {
  let payoutService: PayoutService;
  let ledgerService: LedgerService;
  let walletService: WalletService;
  let dataSource: DataSource;

  const userId = uuidv4();
  const adminActorId = uuidv4();

  beforeAll(async () => {
    process.env.MIN_PAYOUT_AMOUNT_INR = '100';

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          synchronize: true,
          entities: [
            PayoutRequest,
            PayoutBatch,
            LedgerEntry,
            User,
            QualificationState,
          ],
        }),
        TypeOrmModule.forFeature([
          PayoutRequest,
          PayoutBatch,
          LedgerEntry,
          User,
          QualificationState,
        ]),
      ],
      providers: [PayoutService, LedgerService, WalletService],
    }).compile();

    payoutService = module.get(PayoutService);
    ledgerService = module.get(LedgerService);
    walletService = module.get(WalletService);
    dataSource = module.get(DataSource);

    // Setup: create user, qualification state, and give available balance
    const userRepo = dataSource.getRepository(User);
    await userRepo.save(
      userRepo.create({ id: userId, phone: '+910000000001', status: 'active' }),
    );

    const qualRepo = dataSource.getRepository(QualificationState);
    await qualRepo.save(
      qualRepo.create({
        user_id: userId,
        is_active: true,
        is_qualified: true,
        evaluated_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      }),
    );

    // Give user 1000 available balance via ledger entries
    await ledgerService.writeEntry({
      userId,
      entryType: LedgerEntryType.COMMISSION_AVAILABLE,
      amount: 1000,
      currency: 'INR',
      status: LedgerEntryStatus.SETTLED,
      referenceId: uuidv4(),
      referenceType: 'commission_event',
      note: 'Initial available balance for tests',
    });
  }, 30000);

  it('createPayoutRequest → approvePayoutRequest → executeBatch: full lifecycle', async () => {
    const idempotencyKey = uuidv4();
    const request = await payoutService.createPayoutRequest(
      userId,
      { amount: 300, payout_method: { type: 'bank_transfer', account_number: '1234', ifsc_code: 'IFSC123', account_name: 'test' } },
      idempotencyKey,
    );

    expect(request.status).toBe(PayoutRequestStatus.REQUESTED);
    expect(Number(request.amount)).toBe(300);

    // Verify PAYOUT_REQUESTED ledger entry written
    const leRepo = dataSource.getRepository(LedgerEntry);
    const holdEntries = await leRepo.find({
      where: {
        reference_id: request.id,
        entry_type: LedgerEntryType.PAYOUT_REQUESTED,
      },
    });
    expect(holdEntries.length).toBe(1);
    expect(Number(holdEntries[0].amount)).toBe(-300);
    expect(holdEntries[0].status).toBe(LedgerEntryStatus.HELD);

    // Approve
    const approved = await payoutService.approvePayoutRequest(
      request.id,
      adminActorId,
    );
    expect(approved.status).toBe(PayoutRequestStatus.APPROVED);

    // Execute batch
    const batch = await payoutService.executeBatch(adminActorId);
    expect(batch.status).toBeDefined();

    // Verify status = sent
    const prRepo = dataSource.getRepository(PayoutRequest);
    const sent = await prRepo.findOne({ where: { id: request.id } });
    expect(sent!.status).toBe(PayoutRequestStatus.SENT);

    // Verify PAYOUT_SENT ledger entry
    const sentEntries = await leRepo.find({
      where: {
        reference_id: request.id,
        entry_type: LedgerEntryType.PAYOUT_SENT,
      },
    });
    expect(sentEntries.length).toBe(1);
  });

  it('rejectPayoutRequest: status=rejected + balance restored', async () => {
    // Get balance before
    const balanceBefore = await ledgerService.getAvailableBalance(userId);

    const idempotencyKey = uuidv4();
    const request = await payoutService.createPayoutRequest(
      userId,
      { amount: 200, payout_method: { type: 'bank_transfer', account_number: '1234', ifsc_code: 'IFSC123', account_name: 'test' } },
      idempotencyKey,
    );

    // Balance should decrease by 200
    const balanceAfterRequest = await ledgerService.getAvailableBalance(userId);
    expect(balanceAfterRequest).toBe(
      parseFloat((balanceBefore - 200).toFixed(2)),
    );

    // Reject
    const rejected = await payoutService.rejectPayoutRequest(
      request.id,
      adminActorId,
      'Test rejection',
    );
    expect(rejected.status).toBe(PayoutRequestStatus.REJECTED);

    // Balance should be restored
    const balanceAfterReject = await ledgerService.getAvailableBalance(userId);
    expect(balanceAfterReject).toBe(balanceBefore);
  });

  it('Insufficient balance → InsufficientBalanceForPayoutException', async () => {
    await expect(
      payoutService.createPayoutRequest(userId, { amount: 99999, payout_method: { type: 'bank_transfer', account_number: '1234', ifsc_code: 'IFSC123', account_name: 'test' } }, uuidv4()),
    ).rejects.toThrow('Insufficient balance');
  });

  it('Below minimum → BelowMinimumPayoutAmountException', async () => {
    await expect(
      payoutService.createPayoutRequest(userId, { amount: 50, payout_method: { type: 'bank_transfer', account_number: '1234', ifsc_code: 'IFSC123', account_name: 'test' } }, uuidv4()),
    ).rejects.toThrow('below minimum threshold');
  });

  it('Same idempotency_key → same PayoutRequest returned', async () => {
    const key = uuidv4();
    const first = await payoutService.createPayoutRequest(
      userId,
      { amount: 100, payout_method: { type: 'bank_transfer', account_number: '1234', ifsc_code: 'IFSC123', account_name: 'test' } },
      key,
    );
    const second = await payoutService.createPayoutRequest(
      userId,
      { amount: 100, payout_method: { type: 'bank_transfer', account_number: '1234', ifsc_code: 'IFSC123', account_name: 'test' } },
      key,
    );
    expect(first.id).toBe(second.id);
  });

  it('Second request while first is pending → PendingPayoutAlreadyExistsException', async () => {
    // Clean up any existing pending requests from previous tests
    const prRepo = dataSource.getRepository(PayoutRequest);
    const existingPending = await prRepo.findOne({
      where: { user_id: userId, status: PayoutRequestStatus.REQUESTED },
    });
    if (existingPending) {
      await payoutService.rejectPayoutRequest(
        existingPending.id,
        adminActorId,
        'cleanup for test',
      );
    }

    // First request (new key)
    const first = await payoutService.createPayoutRequest(
      userId,
      { amount: 100, payout_method: { type: 'bank_transfer', account_number: '1234', ifsc_code: 'IFSC123', account_name: 'test' } },
      uuidv4(),
    );

    // Second request should fail
    await expect(
      payoutService.createPayoutRequest(userId, { amount: 100, payout_method: { type: 'bank_transfer', account_number: '1234', ifsc_code: 'IFSC123', account_name: 'test' } }, uuidv4()),
    ).rejects.toThrow('pending or approved');
  });

  it('Verify HELD PAYOUT_REQUESTED deducted from available balance correctly', async () => {
    // Clean up — reject the pending request from previous test
    const prRepo = dataSource.getRepository(PayoutRequest);
    const pending = await prRepo.findOne({
      where: { user_id: userId, status: PayoutRequestStatus.REQUESTED },
    });
    if (pending) {
      await payoutService.rejectPayoutRequest(
        pending.id,
        adminActorId,
        'cleanup',
      );
    }

    const balanceBefore = await ledgerService.getAvailableBalance(userId);
    const key = uuidv4();
    await payoutService.createPayoutRequest(userId, { amount: 150, payout_method: { type: 'bank_transfer', account_number: '1234', ifsc_code: 'IFSC123', account_name: 'test' } }, key);

    const balanceAfter = await ledgerService.getAvailableBalance(userId);
    expect(balanceAfter).toBe(parseFloat((balanceBefore - 150).toFixed(2)));
  });
});
