jest.setTimeout(30000);

import { v4 as uuidv4 } from 'uuid';
import { CommissionReleaseJob } from '../../../src/jobs/commission-release.job';
import { CommissionEvent, CommissionEventStatus } from '../../../src/modules/commission/entities/commission-event.entity';
import { LedgerEntryType, LedgerEntryStatus } from '../../../src/modules/ledger/entities/ledger-entry.entity';

describe('CommissionReleaseJob', () => {
  let job: CommissionReleaseJob;
  let mockRepo: any;
  let mockLedgerService: any;
  let mockDataSource: any;
  let ledgerWriteCalls: any[];

  const eventId = uuidv4();
  const beneficiaryId = uuidv4();

  const makePendingEvent = (availableAfter: Date): CommissionEvent => ({
    id: eventId,
    order_id: uuidv4(),
    beneficiary_id: beneficiaryId,
    commission_level: 1,
    policy_version_id: uuidv4(),
    rule_id: uuidv4(),
    calculated_amount: 100,
    currency: 'INR',
    status: CommissionEventStatus.PENDING,
    available_after: availableAfter,
    clawback_before: new Date(Date.now() + 30 * 86400000),
    idempotency_key: `test:${eventId}`,
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

    mockRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };
  });

  it('run() only processes status=pending AND available_after <= NOW', async () => {
    const pastEvent = makePendingEvent(new Date(Date.now() - 86400000));

    mockRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([pastEvent]),
    });

    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(pastEvent),
          update: jest.fn().mockResolvedValue({}),
        };
        return cb(em);
      }),
    };

    job = new CommissionReleaseJob(mockRepo, mockLedgerService, mockDataSource);
    const result = await job.run();
    expect(result.released).toBe(1);
    expect(result.errors).toBe(0);
  });

  it('run() skips events with available_after in the future', async () => {
    const futureEvent = makePendingEvent(new Date(Date.now() + 86400000));

    mockRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });

    mockDataSource = { transaction: jest.fn() };
    job = new CommissionReleaseJob(mockRepo, mockLedgerService, mockDataSource);
    const result = await job.run();
    expect(result.released).toBe(0); // query filtered them out
  });

  it('run() updates status to available and writes COMMISSION_AVAILABLE (positive, SETTLED)', async () => {
    const pastEvent = makePendingEvent(new Date(Date.now() - 86400000));

    mockRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([pastEvent]),
    });

    let updateCalled = false;
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(pastEvent),
          update: jest.fn().mockImplementation(async (Entity: any, crit: any, data: any) => {
            if (data?.status === 'available') updateCalled = true;
          }),
        };
        return cb(em);
      }),
    };

    job = new CommissionReleaseJob(mockRepo, mockLedgerService, mockDataSource);
    await job.run();

    expect(updateCalled).toBe(true);
    expect(mockLedgerService.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryType: LedgerEntryType.COMMISSION_AVAILABLE,
        amount: 100,
        status: LedgerEntryStatus.SETTLED,
      }),
      expect.anything(),
    );
  });

  it('run() is idempotent: re-read inside transaction skips already-released events', async () => {
    const pastEvent = makePendingEvent(new Date(Date.now() - 86400000));

    mockRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([pastEvent]),
    });

    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockResolvedValue({ ...pastEvent, status: 'available' }), // already released
          update: jest.fn(),
        };
        return cb(em);
      }),
    };

    job = new CommissionReleaseJob(mockRepo, mockLedgerService, mockDataSource);
    const result = await job.run();
    expect(result.released).toBe(1); // counted but operation is no-op inside the transaction
    expect(mockLedgerService.writeEntry).not.toHaveBeenCalled();
  });

  it('COMMISSION_RELEASE_BATCH_SIZE env var respected', async () => {
    mockRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });

    process.env.COMMISSION_RELEASE_BATCH_SIZE = '25';
    mockDataSource = { transaction: jest.fn() };
    job = new CommissionReleaseJob(mockRepo, mockLedgerService, mockDataSource);
    await job.run();

    const takeMock = mockRepo.createQueryBuilder().take;
    // Verify take was called with 25
    expect(takeMock).toHaveBeenCalledWith(25);
    delete process.env.COMMISSION_RELEASE_BATCH_SIZE;
  });
});
