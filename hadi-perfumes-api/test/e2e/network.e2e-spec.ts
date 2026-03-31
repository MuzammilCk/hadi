import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { EntityManager } from 'typeorm';
const request = require('supertest');

// Entities
import { User } from '../../src/modules/user/entities/user.entity';
import { NetworkNode } from '../../src/modules/network/entities/network-node.entity';
import { QualificationRule } from '../../src/modules/network/entities/qualification-rule.entity';
import { QualificationState } from '../../src/modules/network/entities/qualification-state.entity';
import { QualificationEvent } from '../../src/modules/network/entities/qualification-event.entity';
import { RankAssignment } from '../../src/modules/network/entities/rank-assignment.entity';
import { GraphRebuildJob } from '../../src/modules/network/entities/graph-rebuild-job.entity';
import { GraphCorrectionLog } from '../../src/modules/network/entities/graph-correction-log.entity';
import { NetworkSnapshot } from '../../src/modules/network/entities/network-snapshot.entity';
import { SponsorshipLink } from '../../src/modules/referral/entities/sponsorship-link.entity';
import { ReferralCode } from '../../src/modules/referral/entities/referral-code.entity';
import { ReferralRedemption } from '../../src/modules/referral/entities/referral-redemption.entity';
import { OnboardingAuditLog } from '../../src/modules/auth/entities/onboarding-audit-log.entity';
import { CompensationPolicyVersion } from '../../src/modules/commission/entities/compensation-policy-version.entity';
import { RankRule } from '../../src/modules/commission/entities/rank-rule.entity';
import { CommissionRule } from '../../src/modules/commission/entities/commission-rule.entity';
import { ComplianceDisclosure } from '../../src/modules/commission/entities/compliance-disclosure.entity';
import { AllowedEarningsClaim } from '../../src/modules/commission/entities/allowed-earnings-claim.entity';

// Services
import { NetworkGraphService } from '../../src/modules/network/services/network-graph.service';
import { QualificationEngineService } from '../../src/modules/network/services/qualification-engine.service';
import { RankAssignmentService } from '../../src/modules/network/services/rank-assignment.service';
import { QualificationRecalcJob } from '../../src/jobs/qualification-recalc.job';
import { NetworkController } from '../../src/modules/network/controllers/network.controller';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';

jest.setTimeout(30000);

describe('Network E2E', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let em: any;
  let validToken: string;
  let userId: string;

  const allEntities = [
    User, NetworkNode, QualificationRule, QualificationState,
    QualificationEvent, RankAssignment, GraphRebuildJob,
    GraphCorrectionLog, NetworkSnapshot, SponsorshipLink,
    ReferralCode, ReferralRedemption, OnboardingAuditLog,
    CompensationPolicyVersion, RankRule, CommissionRule,
    ComplianceDisclosure, AllowedEarningsClaim,
  ];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          synchronize: true,
          entities: allEntities,
        }),
        TypeOrmModule.forFeature(allEntities),
        JwtModule.register({
          secret: 'test-secret-not-for-production',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [NetworkController],
      providers: [
        NetworkGraphService,
        QualificationEngineService,
        RankAssignmentService,
        QualificationRecalcJob,
        JwtAuthGuard,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    em = moduleFixture.get(EntityManager);

    // Create a test user
    const user = em.create(User, {
      phone: '+10000000001',
      status: 'active',
      kyc_status: 'not_required',
      created_at: new Date(),
      updated_at: new Date(),
    });
    const savedUser = await em.save(User, user);
    userId = savedUser.id;

    // Build their network node
    const node = em.create(NetworkNode, {
      user_id: userId,
      sponsor_id: null,
      upline_path: JSON.stringify([]) as any,
      depth: 0,
      direct_count: 0,
      total_downline: 0,
      last_rebuilt_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    await em.save(NetworkNode, node);

    validToken = jwtService.sign({ sub: userId, phone: '+10000000001' });
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  // Test 1
  it('GET /network/upline returns 401 without JWT', () => {
    return request(app.getHttpServer())
      .get('/network/upline')
      .expect(401);
  });

  // Test 2
  it('GET /network/upline returns 200 with correct shape', () => {
    return request(app.getHttpServer())
      .get('/network/upline')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(res.body).toHaveProperty('userId');
        expect(res.body).toHaveProperty('depth');
        expect(res.body).toHaveProperty('sponsorId');
        expect(res.body).toHaveProperty('uplinePath');
      });
  });

  // Test 3
  it('GET /network/downline returns 401 without JWT', () => {
    return request(app.getHttpServer())
      .get('/network/downline')
      .expect(401);
  });

  // Test 4
  it('GET /network/downline returns 200 with paginated response shape', () => {
    return request(app.getHttpServer())
      .get('/network/downline')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('total');
        expect(res.body).toHaveProperty('page');
        expect(res.body).toHaveProperty('limit');
      });
  });

  // Test 5
  it('GET /network/stats returns 401 without JWT', () => {
    return request(app.getHttpServer())
      .get('/network/stats')
      .expect(401);
  });

  // Test 6
  it('GET /network/stats returns 200 with correct shape', () => {
    return request(app.getHttpServer())
      .get('/network/stats')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(res.body).toHaveProperty('userId');
        expect(res.body).toHaveProperty('depth');
        expect(res.body).toHaveProperty('directCount');
        expect(res.body).toHaveProperty('totalDownline');
        expect(res.body).toHaveProperty('isActive');
        expect(res.body).toHaveProperty('isQualified');
      });
  });

  // Test 7
  it('GET /network/qualification-status returns 401 without JWT', () => {
    return request(app.getHttpServer())
      .get('/network/qualification-status')
      .expect(401);
  });

  // Test 8
  it('GET /network/qualification-status returns 200 with full QualificationState shape', () => {
    return request(app.getHttpServer())
      .get('/network/qualification-status')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(res.body).toHaveProperty('userId');
        expect(res.body).toHaveProperty('isActive');
        expect(res.body).toHaveProperty('isQualified');
        expect(res.body).toHaveProperty('personalVolume');
        expect(res.body).toHaveProperty('downlineVolume');
        expect(res.body).toHaveProperty('activeLegCount');
      });
  });

  // Test 9
  it('GET /network/downline?maxDepth=999 returns 400 (validation: max is 10)', () => {
    return request(app.getHttpServer())
      .get('/network/downline?maxDepth=999')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(400);
  });

  // Test 10
  it('GET /network/downline?limit=0 returns 400 (validation: min is 1)', () => {
    return request(app.getHttpServer())
      .get('/network/downline?limit=0')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(400);
  });
});
