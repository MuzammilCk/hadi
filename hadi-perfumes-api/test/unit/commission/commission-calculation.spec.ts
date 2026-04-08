jest.setTimeout(30000);

import { DataSource, EntityManager, Repository } from 'typeorm';
import { CommissionCalculationService } from '../../../src/modules/commission/services/commission-calculation.service';
import { AdminPolicyService } from '../../../src/modules/commission/services/admin-policy.service';
import { LedgerService } from '../../../src/modules/ledger/services/ledger.service';
import { CommissionEvent } from '../../../src/modules/commission/entities/commission-event.entity';
import { CommissionEventSource } from '../../../src/modules/commission/entities/commission-event-source.entity';
import { MoneyEventOutbox } from '../../../src/modules/order/entities/money-event-outbox.entity';
import { NetworkNode } from '../../../src/modules/network/entities/network-node.entity';
import { QualificationState } from '../../../src/modules/network/entities/qualification-state.entity';
import { Order } from '../../../src/modules/order/entities/order.entity';
import { LedgerEntryType, LedgerEntryStatus } from '../../../src/modules/ledger/entities/ledger-entry.entity';
import { v4 as uuidv4 } from 'uuid';

describe('CommissionCalculationService', () => {
  let service: CommissionCalculationService;
  let mockOutboxRepo: Partial<Repository<MoneyEventOutbox>>;
  let mockCommissionEventRepo: Partial<Repository<CommissionEvent>>;
  let mockSourceRepo: Partial<Repository<CommissionEventSource>>;
  let mockNetworkNodeRepo: Partial<Repository<NetworkNode>>;
  let mockQualStateRepo: Partial<Repository<QualificationState>>;
  let mockOrderRepo: Partial<Repository<Order>>;
  let mockAdminPolicyService: Partial<AdminPolicyService>;
  let mockLedgerService: Partial<LedgerService>;
  let mockDataSource: Partial<DataSource>;

  const rootId = uuidv4();
  const sponsorId = uuidv4();
  const buyerId = uuidv4();
  const orderId = uuidv4();
  const policyId = uuidv4();
  const ruleL1Id = uuidv4();
  const ruleL2Id = uuidv4();
  const outboxId = uuidv4();

  const makeOutboxEvent = (overrides: Partial<MoneyEventOutbox> = {}): MoneyEventOutbox => ({
    id: outboxId,
    event_type: 'order.paid',
    aggregate_id: orderId,
    published: false,
    published_at: null,
    created_at: new Date(),
    payload: {
      order_id: orderId,
      buyer_id: buyerId,
      total_amount: 1000,
      currency: 'INR',
      paid_at: new Date().toISOString(),
    },
    ...overrides,
  } as MoneyEventOutbox);

  const makePolicy = () => ({
    id: policyId,
    version: 1,
    name: 'Test Policy',
    status: 'active',
    commission_rules: [
      { id: ruleL1Id, level: 1, percentage: 0.10, min_order_value: 0, cap_per_order: null, payout_delay_days: 14, clawback_window_days: 30, eligible_categories: null, eligible_seller_statuses: null, created_at: new Date() },
      { id: ruleL2Id, level: 2, percentage: 0.05, min_order_value: 0, cap_per_order: null, payout_delay_days: 14, clawback_window_days: 30, eligible_categories: null, eligible_seller_statuses: null, created_at: new Date() },
    ],
  });

  let savedCommissionEvents: CommissionEvent[];
  let savedSources: CommissionEventSource[];
  let ledgerWriteCalls: any[];
  let transactionCallback: ((em: EntityManager) => Promise<void>) | null;

  beforeEach(() => {
    savedCommissionEvents = [];
    savedSources = [];
    ledgerWriteCalls = [];
    transactionCallback = null;

    const mockEm = {
      create: jest.fn((EntityClass: any, data: any) => ({ ...data, id: uuidv4() })),
      save: jest.fn(async (EntityClass: any, data: any) => {
        if (EntityClass === CommissionEvent || EntityClass.name === 'CommissionEvent') {
          const saved = { ...data, id: data.id || uuidv4() };
          savedCommissionEvents.push(saved);
          return saved;
        }
        if (EntityClass === CommissionEventSource || EntityClass.name === 'CommissionEventSource') {
          const saved = { ...data, id: data.id || uuidv4() };
          savedSources.push(saved);
          return saved;
        }
        return data;
      }),
      findOne: jest.fn(async (EntityClass: any, opts: any) => {
        if (EntityClass === QualificationState) {
          return { user_id: opts.where.user_id, is_qualified: true, is_active: true };
        }
        return null;
      }),
      update: jest.fn(async () => {}),
    } as unknown as EntityManager;

    mockOutboxRepo = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      findOne: jest.fn(),
    };

    mockCommissionEventRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };

    mockSourceRepo = {};
    mockNetworkNodeRepo = {
      findOne: jest.fn().mockResolvedValue({
        user_id: buyerId,
        // Fix C1 test: actual format is [immediate_sponsor, ..., root]
        // referral-validation.service.ts:100 builds [sponsorId, ...parentUplinePath]
        upline_path: JSON.stringify([sponsorId, rootId]),
      }),
    };
    mockQualStateRepo = {
      findOne: jest.fn().mockResolvedValue({ user_id: sponsorId, is_qualified: true }),
    };
    mockOrderRepo = {
      findOne: jest.fn().mockResolvedValue({ id: orderId, status: 'paid' }),
    };

    mockAdminPolicyService = {
      getCurrentActivePolicy: jest.fn().mockResolvedValue(makePolicy()),
    };

    mockLedgerService = {
      writeEntry: jest.fn().mockImplementation(async (params) => {
        ledgerWriteCalls.push(params);
        return { id: uuidv4(), ...params };
      }),
    };

    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        return cb(mockEm);
      }),
    };

    service = new CommissionCalculationService(
      mockOutboxRepo as any,
      mockCommissionEventRepo as any,
      mockSourceRepo as any,
      mockNetworkNodeRepo as any,
      mockQualStateRepo as any,
      mockOrderRepo as any,
      mockAdminPolicyService as any,
      mockLedgerService as any,
      mockDataSource as any,
    );
  });

  it('L1 upline receives correct percentage of order total', async () => {
    const event = makeOutboxEvent();
    await service.processOutboxEvent(event);

    // Fix C1: uplinePath[0] = immediate sponsor (level 1)
    const l1Event = savedCommissionEvents.find(e => e.commission_level === 1);
    expect(l1Event).toBeDefined();
    expect(l1Event!.calculated_amount).toBe(100);  // 1000 * 0.10
    expect(l1Event!.beneficiary_id).toBe(sponsorId);
  });

  it('L2 upline receives correct percentage', async () => {
    const event = makeOutboxEvent();
    await service.processOutboxEvent(event);

    const l2Event = savedCommissionEvents.find(e => e.commission_level === 2);
    expect(l2Event).toBeDefined();
    expect(l2Event!.calculated_amount).toBe(50);  // 1000 * 0.05
    expect(l2Event!.beneficiary_id).toBe(rootId);
  });

  it('cap_per_order applied when calculated_amount > cap', async () => {
    const policy = makePolicy();
    (policy.commission_rules[0] as any).cap_per_order = 50;
    (mockAdminPolicyService.getCurrentActivePolicy as jest.Mock).mockResolvedValue(policy);

    await service.processOutboxEvent(makeOutboxEvent());

    const l1Event = savedCommissionEvents.find(e => e.commission_level === 1);
    expect(l1Event!.calculated_amount).toBe(50);  // capped at 50, not 100
  });

  it('Buyer === L1 sponsor → commission skipped (self-purchase guard)', async () => {
    // Fix C1 test: format is [immediate_sponsor, ..., root]
    // buyer is their own immediate sponsor — should be skipped at level 1
    (mockNetworkNodeRepo.findOne as jest.Mock).mockResolvedValue({
      user_id: buyerId,
      upline_path: JSON.stringify([buyerId, rootId]),
    });

    await service.processOutboxEvent(makeOutboxEvent());

    const l1Event = savedCommissionEvents.find(e => e.commission_level === 1);
    expect(l1Event).toBeUndefined();  // buyer cannot earn commission on own order
  });

  it('Beneficiary is_qualified=false → commission skipped', async () => {
    const mockEm = (mockDataSource.transaction as jest.Mock).mock.calls[0];
    // Reset transaction mock to return unqualified state
    (mockDataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => {
      const em = {
        create: jest.fn((EntityClass: any, data: any) => ({ ...data, id: uuidv4() })),
        save: jest.fn(async (EntityClass: any, data: any) => data),
        findOne: jest.fn(async (EntityClass: any, opts: any) => {
          if (EntityClass === QualificationState) {
            return { user_id: opts.where.user_id, is_qualified: false };
          }
          return null;
        }),
        update: jest.fn(async () => {}),
      };
      return cb(em);
    });

    savedCommissionEvents = [];
    await service.processOutboxEvent(makeOutboxEvent());
    expect(savedCommissionEvents.length).toBe(0);
  });

  it('total_amount < min_order_value → level skipped', async () => {
    const policy = makePolicy();
    policy.commission_rules[0].min_order_value = 2000;  // L1 needs 2000 min
    (mockAdminPolicyService.getCurrentActivePolicy as jest.Mock).mockResolvedValue(policy);

    await service.processOutboxEvent(makeOutboxEvent());

    const l1Event = savedCommissionEvents.find(e => e.commission_level === 1);
    expect(l1Event).toBeUndefined();
    // L2 should still work since its min_order_value is 0
    const l2Event = savedCommissionEvents.find(e => e.commission_level === 2);
    expect(l2Event).toBeDefined();
  });

  it('Already-published outbox event is a no-op', async () => {
    const event = makeOutboxEvent({ published: true });
    await service.processOutboxEvent(event);

    expect(savedCommissionEvents.length).toBe(0);
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('UNIQUE constraint violation on idempotency_key → caught silently', async () => {
    (mockDataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => {
      const em = {
        create: jest.fn((EntityClass: any, data: any) => ({ ...data, id: uuidv4() })),
        save: jest.fn(async (EntityClass: any, data: any) => {
          if (EntityClass === CommissionEvent) {
            throw { code: '23505', message: 'UNIQUE constraint failed' };
          }
          return data;
        }),
        findOne: jest.fn(async (EntityClass: any, opts: any) => {
          if (EntityClass === QualificationState) {
            return { user_id: opts.where.user_id, is_qualified: true };
          }
          return null;
        }),
        update: jest.fn(async () => {}),
      };
      return cb(em);
    });

    // Should not throw
    await expect(service.processOutboxEvent(makeOutboxEvent())).resolves.not.toThrow();
  });

  it('available_after is correctly calculated as now + payout_delay_days * 86400000', async () => {
    await service.processOutboxEvent(makeOutboxEvent());

    const l1Event = savedCommissionEvents.find(e => e.commission_level === 1);
    expect(l1Event).toBeDefined();
    const now = new Date();
    const expected = new Date(now.getTime() + 14 * 86400000);
    // Allow 5 second delta for test execution time
    expect(Math.abs(l1Event!.available_after.getTime() - expected.getTime())).toBeLessThan(5000);
  });

  it('clawback_before is correctly calculated as available_after + clawback_window_days * 86400000', async () => {
    await service.processOutboxEvent(makeOutboxEvent());

    const l1Event = savedCommissionEvents.find(e => e.commission_level === 1);
    expect(l1Event).toBeDefined();
    const now = new Date();
    const availableAfter = new Date(now.getTime() + 14 * 86400000);
    const clawbackBefore = new Date(availableAfter.getTime() + 30 * 86400000);
    expect(Math.abs(l1Event!.clawback_before.getTime() - clawbackBefore.getTime())).toBeLessThan(5000);
  });

  it('processUnpublishedEvents polls only published=false, event_type=order.paid events', async () => {
    (mockOutboxRepo.find as jest.Mock).mockResolvedValue([]);
    await service.processUnpublishedEvents();

    expect(mockOutboxRepo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { event_type: 'order.paid', published: false },
    }));
  });

  it('Amounts are always parseFloat(x.toFixed(2))', async () => {
    const policy = makePolicy();
    policy.commission_rules[0].percentage = 0.033;  // 1000 * 0.033 = 33.0
    (mockAdminPolicyService.getCurrentActivePolicy as jest.Mock).mockResolvedValue(policy);

    await service.processOutboxEvent(makeOutboxEvent());

    const l1Event = savedCommissionEvents.find(e => e.commission_level === 1);
    expect(l1Event!.calculated_amount).toBe(33);
    // Verify it's a clean 2dp number
    expect(l1Event!.calculated_amount.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
  });
});
