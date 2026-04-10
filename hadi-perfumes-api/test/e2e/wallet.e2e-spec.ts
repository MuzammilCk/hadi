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
import { JwtModule, JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { LedgerModule } from '../../src/modules/ledger/ledger.module';
import { PayoutModule } from '../../src/modules/payout/payout.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { ReferralModule } from '../../src/modules/referral/referral.module';
import { UserModule } from '../../src/modules/user/user.module';
import { OrderModule } from '../../src/modules/order/order.module';
import { ListingModule } from '../../src/modules/listing/listing.module';
import { InventoryModule } from '../../src/modules/inventory/inventory.module';

import { User } from '../../src/modules/user/entities/user.entity';
import {
  LedgerEntry,
  LedgerEntryType,
  LedgerEntryStatus,
} from '../../src/modules/ledger/entities/ledger-entry.entity';
import { QualificationState } from '../../src/modules/network/entities/qualification-state.entity';
import { NetworkNode } from '../../src/modules/network/entities/network-node.entity';

describe('Wallet E2E', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let dataSource: DataSource;
  let userToken: string;
  let testUser: User;

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
        LedgerModule,
        PayoutModule,
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
    jwtService = moduleFixture.get(JwtService);

    // Create test user
    const userRepo = dataSource.getRepository(User);
    testUser = await userRepo.save(
      userRepo.create({
        phone: '+919000000001',
        status: 'active',
      }),
    );

    // Create admin user for FK
    await userRepo.save(
      userRepo.create({
        id: process.env.ADMIN_ACTOR_ID,
        phone: '+910000000000',
        status: 'active',
      }),
    );

    userToken = jwtService.sign({ sub: testUser.id, phone: testUser.phone });

    // Create network node and qualification state for the test user
    const nodeRepo = dataSource.getRepository(NetworkNode);
    await nodeRepo.save(
      nodeRepo.create({
        user_id: testUser.id,
        sponsor_id: null,
        upline_path: [],
        depth: 0,
        direct_count: 0,
        total_downline: 0,
        last_rebuilt_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      }),
    );

    const qualRepo = dataSource.getRepository(QualificationState);
    await qualRepo.save(
      qualRepo.create({
        user_id: testUser.id,
        is_active: true,
        is_qualified: true,
        evaluated_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      }),
    );
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  it('1. GET /wallet/balance without JWT → 401', async () => {
    const res = await request(app.getHttpServer()).get('/wallet/balance');
    expect(res.status).toBe(401);
  });

  it('2. GET /wallet/balance with JWT → 200 with balance fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/wallet/balance')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user_id');
    expect(res.body).toHaveProperty('pending_balance');
    expect(res.body).toHaveProperty('available_balance');
    expect(res.body).toHaveProperty('currency');
  });

  it('3. GET /wallet/ledger without JWT → 401', async () => {
    const res = await request(app.getHttpServer()).get('/wallet/ledger');
    expect(res.status).toBe(401);
  });

  it('4. GET /wallet/ledger with JWT → 200 with paginated data', async () => {
    const res = await request(app.getHttpServer())
      .get('/wallet/ledger')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
  });

  it('5. POST /wallet/payout-request without JWT → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/wallet/payout-request')
      .send({ amount: 100 });
    expect(res.status).toBe(401);
  });

  it('6. POST /wallet/payout-request without Idempotency-Key header → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/wallet/payout-request')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: 100 });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Idempotency');
  });

  it('7. POST /wallet/payout-request with valid key but zero balance → 400 InsufficientBalance', async () => {
    const res = await request(app.getHttpServer())
      .post('/wallet/payout-request')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({ amount: 500 });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Insufficient balance');
  });
});
