jest.setTimeout(30000);

import { v4 as uuidv4 } from 'uuid';
import { ReturnService } from '../../../src/modules/trust/returns/services/return.service';
import { ReturnRequestStatus, ReturnReasonCode } from '../../../src/modules/trust/returns/entities/return-request.entity';

describe('ReturnService', () => {
  let service: ReturnService;
  let mockReturnRequestRepo: any;
  let mockReturnItemRepo: any;
  let mockReturnEvidenceRepo: any;
  let mockStatusHistoryRepo: any;
  let mockResolutionEventRepo: any;
  let mockOrderRepo: any;
  let mockAuditService: any;
  let mockDataSource: any;

  const buyerId = uuidv4();
  const orderId = uuidv4();

  const makeOrder = (status = 'delivered', completedAt?: Date) => ({
    id: orderId,
    buyer_id: buyerId,
    status,
    completed_at: completedAt ?? new Date(),
    updated_at: new Date(),
  });

  beforeEach(() => {
    mockReturnRequestRepo = {
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
    mockReturnItemRepo = {};
    mockReturnEvidenceRepo = {};
    mockStatusHistoryRepo = {};
    mockResolutionEventRepo = {};
    mockOrderRepo = {};
    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
  });

  function buildService() {
    service = new ReturnService(
      mockReturnRequestRepo,
      mockReturnItemRepo,
      mockReturnEvidenceRepo,
      mockStatusHistoryRepo,
      mockResolutionEventRepo,
      mockOrderRepo,
      mockAuditService,
      mockDataSource,
    );
  }

  it('createReturn: idempotency — returns existing if key already exists', async () => {
    const existingReturn = { id: uuidv4(), idempotency_key: 'test-key-1' };
    mockReturnRequestRepo.findOne.mockResolvedValue(existingReturn);
    mockDataSource = { transaction: jest.fn() };
    buildService();

    const result = await service.createReturn(buyerId, {
      order_id: orderId,
      reason_code: ReturnReasonCode.DEFECTIVE,
      idempotency_key: 'test-key-1',
    }, 'test-key-1');

    expect(result).toBe(existingReturn);
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('createReturn: rejects if order status is not delivered/completed', async () => {
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn()
            .mockResolvedValueOnce(makeOrder('paid'))  // order lookup
            .mockResolvedValueOnce(null),              // no existing return
          save: jest.fn().mockImplementation(async (_: any, data: any) => ({ id: uuidv4(), ...data })),
        };
        return cb(em);
      }),
    };
    buildService();

    await expect(service.createReturn(buyerId, {
      order_id: orderId,
      reason_code: ReturnReasonCode.DEFECTIVE,
      idempotency_key: uuidv4(),
    }, uuidv4())).rejects.toThrow("order status 'paid' is not eligible for return");
  });

  it('createReturn: rejects if buyer does not own the order', async () => {
    const otherBuyer = uuidv4();
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockResolvedValueOnce(makeOrder('delivered')),
          save: jest.fn(),
        };
        return cb(em);
      }),
    };
    buildService();

    await expect(service.createReturn(otherBuyer, {
      order_id: orderId,
      reason_code: ReturnReasonCode.DEFECTIVE,
      idempotency_key: uuidv4(),
    }, uuidv4())).rejects.toThrow('order does not belong to this buyer');
  });

  it('createReturn: rejects if return window has expired', async () => {
    const pastDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn()
            .mockResolvedValueOnce(makeOrder('completed', pastDate))
            .mockResolvedValueOnce(null),
          save: jest.fn(),
        };
        return cb(em);
      }),
    };
    buildService();

    await expect(service.createReturn(buyerId, {
      order_id: orderId,
      reason_code: ReturnReasonCode.DEFECTIVE,
      idempotency_key: uuidv4(),
    }, uuidv4())).rejects.toThrow('Return window has expired');
  });

  it('createReturn: rejects if an open return already exists for the order', async () => {
    const existingOpenReturn = {
      id: uuidv4(),
      order_id: orderId,
      status: ReturnRequestStatus.PENDING_REVIEW,
    };

    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn()
            .mockResolvedValueOnce(makeOrder('delivered'))     // order
            .mockResolvedValueOnce(existingOpenReturn),        // open return
          save: jest.fn(),
        };
        return cb(em);
      }),
    };
    buildService();

    await expect(service.createReturn(buyerId, {
      order_id: orderId,
      reason_code: ReturnReasonCode.DEFECTIVE,
      idempotency_key: uuidv4(),
    }, uuidv4())).rejects.toThrow('An open or approved return already exists');
  });

  it('approveReturn: rejects if return is not in pending_review/escalated', async () => {
    const completedReturn = {
      id: uuidv4(),
      status: ReturnRequestStatus.COMPLETED,
    };
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(completedReturn),
        };
        return cb(em);
      }),
    };
    buildService();

    await expect(service.approveReturn(completedReturn.id, uuidv4(), 'ok'))
      .rejects.toThrow("Cannot transition return from 'completed' to 'approved'");
  });

  it('completeReturn: rejects if return is not in approved status', async () => {
    const pendingReturn = {
      id: uuidv4(),
      status: ReturnRequestStatus.PENDING_REVIEW,
    };
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(pendingReturn),
        };
        return cb(em);
      }),
    };
    buildService();

    await expect(service.completeReturn(pendingReturn.id, uuidv4()))
      .rejects.toThrow("Cannot transition return from 'pending_review' to 'completed'");
  });

  it('listMyReturns: returns paginated results', async () => {
    mockDataSource = {};
    buildService();

    const result = await service.listMyReturns(buyerId, { page: 1, limit: 10 });
    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 10 });
  });

  it('getReturn: throws if return not found', async () => {
    mockDataSource = {};
    buildService();

    await expect(service.getReturn(uuidv4())).rejects.toThrow('Return request');
  });
});
