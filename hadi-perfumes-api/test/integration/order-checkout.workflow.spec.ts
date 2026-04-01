jest.setTimeout(30000);

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_test_123',
        client_secret: 'cs_test_123',
        status: 'requires_payment_method',
      }),
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

// Entities
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

// Services
import { CheckoutService } from '../../src/modules/order/services/checkout.service';
import { OrderService } from '../../src/modules/order/services/order.service';
import { PaymentService } from '../../src/modules/order/services/payment.service';
import { InventoryService } from '../../src/modules/inventory/services/inventory.service';
import { ListingService } from '../../src/modules/listing/services/listing.service';

describe('Order Checkout Workflow (Integration)', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let checkoutService: CheckoutService;
  let orderService: OrderService;
  let paymentService: PaymentService;
  let userRepo: Repository<User>;
  let listingRepo: Repository<Listing>;
  let inventoryRepo: Repository<InventoryItem>;
  let reservationRepo: Repository<InventoryReservation>;
  let orderRepo: Repository<Order>;
  let historyRepo: Repository<OrderStatusHistory>;
  let outboxRepo: Repository<MoneyEventOutbox>;

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
    userRepo = dataSource.getRepository(User);
    listingRepo = dataSource.getRepository(Listing);
    inventoryRepo = dataSource.getRepository(InventoryItem);
    reservationRepo = dataSource.getRepository(InventoryReservation);
    orderRepo = dataSource.getRepository(Order);
    historyRepo = dataSource.getRepository(OrderStatusHistory);
    outboxRepo = dataSource.getRepository(MoneyEventOutbox);

    // Create test user
    testUser = await userRepo.save(userRepo.create({
      phone: '+919999990001',
      status: 'active',
    }));

    // Create admin user for seller_id FK
    const adminUser = await userRepo.save(userRepo.create({
      id: adminId,
      phone: '+910000000000',
      status: 'active',
    }));

    // Create test listing with inventory
    testListing = await listingRepo.save(listingRepo.create({
      seller_id: adminUser.id,
      title: 'Test Perfume',
      sku: 'PERF-001',
      price: 250.00,
      quantity: 10,
      condition: 'new',
      status: 'active',
    }));

    await inventoryRepo.save(inventoryRepo.create({
      listing_id: testListing.id,
      total_qty: 5,
      available_qty: 5,
    }));
  }, 30000);

  afterAll(async () => {
    await module?.close();
  });

  const createValidDto = () => ({
    items: [{ listing_id: testListing.id, qty: 1 }],
    shipping_address: {
      line1: '123 Test St',
      city: 'Mumbai',
      state: 'Maharashtra',
      postal_code: '400001',
      country: 'IN',
    },
    contact: { name: 'Test Buyer', phone: '+919999990001' },
  });

  it('Test 1: initiateCheckout creates order + reservation', async () => {
    const dto = createValidDto();
    const idempotencyKey = uuidv4();
    const order = await checkoutService.initiateCheckout(
      testUser.id, dto as any, idempotencyKey,
    );

    expect(order).toBeDefined();
    expect(order.status).toBe(OrderStatus.CREATED);
    expect(order.buyer_id).toBe(testUser.id);
    expect(order.idempotency_key).toBe(idempotencyKey);

    // Verify reservation exists
    const reservations = await reservationRepo.find({ where: { reserved_by_user_id: testUser.id } });
    expect(reservations.length).toBeGreaterThanOrEqual(1);
    const lastRes = reservations[reservations.length - 1];
    expect(lastRes.status).toBe('reserved');

    // Verify inventory decreased
    const item = await inventoryRepo.findOne({ where: { listing_id: testListing.id } });
    expect(item).toBeDefined();
    expect(Number(item!.available_qty)).toBeLessThan(5);

    // Verify status history
    const history = await historyRepo.find({ where: { order_id: order.id } });
    expect(history.length).toBe(1);
    expect(history[0].from_status).toBeNull();
    expect(history[0].to_status).toBe(OrderStatus.CREATED);
  });

  it('Test 2: same idempotency_key returns same order', async () => {
    const dto = createValidDto();
    const idempotencyKey = uuidv4();
    const first = await checkoutService.initiateCheckout(
      testUser.id, dto as any, idempotencyKey,
    );
    const second = await checkoutService.initiateCheckout(
      testUser.id, dto as any, idempotencyKey,
    );
    expect(first.id).toBe(second.id);
  });

  it('Test 3: cancelOrder releases reservation', async () => {
    const dto = createValidDto();
    const idempotencyKey = uuidv4();
    const order = await checkoutService.initiateCheckout(
      testUser.id, dto as any, idempotencyKey,
    );

    const inventoryBefore = await inventoryRepo.findOne({ where: { listing_id: testListing.id } });
    const availableBefore = Number(inventoryBefore!.available_qty);

    const cancelled = await orderService.cancelOrder(order.id, testUser.id);
    expect(cancelled.status).toBe(OrderStatus.CANCELLED);

    // Verify inventory restored
    const inventoryAfter = await inventoryRepo.findOne({ where: { listing_id: testListing.id } });
    expect(Number(inventoryAfter!.available_qty)).toBe(availableBefore + 1);

    // Verify history has cancelled row
    const history = await historyRepo.find({ where: { order_id: order.id } });
    const cancelledEntry = history.find(h => h.to_status === OrderStatus.CANCELLED);
    expect(cancelledEntry).toBeDefined();
  });

  it('Test 4: webhook payment_intent.succeeded transitions to paid', async () => {
    const dto = createValidDto();
    const idempotencyKey = uuidv4();
    const order = await checkoutService.initiateCheckout(
      testUser.id, dto as any, idempotencyKey,
    );

    // Create payment intent
    const paymentIdempotencyKey = uuidv4();
    const payment = await paymentService.createPaymentIntent(
      order.id, paymentIdempotencyKey, testUser.id,
    );
    expect(payment.provider_payment_intent_id).toBe('pi_test_123');

    // Simulate webhook
    const webhookEvent = {
      id: `evt_${uuidv4()}`,
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_123',
          amount: 25000,
          metadata: { order_id: order.id },
          latest_charge: 'ch_test',
        },
      },
    };

    await paymentService.handleWebhook(
      Buffer.from(JSON.stringify(webhookEvent)),
      'valid_sig',
    );

    // Verify order status
    const updatedOrder = await orderRepo.findOne({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe(OrderStatus.PAID);

    // Verify outbox
    const outboxEntries = await outboxRepo.find({ where: { aggregate_id: order.id } });
    expect(outboxEntries.length).toBe(1);
    expect(outboxEntries[0].event_type).toBe('order.paid');

    // Verify history has paid row
    const history = await historyRepo.find({ where: { order_id: order.id } });
    const paidEntry = history.find(h => h.to_status === OrderStatus.PAID);
    expect(paidEntry).toBeDefined();
  });
});
