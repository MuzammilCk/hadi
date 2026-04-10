import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { TrustModule } from '../../src/modules/trust/trust.module';
import { User } from '../../src/modules/user/entities/user.entity';
import { Order, OrderStatus } from '../../src/modules/order/entities/order.entity';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { UserModule } from '../../src/modules/user/user.module';

const request = require('supertest');

describe('Returns (e2e)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  
  let userToken: string;
  let validOrder: Order;
  let user: User;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
                TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          entities: [__dirname + '/../../src/**/*.entity{.ts,.js}'],
          synchronize: true,
        }),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '60m' },
        }),
        TrustModule,
        AuthModule,
        UserModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    
    dataSource = moduleFixture.get(DataSource);
    jwtService = moduleFixture.get(JwtService);
    
    const userRepo = dataSource.getRepository(User);
    const orderRepo = dataSource.getRepository(Order);
    
    user = await userRepo.save(userRepo.create({ phone: '+919999990010', status: 'active' }));
    
    userToken = jwtService.sign({ sub: user.id, phone: user.phone });
    
    validOrder = await orderRepo.save(orderRepo.create({
      buyer_id: user.id,
      subtotal: 100,
      total_amount: 100,
      currency: 'INR',
      status: OrderStatus.COMPLETED,
      idempotency_key: uuidv4(),
      completed_at: new Date(),
    }));
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('POST /returns should return 401 without auth', async () => {
    return request(app.getHttpServer())
      .post('/returns')
      .send({ order_id: uuidv4(), reason_code: 'defective', idempotency_key: uuidv4() })
      .expect(401);
  });

  it('POST /returns should succeed for valid order', async () => {
    const res = await request(app.getHttpServer())
      .post('/returns')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ order_id: validOrder.id, reason_code: 'defective', idempotency_key: uuidv4() })
      .expect(201);
      
    expect(res.body.order_id).toBe(validOrder.id);
    expect(res.body.status).toBe('pending_review');
  });

  it('GET /returns should list user returns', async () => {
    const res = await request(app.getHttpServer())
      .get('/returns/my')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
      
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
