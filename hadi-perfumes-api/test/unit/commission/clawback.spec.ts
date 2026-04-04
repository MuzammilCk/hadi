jest.setTimeout(30000);

import { v4 as uuidv4 } from 'uuid';
import { ClawbackJob } from '../../../src/jobs/clawback.job';
import { CommissionEvent, CommissionEventStatus } from '../../../src/modules/commission/entities/commission-event.entity';
import { LedgerEntryType, LedgerEntryStatus } from '../../../src/modules/ledger/entities/ledger-entry.entity';

describe('ClawbackJob', () => {
  let job: ClawbackJob;
  let mockRepo: any;
  let mockLedgerService: any;
  let mockDataSource: any;
  let ledgerWriteCalls: any[];

  const orderId = uuidv4();
  const beneficiaryId = uuidv4();

  const makeEvent = (status: string, clawbackBefore: Date): CommissionEvent => ({
    id: uuidv4(),
    order_id: orderId,
    beneficiary_id: beneficiaryId,
    commission_level: 1,
    policy_version_id: uuidv4(),
    rule_id: uuidv4(),
    calculated_amount: 100,
    currency: 'INR',
    status,
    available_after: new Date(Date.now() - 86400000),
    clawback_before: clawbackBefore,
    idempotency_key: `test:${uuidv4()}`,
    created_at: new Date(),
    updated_at: new Date(),
  });

  beforeEach(() => {
    ledgerWriteCalls = [];

    mockLedgerService = {
      writeEntry: jest.fn().mockImplementation(async (params: any) => {
        ledgerWriteCalls.push(params);
        return { id: uuidv4(), ...params };
      }),
    };
  });

  it('pending event → status=clawed_back, COMMISSION_REVERSED entry (negative, REVERSED)', async () => {
    const pendingEvent = makeEvent('pending', new Date(Date.now() + 30 * 86400000));
    mockRepo = { find: jest.fn().mockResolvedValue([pendingEvent]) };
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(pendingEvent),
          update: jest.fn().mockResolvedValue({}),
        };
        return cb(em);
      }),
    };

    job = new ClawbackJob(mockRepo, mockLedgerService, mockDataSource);
    const result = await job.clawbackForOrder(orderId);

    expect(result.clawedBack).toBe(1);
    expect(mockLedgerService.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryType: LedgerEntryType.COMMISSION_REVERSED,
        amount: -100,
        status: LedgerEntryStatus.REVERSED,
      }),
      expect.anything(),
    );
  });

  it('available event (within window) → status=clawed_back, CLAWBACK entry (negative, REVERSED)', async () => {
    const availableEvent = makeEvent('available', new Date(Date.now() + 30 * 86400000));
    mockRepo = { find: jest.fn().mockResolvedValue([availableEvent]) };
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(availableEvent),
          update: jest.fn().mockResolvedValue({}),
        };
        return cb(em);
      }),
    };

    job = new ClawbackJob(mockRepo, mockLedgerService, mockDataSource);
    const result = await job.clawbackForOrder(orderId);

    expect(result.clawedBack).toBe(1);
    expect(mockLedgerService.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryType: LedgerEntryType.CLAWBACK,
        amount: -100,
        status: LedgerEntryStatus.REVERSED,
      }),
      expect.anything(),
    );
  });

  it('paid event → skipped', async () => {
    const paidEvent = makeEvent('paid', new Date(Date.now() + 30 * 86400000));
    mockRepo = { find: jest.fn().mockResolvedValue([paidEvent]) };
    mockDataSource = { transaction: jest.fn() };

    job = new ClawbackJob(mockRepo, mockLedgerService, mockDataSource);
    const result = await job.clawbackForOrder(orderId);

    expect(result.skipped).toBe(1);
    expect(result.clawedBack).toBe(0);
  });

  it('clawed_back event → skipped', async () => {
    const clawedBackEvent = makeEvent('clawed_back', new Date(Date.now() + 30 * 86400000));
    mockRepo = { find: jest.fn().mockResolvedValue([clawedBackEvent]) };
    mockDataSource = { transaction: jest.fn() };

    job = new ClawbackJob(mockRepo, mockLedgerService, mockDataSource);
    const result = await job.clawbackForOrder(orderId);

    expect(result.skipped).toBe(1);
    expect(result.clawedBack).toBe(0);
  });

  it('voided event → skipped', async () => {
    const voidedEvent = makeEvent('voided', new Date(Date.now() + 30 * 86400000));
    mockRepo = { find: jest.fn().mockResolvedValue([voidedEvent]) };
    mockDataSource = { transaction: jest.fn() };

    job = new ClawbackJob(mockRepo, mockLedgerService, mockDataSource);
    const result = await job.clawbackForOrder(orderId);

    expect(result.skipped).toBe(1);
    expect(result.clawedBack).toBe(0);
  });

  it('available event past clawback_before → skipped with warning', async () => {
    const pastWindowEvent = makeEvent('available', new Date(Date.now() - 86400000));
    mockRepo = { find: jest.fn().mockResolvedValue([pastWindowEvent]) };
    mockDataSource = { transaction: jest.fn() };

    job = new ClawbackJob(mockRepo, mockLedgerService, mockDataSource);
    const result = await job.clawbackForOrder(orderId);

    expect(result.skipped).toBe(1);
    expect(result.clawedBack).toBe(0);
  });

  it('clawback amounts are negative numbers', async () => {
    const pendingEvent = makeEvent('pending', new Date(Date.now() + 30 * 86400000));
    mockRepo = { find: jest.fn().mockResolvedValue([pendingEvent]) };
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(pendingEvent),
          update: jest.fn().mockResolvedValue({}),
        };
        return cb(em);
      }),
    };

    job = new ClawbackJob(mockRepo, mockLedgerService, mockDataSource);
    await job.clawbackForOrder(orderId);

    const call = ledgerWriteCalls[0];
    expect(call.amount).toBeLessThan(0);
    expect(call.amount).toBe(-100);
  });
});
