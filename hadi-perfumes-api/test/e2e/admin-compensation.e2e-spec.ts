import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
const request = require('supertest');
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommissionModule } from '../../src/modules/commission/commission.module';

describe('AdminCompensationController (e2e)', () => {
  let app: INestApplication;

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
        CommissionModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  let draftId: string;

  it('/admin/compensation-policy/drafts (POST) - Valid payload', () => {
    return request(app.getHttpServer())
      .post('/admin/compensation-policy/drafts')
      .send({
        name: 'E2E Test Policy',
        commission_rules: [{ level: 1, percentage: 0.15 }],
        compliance_disclosures: [{ disclosure_key: 'risk', disclosure_text: 'text', is_mandatory: true }]
      })
      .expect(201)
      .expect((res) => {
        expect(res.body.id).toBeDefined();
        expect(res.body.status).toBe('draft');
        draftId = res.body.id;
      });
  });

  it('/admin/compensation-policy/drafts (POST) - Invalid payload (missing rules)', () => {
    return request(app.getHttpServer())
      .post('/admin/compensation-policy/drafts')
      .send({
        name: 'Bad Policy',
      })
      .expect(400); // Bad Request from class-validator
  });

  it('/admin/compensation-policy/drafts/:id/validate (POST)', () => {
    return request(app.getHttpServer())
      .post(`/admin/compensation-policy/drafts/${draftId}/validate`)
      .expect(201)
      .expect((res) => {
        expect(res.body.valid).toBe(true);
      });
  });

  it('/admin/compensation-policy/drafts/:id/activate (POST)', () => {
    return request(app.getHttpServer())
      .post(`/admin/compensation-policy/drafts/${draftId}/activate`)
      .expect(201)
      .expect((res) => {
        expect(res.body.status).toBe('active');
        expect(res.body.version).toBe(1);
      });
  });

  it('/admin/compensation-policy/current (GET)', () => {
    return request(app.getHttpServer())
      .get('/admin/compensation-policy/current')
      .expect(200)
      .expect((res) => {
        expect(res.body.id).toBe(draftId);
      });
  });
});
