jest.setTimeout(30000);

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_admin_test',
        client_secret: 'cs_admin_test',
        status: 'requires_payment_method',
      }),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  }));
});

const request = require('supertest');

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { OrderModule } from '../../src/modules/order/order.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { ListingModule } from '../../src/modules/listing/listing.module';
import { InventoryModule } from '../../src/modules/inventory/inventory.module';
import { ReferralModule } from '../../src/modules/referral/referral.module';
import { UserModule } from '../../src/modules/user/user.module';

import { User } from '../../src/modules/user/entities/user.entity';
import { Listing } from '../../src/modules/listing/entities/listing.entity';
import { InventoryItem } from '../../src/modules/inventory/entities/inventory-item.entity';
import {
  Order,
  OrderStatus,
} from '../../src/modules/order/entities/order.entity';
import { OrderAuditLog } from '../../src/modules/order/entities/order-audit-log.entity';
import { OrderStatusHistory } from '../../src/modules/order/entities/order-status-history.entity';

describe('Admin Order E2E', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let dataSource: DataSource;
  let buyerToken: string;
  let testUser: User;
  let testListing: Listing;
  let testOrderId: string;
  const adminToken = 'test-admin-token-e2e';

  beforeAll(async () => {
    process.env.ADMIN_TOKEN = adminToken;
    process.env.ADMIN_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          synchronize: true,
          entities: [__dirname + '/../../src/**/*.entity{.ts,.js}'],
        }),
        AuthModule,
        ReferralModule,
        UserModule,
        ListingModule,
        InventoryModule,
        OrderModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    jwtService = moduleFixture.get(JwtService);

    // Create test user
    const userRepo = dataSource.getRepository(User);
    testUser = await userRepo.save(
      userRepo.create({
        phone: '+919000000010',
        status: 'active',
      }),
    );
    buyerToken = jwtService.sign({ sub: testUser.id, phone: testUser.phone });

    // Create admin user for seller_id FK
    await userRepo.save(
      userRepo.create({
        id: process.env.ADMIN_ACTOR_ID,
        phone: '+910000000000',
        status: 'active',
      }),
    );

    // Create test listing + inventory
    const listingRepo = dataSource.getRepository(Listing);
    testListing = await listingRepo.save(
      listingRepo.create({
        seller_id: process.env.ADMIN_ACTOR_ID,
        title: 'Admin Test Perfume',
        sku: 'ADMIN-PERF-001',
        price: 500.0,
        quantity: 50,
        condition: 'new',
        status: 'active',
      }),
    );

    const inventoryRepo = dataSource.getRepository(InventoryItem);
    await inventoryRepo.save(
      inventoryRepo.create({
        listing_id: testListing.id,
        total_qty: 50,
        available_qty: 50,
      }),
    );

    // Create a test order
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        items: [{ listing_id: testListing.id, qty: 1 }],
        shipping_address: {
          line1: '789 Admin St',
          city: 'Chennai',
          state: 'TN',
          postal_code: '600001',
          country: 'IN',
        },
        contact: { name: 'Admin Test', phone: '+919000000010' },
      });
    testOrderId = orderRes.body.id;
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  it('1. GET /admin/orders without x-admin-token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/admin/orders');

    expect(res.status).toBe(401);
  });

  it('2. GET /admin/orders with x-admin-token → 200 with paginated structure', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/orders')
      .set('x-admin-token', adminToken);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('3. GET /admin/orders/:id with valid order → 200', async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/orders/${testOrderId}`)
      .set('x-admin-token', adminToken);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testOrderId);
  });

  it('4. PATCH /admin/orders/:id/status with valid transition → 200', async () => {
    // Create another order for this test
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        items: [{ listing_id: testListing.id, qty: 1 }],
        shipping_address: {
          line1: '100 Status St',
          city: 'Kolkata',
          state: 'WB',
          postal_code: '700001',
          country: 'IN',
        },
        contact: { name: 'Status Test', phone: '+919000000010' },
      });

    // Transition from 'created' → 'cancelled' (valid)
    const statusRes = await request(app.getHttpServer())
      .patch(`/admin/orders/${orderRes.body.id}/status`)
      .set('x-admin-token', adminToken)
      .send({ status: 'cancelled', reason: 'Admin test cancellation' });

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe('cancelled');

    // Verify audit log
    const auditRepo = dataSource.getRepository(OrderAuditLog);
    const audits = await auditRepo.find({
      where: { order_id: orderRes.body.id },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0].action).toBe('status_change');
    expect(audits[0].actor_type).toBe('admin');

    // Verify status history
    const historyRepo = dataSource.getRepository(OrderStatusHistory);
    const history = await historyRepo.find({
      where: { order_id: orderRes.body.id },
    });
    const cancelledEntry = history.find((h) => h.to_status === 'cancelled');
    expect(cancelledEntry).toBeDefined();
    expect(cancelledEntry!.actor_type).toBe('admin');
  });

  it('5. PATCH /admin/orders/:id/status with invalid transition → 422', async () => {
    // testOrderId is in 'created' status, trying to jump to 'paid'
    const res = await request(app.getHttpServer())
      .patch(`/admin/orders/${testOrderId}/status`)
      .set('x-admin-token', adminToken)
      .send({ status: 'paid' });

    expect(res.status).toBe(422);
  });

  it('6. PATCH /admin/orders/:id/status with terminal status → 422', async () => {
    // Create and cancel an order
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        items: [{ listing_id: testListing.id, qty: 1 }],
        shipping_address: {
          line1: '200 Terminal St',
          city: 'Pune',
          state: 'MH',
          postal_code: '411001',
          country: 'IN',
        },
        contact: { name: 'Terminal Test', phone: '+919000000010' },
      });

    // Cancel it
    await request(app.getHttpServer())
      .patch(`/admin/orders/${orderRes.body.id}/status`)
      .set('x-admin-token', adminToken)
      .send({ status: 'cancelled' });

    // Now try to transition from cancelled → paid (should fail)
    const res = await request(app.getHttpServer())
      .patch(`/admin/orders/${orderRes.body.id}/status`)
      .set('x-admin-token', adminToken)
      .send({ status: 'paid' });

    expect(res.status).toBe(422);
  });
});
