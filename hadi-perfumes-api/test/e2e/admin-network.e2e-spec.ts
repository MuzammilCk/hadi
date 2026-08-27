import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
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

// Services & Controllers
import { NetworkGraphService } from '../../src/modules/network/services/network-graph.service';
import { QualificationEngineService } from '../../src/modules/network/services/qualification-engine.service';
import { RankAssignmentService } from '../../src/modules/network/services/rank-assignment.service';
import { QualificationRecalcJob } from '../../src/jobs/qualification-recalc.job';
import { AdminNetworkController } from '../../src/modules/network/controllers/admin-network.controller';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/modules/auth/guards/roles.guard';

jest.setTimeout(30000);

describe('Admin Network E2E', () => {
  let app: INestApplication;
  let em: any;
  let userId: string;
  let policyVersionId: string;
  let adminToken: string;

  const allEntities = [
    User,
    NetworkNode,
    QualificationRule,
    QualificationState,
    QualificationEvent,
    RankAssignment,
    GraphRebuildJob,
    GraphCorrectionLog,
    NetworkSnapshot,
    SponsorshipLink,
    ReferralCode,
    ReferralRedemption,
    OnboardingAuditLog,
    CompensationPolicyVersion,
    RankRule,
    CommissionRule,
    ComplianceDisclosure,
    AllowedEarningsClaim,
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
      controllers: [AdminNetworkController],
      providers: [
        NetworkGraphService,
        QualificationEngineService,
        RankAssignmentService,
        QualificationRecalcJob,
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    em = moduleFixture.get(EntityManager);

    // Generate a JWT admin token for e2e requests
    const { JwtService } = require('@nestjs/jwt');
    const jwtService = moduleFixture.get(JwtService);
    adminToken = jwtService.sign({ sub: 'e2e-admin-uuid', role: 'admin', full_name: 'E2E Admin' });

    // Seed users
    const user1 = em.create(User, {
      phone: '+10000000010',
      status: 'active',
      kyc_status: 'not_required',
      created_at: new Date(),
      updated_at: new Date(),
    });
    const savedUser1 = await em.save(User, user1);
    userId = savedUser1.id;

    const user2 = em.create(User, {
      phone: '+10000000011',
      status: 'active',
      kyc_status: 'not_required',
      created_at: new Date(),
      updated_at: new Date(),
    });
    const savedUser2 = await em.save(User, user2);

    // Build network nodes
    const node1 = em.create(NetworkNode, {
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
    await em.save(NetworkNode, node1);

    const node2 = em.create(NetworkNode, {
      user_id: savedUser2.id,
      sponsor_id: userId,
      upline_path: JSON.stringify([userId]) as any,
      depth: 1,
      direct_count: 0,
      total_downline: 0,
      last_rebuilt_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    await em.save(NetworkNode, node2);

    // Seed policy version
    const policy = em.create(CompensationPolicyVersion, {
      version: 1,
      name: 'Test Policy',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    });
    const savedPolicy = await em.save(CompensationPolicyVersion, policy);
    policyVersionId = savedPolicy.id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  // Test 1
  it('POST /admin/network/corrections without AdminGuard credentials returns 401', () => {
    return request(app.getHttpServer())
      .post('/admin/network/corrections')
      .send({
        userId: 'uuid1',
        newSponsorId: 'uuid2',
        reason: 'Test reason long enough',
      })
      .expect(401);
  });

  // Test 2
  it('POST /admin/network/corrections with userId === newSponsorId returns 400', () => {
    return request(app.getHttpServer())
      .post('/admin/network/corrections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId,
        newSponsorId: userId,
        reason: 'Self-sponsor test reason',
      })
      .expect(400);
  });

  // Test 3
  it('POST /admin/network/corrections with reason shorter than 10 chars returns 400', () => {
    return request(app.getHttpServer())
      .post('/admin/network/corrections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId,
        newSponsorId: '00000000-0000-0000-0000-000000000001',
        reason: 'short',
      })
      .expect(400);
  });

  // Test 4
  it('POST /admin/network/corrections with valid payload returns 201 and GraphCorrectionLog shape', async () => {
    // Create a third user to serve as new sponsor
    const newSponsor = em.create(User, {
      phone: '+10000000012',
      status: 'active',
      kyc_status: 'not_required',
      created_at: new Date(),
      updated_at: new Date(),
    });
    const savedNewSponsor = await em.save(User, newSponsor);

    // Build their node
    const sponsorNode = em.create(NetworkNode, {
      user_id: savedNewSponsor.id,
      sponsor_id: null,
      upline_path: JSON.stringify([]) as any,
      depth: 0,
      direct_count: 0,
      total_downline: 0,
      last_rebuilt_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    await em.save(NetworkNode, sponsorNode);

    // Create a user to correct
    const targetUser = em.create(User, {
      phone: '+10000000013',
      status: 'active',
      kyc_status: 'not_required',
      created_at: new Date(),
      updated_at: new Date(),
    });
    const savedTarget = await em.save(User, targetUser);

    const targetNode = em.create(NetworkNode, {
      user_id: savedTarget.id,
      sponsor_id: userId,
      upline_path: JSON.stringify([userId]) as any,
      depth: 1,
      direct_count: 0,
      total_downline: 0,
      last_rebuilt_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    await em.save(NetworkNode, targetNode);

    return request(app.getHttpServer())
      .post('/admin/network/corrections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: savedTarget.id,
        newSponsorId: savedNewSponsor.id,
        reason: 'Valid correction reason for testing',
      })
      .expect(201)
      .expect((res: any) => {
        expect(res.body).toHaveProperty('correction_type');
        expect(res.body).toHaveProperty('user_id');
        expect(res.body).toHaveProperty('reason');
      });
  });

  // Test 5
  it('POST /admin/network/corrections that would create a cycle returns 400', async () => {
    // user2 has userId in its upline. Trying to make userId's sponsor = user2 creates a cycle.
    const users = await em.find(User);
    const user2 = users.find((u: User) => u.phone === '+10000000011');
    if (!user2) return; // safety

    return request(app.getHttpServer())
      .post('/admin/network/corrections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: userId,
        newSponsorId: user2.id,
        reason: 'Cycle creation test reason',
      })
      .expect(400);
  });

  // Test 6
  it('POST /admin/network/recalculate returns 201 and GraphRebuildJob shape', () => {
    return request(app.getHttpServer())
      .post('/admin/network/recalculate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ policyVersionId })
      .expect(201)
      .expect((res: any) => {
        expect(res.body).toHaveProperty('status');
        expect(res.body).toHaveProperty('nodes_processed');
        expect(res.body.status).toBe('completed');
      });
  });

  // Test 7
  it('POST /admin/network/snapshots returns 201 and NetworkSnapshot shape', () => {
    return request(app.getHttpServer())
      .post('/admin/network/snapshots')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201)
      .expect((res: any) => {
        expect(res.body).toHaveProperty('snapshot_type');
        expect(res.body).toHaveProperty('user_count');
        expect(res.body).toHaveProperty('snapshot_data');
      });
  });

  // Test 8
  it('GET /admin/network/corrections returns 200 with paginated list', () => {
    return request(app.getHttpServer())
      .get('/admin/network/corrections')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('total');
        expect(res.body).toHaveProperty('page');
        expect(res.body).toHaveProperty('limit');
      });
  });

  // Test 9
  it('GET /admin/network/snapshots returns 200 with paginated list', () => {
    return request(app.getHttpServer())
      .get('/admin/network/snapshots')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('total');
      });
  });

  // Test 10
  it('GET /admin/network/rebuild-jobs returns 200 with paginated list', () => {
    return request(app.getHttpServer())
      .get('/admin/network/rebuild-jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('total');
      });
  });

  // Test 11
  it('GET /admin/network/:userId/node returns 404 for non-existent userId', () => {
    return request(app.getHttpServer())
      .get('/admin/network/00000000-0000-0000-0000-000000000099/node')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  // Test 12
  it('GET /admin/network/:userId/node returns 200 with NetworkNode shape for existing userId', () => {
    return request(app.getHttpServer())
      .get(`/admin/network/${userId}/node`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(res.body).toHaveProperty('user_id');
        expect(res.body).toHaveProperty('depth');
        expect(res.body).toHaveProperty('upline_path');
      });
  });

  // Test 13
  it('GET /admin/network/:userId/qualification returns 200 with QualificationState shape', () => {
    return request(app.getHttpServer())
      .get(`/admin/network/${userId}/qualification`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res: any) => {
        expect(res.body).toHaveProperty('is_active');
        expect(res.body).toHaveProperty('is_qualified');
      });
  });

  // Test 14
  it('static route GET /admin/network/corrections resolves correctly and does NOT match :userId param', () => {
    return request(app.getHttpServer())
      .get('/admin/network/corrections')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res: any) => {
        // Should return paginated list, not a 404 or single node
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
      });
  });
});
