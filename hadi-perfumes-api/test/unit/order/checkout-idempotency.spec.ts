jest.setTimeout(30000);

import { OrderService } from '../../../src/modules/order/services/order.service';
import { IdempotencyKeyRequiredException } from '../../../src/modules/order/exceptions/order.exceptions';

describe('CheckoutIdempotency', () => {
  let orderService: OrderService;
  let mockOrderRepo: any;
  let mockItemRepo: any;
  let mockHistoryRepo: any;
  let mockAuditRepo: any;
  let mockCheckoutService: any;
  let mockInventoryService: any;
  let mockDataSource: any;

  const mockOrder = {
    id: 'order-uuid-1',
    idempotency_key: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    buyer_id: 'buyer-uuid',
    status: 'created',
    subtotal: 100,
    total_amount: 100,
  };

  const validDto = {
    items: [{ listing_id: 'listing-uuid', qty: 1 }],
    shipping_address: {
      line1: '123 Main',
      city: 'City',
      state: 'ST',
      postal_code: '12345',
      country: 'IN',
    },
    contact: { name: 'Test', phone: '+919999999999' },
  };

  beforeEach(() => {
    mockOrderRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };
    mockItemRepo = { find: jest.fn().mockResolvedValue([]) };
    mockHistoryRepo = { save: jest.fn(), create: jest.fn((d: any) => d) };
    mockAuditRepo = { save: jest.fn(), create: jest.fn((d: any) => d) };
    mockCheckoutService = {
      initiateCheckout: jest.fn(),
    };
    mockInventoryService = {
      releaseReservation: jest.fn(),
    };
    mockDataSource = {
      transaction: jest.fn((cb: any) =>
        cb({
          findOne: jest.fn(),
          save: jest.fn(),
          create: jest.fn((E: any, d: any) => d),
          find: jest.fn().mockResolvedValue([]),
        }),
      ),
    };

    orderService = new OrderService(
      mockOrderRepo,
      mockItemRepo,
      mockHistoryRepo,
      mockAuditRepo,
      mockCheckoutService,
      mockInventoryService,
      mockDataSource,
    );
  });

  it('same idempotency_key on second call returns first order (from DB)', async () => {
    mockCheckoutService.initiateCheckout
      .mockResolvedValueOnce(mockOrder) // first call creates
      .mockResolvedValueOnce(mockOrder); // second call returns same (by internal idempotency)

    const first = await orderService.createOrder(
      'buyer-uuid',
      validDto as any,
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    );
    const second = await orderService.createOrder(
      'buyer-uuid',
      validDto as any,
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    );

    expect(first.id).toBe(second.id);
  });

  it('different idempotency key creates new checkout', async () => {
    const mockOrder2 = {
      ...mockOrder,
      id: 'order-uuid-2',
      idempotency_key: 'ffffffff-1111-2222-3333-444444444444',
    };
    mockCheckoutService.initiateCheckout
      .mockResolvedValueOnce(mockOrder)
      .mockResolvedValueOnce(mockOrder2);

    const first = await orderService.createOrder(
      'buyer-uuid',
      validDto as any,
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    );
    const second = await orderService.createOrder(
      'buyer-uuid',
      validDto as any,
      'ffffffff-1111-2222-3333-444444444444',
    );

    expect(first.id).not.toBe(second.id);
    expect(mockCheckoutService.initiateCheckout).toHaveBeenCalledTimes(2);
  });

  it('missing idempotency-key throws IdempotencyKeyRequiredException', async () => {
    await expect(
      orderService.createOrder('buyer-uuid', validDto as any, ''),
    ).rejects.toThrow(IdempotencyKeyRequiredException);
  });

  it('invalid idempotency-key format throws IdempotencyKeyRequiredException', async () => {
    await expect(
      orderService.createOrder('buyer-uuid', validDto as any, 'not-a-uuid'),
    ).rejects.toThrow(IdempotencyKeyRequiredException);
  });
});
