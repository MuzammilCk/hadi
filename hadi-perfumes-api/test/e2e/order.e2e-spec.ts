jest.setTimeout(30000);

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_e2e_test',
        client_secret: 'cs_e2e_test',
        status: 'requires_payment_method',
      }),
    },
    webhooks: {
      constructEvent: jest.fn().mockImplementation(() => {
        throw new Error('Invalid signature');
      }),
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

// Order module
import { OrderModule } from '../../src/modules/order/order.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { ListingModule } from '../../src/modules/listing/listing.module';
import { InventoryModule } from '../../src/modules/inventory/inventory.module';
import { ReferralModule } from '../../src/modules/referral/referral.module';
import { UserModule } from '../../src/modules/user/user.module';

import { User } from '../../src/modules/user/entities/user.entity';
import { Listing } from '../../src/modules/listing/entities/listing.entity';
import { InventoryItem } from '../../src/modules/inventory/entities/inventory-item.entity';

describe('Order E2E', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let dataSource: DataSource;
  let buyerToken: string;
  let buyerToken2: string;
  let testUser: User;
  let testUser2: User;
  let testListing: Listing;
  let createdOrderId: string;

  beforeAll(async () => {
    process.env.ADMIN_TOKEN = 'test-admin-token';
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

    // Create test users
    const userRepo = dataSource.getRepository(User);
    testUser = await userRepo.save(
      userRepo.create({
        phone: '+919000000001',
        status: 'active',
      }),
    );
    testUser2 = await userRepo.save(
      userRepo.create({
        phone: '+919000000002',
        status: 'active',
      }),
    );

    buyerToken = jwtService.sign({ sub: testUser.id, phone: testUser.phone });
    buyerToken2 = jwtService.sign({
      sub: testUser2.id,
      phone: testUser2.phone,
    });

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
        title: 'E2E Test Perfume',
        sku: 'E2E-PERF-001',
        price: 350.0,
        quantity: 20,
        condition: 'new',
        status: 'active',
      }),
    );

    const inventoryRepo = dataSource.getRepository(InventoryItem);
    await inventoryRepo.save(
      inventoryRepo.create({
        listing_id: testListing.id,
        total_qty: 20,
        available_qty: 20,
      }),
    );
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  const validOrderPayload = () => ({
    items: [{ listing_id: testListing?.id, qty: 1 }],
    shipping_address: {
      line1: '123 E2E Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      postal_code: '400001',
      country: 'IN',
    },
    contact: {
      name: 'E2E Buyer',
      phone: '+919000000001',
    },
  });

  it('1. POST /orders without Idempotency-Key header → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(validOrderPayload());

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Idempotency-Key');
  });

  it('2. POST /orders with valid payload + Idempotency-Key → 201', async () => {
    const idempotencyKey = uuidv4();
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(validOrderPayload());

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('created');
    expect(res.body.buyer_id).toBe(testUser.id);
    createdOrderId = res.body.id;
  });

  it('3. POST /orders with same Idempotency-Key → 201 with same order id', async () => {
    const idempotencyKey = uuidv4();

    const res1 = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(validOrderPayload());

    const res2 = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(validOrderPayload());

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.id).toBe(res2.body.id);
  });

  it('4. GET /orders without JWT → 401', async () => {
    const res = await request(app.getHttpServer()).get('/orders');

    expect(res.status).toBe(401);
  });

  it('5. GET /orders/:id as owner → 200', async () => {
    const res = await request(app.getHttpServer())
      .get(`/orders/${createdOrderId}`)
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdOrderId);
  });

  it('6. GET /orders/:id as different buyer → 404', async () => {
    const res = await request(app.getHttpServer())
      .get(`/orders/${createdOrderId}`)
      .set('Authorization', `Bearer ${buyerToken2}`);

    expect(res.status).toBe(404);
  });

  it('7. POST /orders/:id/cancel → 200 if cancellable', async () => {
    // Create a fresh order to cancel
    const createRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .set('Idempotency-Key', uuidv4())
      .send(validOrderPayload());

    const cancelRes = await request(app.getHttpServer())
      .post(`/orders/${createRes.body.id}/cancel`)
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('cancelled');
  });

  it('8. POST /payments/webhook without stripe-signature → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/payments/webhook')
      .send({ test: true });

    expect(res.status).toBe(401);
  });
});
