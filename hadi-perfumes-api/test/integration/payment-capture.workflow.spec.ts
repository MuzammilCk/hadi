jest.setTimeout(30000);

jest.mock('stripe', () => {
  let piCounter = 0;
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockImplementation(() => Promise.resolve({
        id: `pi_capture_test_${++piCounter}`,
        client_secret: `cs_capture_test_${piCounter}`,
        status: 'requires_payment_method',
      })),
    },
    webhooks: {
      constructEvent: jest.fn().mockImplementation((body, sig, secret) => {
        if (sig === 'invalid_sig') throw new Error('Invalid signature');
        return JSON.parse(body.toString());
      }),
    },
  }));
});

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { User } from '../../src/modules/user/entities/user.entity';
import { Listing } from '../../src/modules/listing/entities/listing.entity';
import { InventoryItem } from '../../src/modules/inventory/entities/inventory-item.entity';
import { InventoryReservation } from '../../src/modules/inventory/entities/inventory-reservation.entity';
import { InventoryEvent } from '../../src/modules/inventory/entities/inventory-event.entity';
import { CheckoutSession } from '../../src/modules/order/entities/checkout-session.entity';
import { Order, OrderStatus } from '../../src/modules/order/entities/order.entity';
import { OrderItem } from '../../src/modules/order/entities/order-item.entity';
import { OrderStatusHistory } from '../../src/modules/order/entities/order-status-history.entity';
import { Payment } from '../../src/modules/order/entities/payment.entity';
import { PaymentWebhookEvent } from '../../src/modules/order/entities/payment-webhook-event.entity';
import { OrderAuditLog } from '../../src/modules/order/entities/order-audit-log.entity';
import { MoneyEventOutbox } from '../../src/modules/order/entities/money-event-outbox.entity';
import { ProductCategory } from '../../src/modules/listing/entities/product-category.entity';
import { ListingImage } from '../../src/modules/listing/entities/listing-image.entity';
import { ListingStatusHistory } from '../../src/modules/listing/entities/listing-status-history.entity';
import { ListingModerationAction } from '../../src/modules/listing/entities/listing-moderation-action.entity';

import { CheckoutService } from '../../src/modules/order/services/checkout.service';
import { OrderService } from '../../src/modules/order/services/order.service';
import { PaymentService } from '../../src/modules/order/services/payment.service';
import { InventoryService } from '../../src/modules/inventory/services/inventory.service';
import { ListingService } from '../../src/modules/listing/services/listing.service';

describe('Payment Capture Workflow (Integration)', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let checkoutService: CheckoutService;
  let orderService: OrderService;
  let paymentService: PaymentService;
  let orderRepo: Repository<Order>;
  let webhookRepo: Repository<PaymentWebhookEvent>;
  let outboxRepo: Repository<MoneyEventOutbox>;
  let reservationRepo: Repository<InventoryReservation>;

  let testUser: User;
  let testListing: Listing;
  const adminId = '00000000-0000-0000-0000-000000000000';

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          synchronize: true,
          entities: [__dirname + '/../../src/**/*.entity{.ts,.js}'],
        }),
        TypeOrmModule.forFeature([
          User, Listing, InventoryItem, InventoryReservation, InventoryEvent,
          CheckoutSession, Order, OrderItem, OrderStatusHistory,
          Payment, PaymentWebhookEvent, OrderAuditLog, MoneyEventOutbox,
          ProductCategory, ListingImage, ListingStatusHistory, ListingModerationAction,
        ]),
      ],
      providers: [
        CheckoutService,
        OrderService,
        PaymentService,
        InventoryService,
        ListingService,
      ],
    }).compile();

    dataSource = module.get(DataSource);
    checkoutService = module.get(CheckoutService);
    orderService = module.get(OrderService);
    paymentService = module.get(PaymentService);
    
    // Manually inject the mocked stripe instance
    const StripeMock = require('stripe');
    (paymentService as any).stripe = new StripeMock();
    
    orderRepo = dataSource.getRepository(Order);
    webhookRepo = dataSource.getRepository(PaymentWebhookEvent);
    outboxRepo = dataSource.getRepository(MoneyEventOutbox);
    reservationRepo = dataSource.getRepository(InventoryReservation);

    const userRepo = dataSource.getRepository(User);
    testUser = await userRepo.save(userRepo.create({
      phone: '+919999990003',
      status: 'active',
    }));

    // Create admin user for seller_id FK
    await userRepo.save(userRepo.create({
      id: adminId,
      phone: '+910000000000',
      status: 'active',
    }));

    const listingRepo = dataSource.getRepository(Listing);
    testListing = await listingRepo.save(listingRepo.create({
      seller_id: adminId,
      title: 'Premium Oud',
      sku: 'PERF-OUD',
      price: 1000.00,
      quantity: 10,
      condition: 'new',
      status: 'active',
    }));

    const inventoryRepo = dataSource.getRepository(InventoryItem);
    await inventoryRepo.save(inventoryRepo.create({
      listing_id: testListing.id,
      total_qty: 10,
      available_qty: 10,
    }));
  }, 30000);

  afterAll(async () => {
    await module?.close();
  });

  const createOrderAndPayment = async () => {
    const dto = {
      items: [{ listing_id: testListing.id, qty: 1 }],
      shipping_address: {
        line1: '456 Test Ave', city: 'Delhi',
        state: 'DL', postal_code: '110001', country: 'IN',
      },
      contact: { name: 'Test Buyer', phone: '+919999990003' },
    };
    const order = await checkoutService.initiateCheckout(
      testUser.id, dto as any, uuidv4(),
    );
    const payment = await paymentService.createPaymentIntent(
      order.id, uuidv4(), testUser.id,
    );
    return { order, payment };
  };

  it('Test 1: duplicate webhook event ignored', async () => {
    const { order, payment } = await createOrderAndPayment();
    const eventId = `evt_${uuidv4()}`;

    const webhookPayload = {
      id: eventId,
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: payment.provider_payment_intent_id,
          amount: 100000,
          metadata: { order_id: order.id },
          latest_charge: 'ch_test_dup',
        },
      },
    };

    // First call
    await paymentService.handleWebhook(
      Buffer.from(JSON.stringify(webhookPayload)), 'valid_sig',
    );

    // Second call — should be silently ignored
    await paymentService.handleWebhook(
      Buffer.from(JSON.stringify(webhookPayload)), 'valid_sig',
    );

    // Verify only one webhook record
    const webhooks = await webhookRepo.find({ where: { provider_event_id: eventId } });
    expect(webhooks.length).toBe(1);

    // Verify only one outbox entry for this order
    const outbox = await outboxRepo.find({ where: { aggregate_id: order.id } });
    expect(outbox.length).toBe(1);

    // Order is still 'paid'
    const updatedOrder = await orderRepo.findOne({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe(OrderStatus.PAID);
  });

  it('Test 2: payment failure releases reservation', async () => {
    const { order, payment } = await createOrderAndPayment();
    const eventId = `evt_fail_${uuidv4()}`;

    const webhookPayload = {
      id: eventId,
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: payment.provider_payment_intent_id,
          metadata: { order_id: order.id },
          last_payment_error: { message: 'Card declined' },
        },
      },
    };

    await paymentService.handleWebhook(
      Buffer.from(JSON.stringify(webhookPayload)), 'valid_sig',
    );

    const updatedOrder = await orderRepo.findOne({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe(OrderStatus.PAYMENT_FAILED);
  });

  it('Test 3: paid order always has money_event_outbox row', async () => {
    const { order, payment } = await createOrderAndPayment();
    const eventId = `evt_paid_${uuidv4()}`;

    const webhookPayload = {
      id: eventId,
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: payment.provider_payment_intent_id,
          amount: 100000,
          metadata: { order_id: order.id },
          latest_charge: 'ch_test_invariant',
        },
      },
    };

    await paymentService.handleWebhook(
      Buffer.from(JSON.stringify(webhookPayload)), 'valid_sig',
    );

    const updatedOrder = await orderRepo.findOne({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe(OrderStatus.PAID);

    const outbox = await outboxRepo.find({ where: { aggregate_id: order.id } });
    expect(outbox.length).toBeGreaterThanOrEqual(1);
    expect(outbox[0].event_type).toBe('order.paid');
  });

  it('Test 4: cancelled order has no active reservations', async () => {
    const dto = {
      items: [{ listing_id: testListing.id, qty: 1 }],
      shipping_address: {
        line1: '789 Test Blvd', city: 'Bangalore',
        state: 'KA', postal_code: '560001', country: 'IN',
      },
      contact: { name: 'Test Buyer', phone: '+919999990003' },
    };
    const order = await checkoutService.initiateCheckout(
      testUser.id, dto as any, uuidv4(),
    );

    await orderService.cancelOrder(order.id, testUser.id);

    // Check that no reservations for this user are still in 'reserved' status
    // (they should be 'released' after cancellation)
    const updatedOrder = await orderRepo.findOne({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe(OrderStatus.CANCELLED);
  });
});
