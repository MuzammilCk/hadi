jest.setTimeout(30000);

import { v4 as uuidv4 } from 'uuid';
import { HoldService } from '../../../src/modules/trust/holds/services/hold.service';
import {
  HoldStatus,
  HoldReasonType,
} from '../../../src/modules/trust/holds/entities/payout-hold.entity';

describe('HoldService', () => {
  let service: HoldService;
  let mockPayoutHoldRepo: any;
  let mockCommissionHoldRepo: any;
  let mockAuditService: any;
  let mockDataSource: any;

  beforeEach(() => {
    mockPayoutHoldRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      manager: {
        save: jest.fn(),
        create: jest.fn((_, d: any) => d),
        findOne: jest.fn(),
      },
    };
    mockCommissionHoldRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      manager: {
        save: jest.fn(),
        create: jest.fn((_, d: any) => d),
        findOne: jest.fn(),
      },
    };
    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    mockDataSource = {
      manager: {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockImplementation(async (_: any, d: any) => ({
          id: uuidv4(),
          ...d,
        })),
        create: jest.fn().mockImplementation((_: any, d: any) => d),
        update: jest.fn().mockResolvedValue({}),
      },
    };
  });

  function buildService() {
    service = new HoldService(
      mockPayoutHoldRepo,
      mockCommissionHoldRepo,
      mockAuditService,
      mockDataSource,
    );
  }

  it('placePayoutHold: idempotency — returns existing if key already exists', async () => {
    const existing = { id: uuidv4(), idempotency_key: 'test-hold-key' };
    mockDataSource.manager.findOne.mockResolvedValue(existing);
    buildService();

    const result = await service.placePayoutHold({
      userId: uuidv4(),
      reasonType: HoldReasonType.DISPUTE_OPEN,
      idempotencyKey: 'test-hold-key',
    });

    expect(result).toBe(existing);
    // Save should NOT have been called since we returned early
    expect(mockDataSource.manager.save).not.toHaveBeenCalled();
  });

  it('placePayoutHold: creates new hold when no existing key', async () => {
    mockDataSource.manager.findOne.mockResolvedValue(null);
    const holdId = uuidv4();
    mockDataSource.manager.save.mockResolvedValue({
      id: holdId,
      status: HoldStatus.ACTIVE,
    });
    buildService();

    const result = await service.placePayoutHold({
      userId: uuidv4(),
      reasonType: HoldReasonType.FRAUD_REVIEW,
      idempotencyKey: uuidv4(),
    });

    expect(result.id).toBe(holdId);
    expect(result.status).toBe(HoldStatus.ACTIVE);
    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'payout_hold.placed' }),
      undefined,
    );
  });

  it('releasePayoutHold: throws if hold not found', async () => {
    mockDataSource.manager.findOne.mockResolvedValue(null);
    buildService();

    await expect(service.releasePayoutHold(uuidv4(), uuidv4())).rejects.toThrow(
      'Hold',
    );
  });

  it('releasePayoutHold: throws if hold already released', async () => {
    mockDataSource.manager.findOne.mockResolvedValue({
      id: uuidv4(),
      status: HoldStatus.RELEASED,
    });
    buildService();

    await expect(service.releasePayoutHold(uuidv4(), uuidv4())).rejects.toThrow(
      'already been released',
    );
  });

  it('placeCommissionHold: idempotency — returns existing if key already exists', async () => {
    const existing = { id: uuidv4(), idempotency_key: 'comm-hold-key' };
    mockDataSource.manager.findOne.mockResolvedValue(existing);
    buildService();

    const result = await service.placeCommissionHold({
      userId: uuidv4(),
      reasonType: HoldReasonType.RETURN_PENDING,
      idempotencyKey: 'comm-hold-key',
    });

    expect(result).toBe(existing);
  });
});
