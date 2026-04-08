jest.setTimeout(30000);

import { v4 as uuidv4 } from 'uuid';
import { PayoutService } from '../../../src/modules/payout/services/payout.service';
import { PayoutRequestStatus } from '../../../src/modules/payout/entities/payout-request.entity';
import { LedgerEntryType, LedgerEntryStatus } from '../../../src/modules/ledger/entities/ledger-entry.entity';

describe('PayoutService', () => {
  let service: PayoutService;
  let mockPayoutRequestRepo: any;
  let mockPayoutBatchRepo: any;
  let mockUserRepo: any;
  let mockQualStateRepo: any;
  let mockLedgerService: any;
  let mockWalletService: any;
  let mockDataSource: any;
  let ledgerWriteCalls: any[];

  const userId = uuidv4();
  const payoutId = uuidv4();
  const adminActorId = uuidv4();

  beforeEach(() => {
    ledgerWriteCalls = [];

    mockPayoutRequestRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };

    mockPayoutBatchRepo = {
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    mockUserRepo = {};
    mockQualStateRepo = {};

    mockLedgerService = {
      getAvailableBalance: jest.fn().mockResolvedValue(1000),
      // Fix #2b / #10: getAvailableBalanceForManager is now called inside the tx
      getAvailableBalanceForManager: jest.fn().mockResolvedValue(1000),
      writeEntry: jest.fn().mockImplementation(async (params: any) => {
        ledgerWriteCalls.push(params);
        return { id: uuidv4(), ...params };
      }),
    };

    mockWalletService = {};

    const mockEm: any = {
      findOne: jest.fn().mockImplementation(async (EntityClass: any, opts: any) => {
        const name = EntityClass.name || '';
        if (name === 'User') return { id: userId, status: 'active' };
        if (name === 'QualificationState') return { user_id: userId, is_qualified: true };
        if (name === 'PayoutRequest') {
          if (opts?.where?.id) return { id: opts.where.id, user_id: userId, status: PayoutRequestStatus.REQUESTED, amount: 500, currency: 'INR' };
          return null; // no pending payout
        }
        return null;
      }),
      create: jest.fn((EntityClass: any, data: any) => ({ ...data, id: data.id || uuidv4() })),
      save: jest.fn(async (EntityClass: any, data: any) => ({ ...data, id: data.id || uuidv4() })),
      update: jest.fn(async () => {}),
    };

    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => cb(mockEm)),
    };

    service = new PayoutService(
      mockPayoutRequestRepo,
      mockPayoutBatchRepo,
      mockUserRepo,
      mockQualStateRepo,
      mockLedgerService,
      mockWalletService,
      mockDataSource,
    );
  });

  it('amount < MIN_PAYOUT_AMOUNT_INR → BelowMinimumPayoutAmountException', async () => {
    process.env.MIN_PAYOUT_AMOUNT_INR = '100';
    await expect(service.createPayoutRequest(userId, { amount: 50 }, uuidv4()))
      .rejects.toThrow('below minimum threshold');
  });

  it('user.status !== active → UserNotEligibleForPayoutException', async () => {
    (mockDataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => {
      const em = {
        findOne: jest.fn().mockImplementation(async (EntityClass: any) => {
          if (EntityClass.name === 'User') return { id: userId, status: 'suspended' };
          return null;
        }),
        create: jest.fn((_: any, data: any) => data),
        save: jest.fn(async (_: any, data: any) => data),
      };
      return cb(em);
    });
    await expect(service.createPayoutRequest(userId, { amount: 200 }, uuidv4()))
      .rejects.toThrow('not active');
  });

  it('is_qualified=false → UserNotEligibleForPayoutException', async () => {
    (mockDataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => {
      const em = {
        findOne: jest.fn().mockImplementation(async (EntityClass: any) => {
          if (EntityClass.name === 'User') return { id: userId, status: 'active' };
          if (EntityClass.name === 'QualificationState') return { user_id: userId, is_qualified: false };
          return null;
        }),
        create: jest.fn((_: any, data: any) => data),
        save: jest.fn(async (_: any, data: any) => data),
      };
      return cb(em);
    });
    await expect(service.createPayoutRequest(userId, { amount: 200 }, uuidv4()))
      .rejects.toThrow('not qualified');
  });

  it('available_balance < amount → InsufficientBalanceForPayoutException', async () => {
    // Fix #2b: createPayoutRequest now uses getAvailableBalanceForManager (tx-scoped)
    mockLedgerService.getAvailableBalanceForManager.mockResolvedValue(50);
    await expect(service.createPayoutRequest(userId, { amount: 200 }, uuidv4()))
      .rejects.toThrow('Insufficient balance');
  });

  it('existing requested/approved payout → PendingPayoutAlreadyExistsException', async () => {
    (mockDataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => {
      const em = {
        findOne: jest.fn().mockImplementation(async (EntityClass: any, opts: any) => {
          if (EntityClass.name === 'User') return { id: userId, status: 'active' };
          if (EntityClass.name === 'QualificationState') return { user_id: userId, is_qualified: true };
          if (EntityClass.name === 'PayoutRequest' && opts?.where) {
            // Has pending payout
            return { id: uuidv4(), user_id: userId, status: PayoutRequestStatus.REQUESTED };
          }
          return null;
        }),
        create: jest.fn((_: any, data: any) => data),
        save: jest.fn(async (_: any, data: any) => data),
      };
      return cb(em);
    });
    await expect(service.createPayoutRequest(userId, { amount: 200 }, uuidv4()))
      .rejects.toThrow('pending or approved');
  });

  it('valid request → PayoutRequest created + PAYOUT_REQUESTED ledger entry (negative, HELD)', async () => {
    const result = await service.createPayoutRequest(userId, { amount: 200 }, uuidv4());
    expect(result).toBeDefined();
    expect(result.status).toBe(PayoutRequestStatus.REQUESTED);

    expect(mockLedgerService.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryType: LedgerEntryType.PAYOUT_REQUESTED,
        amount: -200,
        status: LedgerEntryStatus.HELD,
      }),
      expect.anything(),
    );
  });

  it('same idempotency_key → returns existing record (idempotent)', async () => {
    const key = uuidv4();
    const existing = { id: payoutId, user_id: userId, status: 'requested', idempotency_key: key };
    mockPayoutRequestRepo.findOne.mockResolvedValue(existing);

    const result = await service.createPayoutRequest(userId, { amount: 200 }, key);
    expect(result.id).toBe(payoutId);
    // Transaction should NOT have been called
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('approvePayoutRequest: status=approved, approved_by/at set', async () => {
    const result = await service.approvePayoutRequest(payoutId, adminActorId);
    expect(result.status).toBe(PayoutRequestStatus.APPROVED);
    expect(result.approved_by).toBe(adminActorId);
    expect(result.approved_at).toBeDefined();
  });

  it('approvePayoutRequest non-requested status → PayoutNotApprovableException', async () => {
    (mockDataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => {
      const em = {
        findOne: jest.fn().mockResolvedValue({ id: payoutId, status: 'approved' }),
      };
      return cb(em);
    });
    await expect(service.approvePayoutRequest(payoutId, adminActorId))
      .rejects.toThrow('cannot be approved');
  });

  it('rejectPayoutRequest: status=rejected + PAYOUT_FAILED ledger entry (positive, SETTLED)', async () => {
    const result = await service.rejectPayoutRequest(payoutId, adminActorId, 'test reason');
    expect(result.status).toBe(PayoutRequestStatus.REJECTED);
    expect(result.rejection_reason).toBe('test reason');

    expect(mockLedgerService.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryType: LedgerEntryType.PAYOUT_FAILED,
        status: LedgerEntryStatus.SETTLED,
      }),
      expect.anything(),
    );
  });

  it('rejectPayoutRequest non-requested status → PayoutNotRejectableException', async () => {
    (mockDataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => {
      const em = {
        findOne: jest.fn().mockResolvedValue({ id: payoutId, status: 'approved' }),
      };
      return cb(em);
    });
    await expect(service.rejectPayoutRequest(payoutId, adminActorId, 'reason'))
      .rejects.toThrow('cannot be rejected');
  });

  it('listBatches and getPayoutRequest methods exist and work', async () => {
    const batches = await service.listBatches({ page: 1, limit: 10 });
    expect(batches).toHaveProperty('data');
    expect(batches).toHaveProperty('total');

    mockPayoutRequestRepo.findOne.mockResolvedValue({ id: payoutId });
    const payout = await service.getPayoutRequest(payoutId);
    expect(payout.id).toBe(payoutId);
  });

  // ─── Fix #9 ────────────────────────────────────────────────────────────────
  it('createPayoutRequest returns ledger_entry_id on result (not null)', async () => {
    const ledgerEntryId = uuidv4();

    // Mock em.save to return a PayoutRequest with an id
    const savedId = uuidv4();
    const mockEm2: any = {
      findOne: jest.fn().mockImplementation(async (EntityClass: any, opts: any) => {
        const name = EntityClass?.name ?? '';
        if (name === 'User') return { id: userId, status: 'active' };
        if (name === 'QualificationState') return { user_id: userId, is_qualified: true };
        if (name === 'PayoutRequest') {
          // First call (pending check) → null; second call (re-fetch after update) → with ledger_entry_id
          if (opts?.where?.id === savedId) return { id: savedId, ledger_entry_id: ledgerEntryId, status: 'requested' };
          return null;
        }
        return null;
      }),
      create: jest.fn((_: any, data: any) => ({ ...data, id: data.id || savedId })),
      save: jest.fn(async (_: any, data: any) => ({ ...data, id: savedId })),
      update: jest.fn(async () => {}),
    };
    mockDataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(mockEm2));
    mockLedgerService.getAvailableBalanceForManager = jest.fn().mockResolvedValue(1000);
    mockLedgerService.writeEntry = jest.fn().mockResolvedValue({ id: ledgerEntryId });

    const result = await service.createPayoutRequest(userId, { amount: 200 }, uuidv4());
    expect(result.ledger_entry_id).toBeDefined();
    expect(result.ledger_entry_id).not.toBeNull();
    expect(result.ledger_entry_id).toBe(ledgerEntryId);
  });

  // ─── Fix #10 ───────────────────────────────────────────────────────────────
  it('approvePayoutRequest throws InsufficientBalanceForPayoutException when balance < amount', async () => {
    mockLedgerService.getAvailableBalanceForManager = jest.fn().mockResolvedValue(10);
    (mockDataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => {
      const em = {
        findOne: jest.fn().mockResolvedValue({
          id: payoutId,
          user_id: userId,
          status: PayoutRequestStatus.REQUESTED,
          amount: 500,
        }),
      };
      // Attach getAvailableBalanceForManager to the service-level mock so the service can call it
      return cb({ ...em });
    });
    await expect(service.approvePayoutRequest(payoutId, adminActorId))
      .rejects.toThrow('Insufficient balance');
  });

  // ─── Fix #3 ────────────────────────────────────────────────────────────────
  it('executeBatch: no APPROVED requests inside tx → throws BadRequestException', async () => {
    // After a first successful batch, APPROVED requests are gone (status=SENT).
    // Simulate by returning empty list from the in-tx query.
    (mockDataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => {
      const em = {
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          setLock: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),    // no APPROVED requests found inside tx
        }),
        save: jest.fn(),
        update: jest.fn(),
        findOne: jest.fn(),
      };
      return cb(em);
    });
    await expect(service.executeBatch(adminActorId))
      .rejects.toThrow('No approved payout requests to batch');
  });
});

