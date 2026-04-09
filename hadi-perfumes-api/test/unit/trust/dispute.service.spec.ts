jest.setTimeout(30000);

import { v4 as uuidv4 } from 'uuid';
import { DisputeService } from '../../../src/modules/trust/disputes/services/dispute.service';
import { DisputeStatus, DisputeResolution, DisputeReasonCode } from '../../../src/modules/trust/disputes/entities/dispute.entity';

describe('DisputeService', () => {
  let service: DisputeService;
  let mockDisputeRepo: any;
  let mockEvidenceRepo: any;
  let mockStatusHistoryRepo: any;
  let mockResolutionEventRepo: any;
  let mockOrderRepo: any;
  let mockHoldService: any;
  let mockAuditService: any;
  let mockDataSource: any;

  const buyerId = uuidv4();
  const orderId = uuidv4();

  const makeOrder = (status = 'delivered') => ({
    id: orderId,
    buyer_id: buyerId,
    status,
  });

  beforeEach(() => {
    mockDisputeRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };
    mockEvidenceRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (d: any) => ({ id: uuidv4(), ...d })),
      create: jest.fn().mockImplementation((d: any) => d),
    };
    mockStatusHistoryRepo = {};
    mockResolutionEventRepo = {};
    mockOrderRepo = {};
    mockHoldService = {
      placePayoutHold: jest.fn().mockResolvedValue({ id: uuidv4() }),
      releasePayoutHoldByRef: jest.fn().mockResolvedValue(undefined),
    };
    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
  });

  function buildService() {
    service = new DisputeService(
      mockDisputeRepo,
      mockEvidenceRepo,
      mockStatusHistoryRepo,
      mockResolutionEventRepo,
      mockOrderRepo,
      mockHoldService,
      mockAuditService,
      mockDataSource,
    );
  }

  it('openDispute: idempotency — returns existing if key already exists', async () => {
    const existing = { id: uuidv4(), idempotency_key: 'dup-key' };
    mockDisputeRepo.findOne.mockResolvedValue(existing);
    mockDataSource = { transaction: jest.fn() };
    buildService();

    const result = await service.openDispute(buyerId, {
      order_id: orderId,
      reason_code: DisputeReasonCode.ITEM_NOT_RECEIVED,
      idempotency_key: 'dup-key',
    }, 'dup-key');

    expect(result).toBe(existing);
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('openDispute: rejects if order does not belong to buyer', async () => {
    const wrongBuyer = uuidv4();
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockResolvedValueOnce(makeOrder()),
          save: jest.fn(),
        };
        return cb(em);
      }),
    };
    buildService();

    await expect(service.openDispute(wrongBuyer, {
      order_id: orderId,
      reason_code: DisputeReasonCode.ITEM_NOT_RECEIVED,
      idempotency_key: uuidv4(),
    }, uuidv4())).rejects.toThrow('order does not belong to this buyer');
  });

  it('openDispute: rejects if duplicate open dispute exists', async () => {
    const existingOpen = { id: uuidv4(), status: DisputeStatus.OPEN };
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn()
            .mockResolvedValueOnce(makeOrder())
            .mockResolvedValueOnce(existingOpen),
          save: jest.fn(),
        };
        return cb(em);
      }),
    };
    buildService();

    await expect(service.openDispute(buyerId, {
      order_id: orderId,
      reason_code: DisputeReasonCode.ITEM_NOT_RECEIVED,
      idempotency_key: uuidv4(),
    }, uuidv4())).rejects.toThrow('An open or under_review dispute already exists');
  });

  it('resolveDispute: rejects if dispute is already closed', async () => {
    const closedDispute = { id: uuidv4(), status: DisputeStatus.CLOSED };
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = { findOne: jest.fn().mockResolvedValue(closedDispute) };
        return cb(em);
      }),
    };
    buildService();

    await expect(service.resolveDispute(closedDispute.id, uuidv4(), {
      resolution: DisputeResolution.REFUND_GRANTED,
    })).rejects.toThrow("Dispute in status 'closed' cannot be resolved");
  });

  it('escalateDispute: rejects if dispute is resolved', async () => {
    const resolvedDispute = { id: uuidv4(), status: DisputeStatus.RESOLVED };
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = { findOne: jest.fn().mockResolvedValue(resolvedDispute) };
        return cb(em);
      }),
    };
    buildService();

    await expect(service.escalateDispute(resolvedDispute.id, uuidv4()))
      .rejects.toThrow("Cannot transition dispute from 'resolved' to 'escalated'");
  });

  it('submitEvidence: rejects if dispute is closed', async () => {
    mockDisputeRepo.findOne.mockResolvedValue({
      id: uuidv4(),
      status: DisputeStatus.CLOSED,
    });
    mockDataSource = {};
    buildService();

    await expect(service.submitEvidence(uuidv4(), buyerId, {
      file_key: 'test/file.jpg',
    })).rejects.toThrow('Dispute is already closed');
  });

  it('getDispute: throws if not found', async () => {
    mockDataSource = {};
    buildService();

    await expect(service.getDispute(uuidv4())).rejects.toThrow('Dispute');
  });
});
