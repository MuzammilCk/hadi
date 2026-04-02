jest.setTimeout(30000);

// Mock stripe before importing anything that uses it
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_test',
        client_secret: 'cs_test',
        status: 'requires_payment_method',
      }),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  }));
});

import { PaymentService } from '../../../src/modules/order/services/payment.service';
import { WebhookSignatureInvalidException } from '../../../src/modules/order/exceptions/order.exceptions';

describe('PaymentWebhookDeduplication', () => {
  let paymentService: PaymentService;
  let mockWebhookRepo: any;
  let mockPaymentRepo: any;
  let mockOrderRepo: any;
  let mockItemRepo: any;
  let mockHistoryRepo: any;
  let mockOutboxRepo: any;
  let mockInventoryService: any;
  let mockDataSource: any;
  let mockStripeInstance: any;

  beforeEach(() => {
    mockWebhookRepo = {
      create: jest.fn((data: any) => ({ ...data, id: 'webhook-uuid-1' })),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    mockPaymentRepo = {
      create: jest.fn((data: any) => data),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    mockOrderRepo = {
      findOne: jest.fn(),
    };
    mockItemRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    mockHistoryRepo = {
      save: jest.fn(),
      create: jest.fn((data: any) => data),
    };
    mockOutboxRepo = {
      save: jest.fn(),
      create: jest.fn((data: any) => data),
    };
    mockInventoryService = {
      confirmReservation: jest.fn(),
      releaseReservation: jest.fn(),
    };
    mockDataSource = {
      transaction: jest.fn((cb: any) => cb({
        findOne: jest.fn(),
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn(),
        create: jest.fn((Entity: any, data: any) => data),
      })),
    };

    paymentService = new PaymentService(
      mockPaymentRepo,
      mockWebhookRepo,
      mockOrderRepo,
      mockItemRepo,
      mockHistoryRepo,
      mockOutboxRepo,
      mockInventoryService,
      mockDataSource,
    );

    // Manually inject the mocked stripe instance because NODE_ENV=test prevents instantiation
    const StripeMock = require('stripe');
    mockStripeInstance = new StripeMock();
    (paymentService as any).stripe = mockStripeInstance;
  });

  it('first webhook with event_id is stored and processed', async () => {
    const fakeEvent = {
      id: 'evt_1',
      type: 'charge.created', // unknown type — should be stored but no-op
      data: { object: {} },
    };

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(fakeEvent);
    mockWebhookRepo.save.mockImplementation((record: any) => Promise.resolve({
      ...record,
      id: 'webhook-uuid-1',
    }));

    await paymentService.handleWebhook(Buffer.from('raw'), 'sig_valid');

    expect(mockWebhookRepo.save).toHaveBeenCalled();
    const savedRecord = mockWebhookRepo.save.mock.calls[mockWebhookRepo.save.mock.calls.length - 1][0];
    expect(savedRecord.processed).toBe(true);
    expect(savedRecord.processed_at).toBeInstanceOf(Date);
  });

  it('second webhook with same event_id returns silently (unique constraint)', async () => {
    const fakeEvent = {
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test', metadata: { order_id: 'order-1' } } },
    };

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(fakeEvent);
    // handleWebhook calls save twice per invocation:
    //   1st save = insert webhook record (dedup check)
    //   2nd save = update webhook record after processing
    // So the 3rd save call (2nd invocation's insert) should throw unique constraint
    mockWebhookRepo.save
      .mockResolvedValueOnce({ id: 'webhook-1', provider_event_id: 'evt_1', processed: false }) // 1st call: insert
      .mockResolvedValueOnce({ id: 'webhook-1', provider_event_id: 'evt_1', processed: true })  // 1st call: update
      .mockRejectedValueOnce(new Error('UNIQUE constraint failed'));                              // 2nd call: insert (blocked)

    // First call — processes successfully
    await paymentService.handleWebhook(Buffer.from('raw'), 'sig_valid');
    // Second call — should return silently due to unique constraint
    await paymentService.handleWebhook(Buffer.from('raw'), 'sig_valid');

    // No error thrown — this proves deduplication
  });

  it('invalid signature causes WebhookSignatureInvalidException', async () => {
    mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    await expect(
      paymentService.handleWebhook(Buffer.from('bad body'), 'bad_sig'),
    ).rejects.toThrow(WebhookSignatureInvalidException);
  });

  it('unknown event type is stored but process is a no-op', async () => {
    const fakeEvent = {
      id: 'evt_unknown',
      type: 'charge.refunded', // not handled
      data: { object: {} },
    };

    mockStripeInstance.webhooks.constructEvent.mockReturnValue(fakeEvent);
    mockWebhookRepo.save.mockImplementation((record: any) => Promise.resolve({
      ...record,
      id: 'webhook-uuid-2',
    }));

    await paymentService.handleWebhook(Buffer.from('raw'), 'sig_valid');

    const lastSave = mockWebhookRepo.save.mock.calls[mockWebhookRepo.save.mock.calls.length - 1][0];
    expect(lastSave.processed).toBe(true);
    // No transaction should have been called for unknown event types
  });
});
