jest.setTimeout(30000);

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
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { CommissionModule } from '../../src/modules/commission/commission.module';
import { LedgerModule } from '../../src/modules/ledger/ledger.module';
import { PayoutModule } from '../../src/modules/payout/payout.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { ReferralModule } from '../../src/modules/referral/referral.module';
import { UserModule } from '../../src/modules/user/user.module';
import { NetworkModule } from '../../src/modules/network/network.module';
import { OrderModule } from '../../src/modules/order/order.module';
import { ListingModule } from '../../src/modules/listing/listing.module';
import { InventoryModule } from '../../src/modules/inventory/inventory.module';

import { User } from '../../src/modules/user/entities/user.entity';

describe('Admin Commission E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;

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
        CommissionModule,
        LedgerModule,
        PayoutModule,
        AuthModule,
        ReferralModule,
        UserModule,
        NetworkModule,
        OrderModule,
        ListingModule,
        InventoryModule,
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

    // Create admin user for FK
    const userRepo = dataSource.getRepository(User);
    await userRepo.save(
      userRepo.create({
        id: process.env.ADMIN_ACTOR_ID,
        phone: '+910000000000',
        status: 'active',
      }),
    );
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  it('1. POST /admin/commission/process-outbox without x-admin-token → 401', async () => {
    const res = await request(app.getHttpServer()).post(
      '/admin/commission/process-outbox',
    );
    expect(res.status).toBe(401);
  });

  it('2. POST /admin/commission/process-outbox with admin token → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/commission/process-outbox')
      .set('x-admin-token', 'test-admin-token');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('processed');
    expect(res.body).toHaveProperty('skipped');
    expect(res.body).toHaveProperty('errors');
  });

  it('3. POST /admin/commission/release without x-admin-token → 401', async () => {
    const res = await request(app.getHttpServer()).post(
      '/admin/commission/release',
    );
    expect(res.status).toBe(401);
  });

  it('4. POST /admin/commission/release with admin token → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/commission/release')
      .set('x-admin-token', 'test-admin-token');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('released');
    expect(res.body).toHaveProperty('errors');
  });

  it('5. GET /admin/payouts without x-admin-token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/admin/payouts');
    expect(res.status).toBe(401);
  });

  it('6. GET /admin/payouts with admin token → 200', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/payouts')
      .set('x-admin-token', 'test-admin-token');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
  });

  it('7. POST /admin/payouts/:id/approve → 404 when payout not found', async () => {
    const res = await request(app.getHttpServer())
      .post(`/admin/payouts/${uuidv4()}/approve`)
      .set('x-admin-token', 'test-admin-token');
    expect(res.status).toBe(404);
  });

  it('8. POST /admin/payouts/:id/reject → 404 when payout not found', async () => {
    const res = await request(app.getHttpServer())
      .post(`/admin/payouts/${uuidv4()}/reject`)
      .set('x-admin-token', 'test-admin-token')
      .send({ reason: 'test' });
    expect(res.status).toBe(404);
  });

  it('9. POST /admin/payouts/batch with no approved requests → 400 BadRequest', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/payouts/batch')
      .set('x-admin-token', 'test-admin-token');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('No approved');
  });
});
