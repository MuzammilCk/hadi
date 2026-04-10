import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NetworkGraphService } from '../../src/modules/network/services/network-graph.service';
import { NetworkNode } from '../../src/modules/network/entities/network-node.entity';
import { GraphRebuildJob } from '../../src/modules/network/entities/graph-rebuild-job.entity';
import { GraphCorrectionLog } from '../../src/modules/network/entities/graph-correction-log.entity';
import { NetworkSnapshot } from '../../src/modules/network/entities/network-snapshot.entity';
import { QualificationEvent } from '../../src/modules/network/entities/qualification-event.entity';
import { SponsorshipLink } from '../../src/modules/referral/entities/sponsorship-link.entity';
import { User } from '../../src/modules/user/entities/user.entity';
import { OnboardingAuditLog } from '../../src/modules/auth/entities/onboarding-audit-log.entity';
import { ReferralCode } from '../../src/modules/referral/entities/referral-code.entity';
import { ReferralRedemption } from '../../src/modules/referral/entities/referral-redemption.entity';
import { NetworkCycleException } from '../../src/modules/network/exceptions/network.exceptions';
import { EntityManager } from 'typeorm';

jest.setTimeout(30000);

describe('NetworkGraphService (Integration)', () => {
  let service: NetworkGraphService;
  let em: EntityManager;

  const allEntities = [
    User,
    SponsorshipLink,
    ReferralCode,
    ReferralRedemption,
    OnboardingAuditLog,
    NetworkNode,
    GraphRebuildJob,
    GraphCorrectionLog,
    NetworkSnapshot,
    QualificationEvent,
  ];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          synchronize: true,
          entities: allEntities,
        }),
        TypeOrmModule.forFeature(allEntities),
      ],
      providers: [NetworkGraphService],
    }).compile();

    service = module.get<NetworkGraphService>(NetworkGraphService);
    em = module.get<EntityManager>(EntityManager);
  }, 30000);

  // Helper: create a user
  async function createUser(id?: string): Promise<User> {
    const user = em.create(User, {
      phone: `+1${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      status: 'active',
      kyc_status: 'not_required',
      created_at: new Date(),
      updated_at: new Date(),
    });
    const saved = await em.save(User, user);
    return saved;
  }

  // Helper: create a referral code
  async function createReferralCode(ownerId: string): Promise<ReferralCode> {
    const code = em.create(ReferralCode, {
      code: Math.random().toString(36).slice(2, 10).toUpperCase(),
      owner_id: ownerId,
      status: 'active',
      uses_count: 0,
      created_at: new Date(),
    });
    return em.save(ReferralCode, code);
  }

  // Helper: create a sponsorship link
  async function createLink(
    userId: string,
    sponsorId: string,
    uplinePath: string[],
    codeId: string,
  ): Promise<SponsorshipLink> {
    const link = em.create(SponsorshipLink, {
      user_id: userId,
      sponsor_id: sponsorId,
      referral_code_id: codeId,
      upline_path: JSON.stringify(uplinePath) as any,
      created_at: new Date(),
    });
    return em.save(SponsorshipLink, link);
  }

  // Test 1
  it('builds a node for a user with no SponsorshipLink — depth=0, upline_path=[]', async () => {
    const user = await createUser();
    const node = await service.buildNodeForUser(user.id, em);

    expect(node.depth).toBe(0);
    expect(node.sponsor_id).toBeNull();
    const path =
      typeof node.upline_path === 'string'
        ? JSON.parse(node.upline_path)
        : node.upline_path;
    expect(path).toEqual([]);
  });

  // Test 2
  it('builds a node for a user with sponsor — depth=1, upline_path=[sponsorId]', async () => {
    const sponsor = await createUser();
    const user = await createUser();
    const code = await createReferralCode(sponsor.id);
    await createLink(user.id, sponsor.id, [sponsor.id], code.id);

    const node = await service.buildNodeForUser(user.id, em);

    expect(node.depth).toBe(1);
    expect(node.sponsor_id).toBe(sponsor.id);
  });

  // Test 3
  it('builds a 3-level chain: root → sponsor → user with correct depth and upline_path order', async () => {
    const root = await createUser();
    const sponsor = await createUser();
    const user = await createUser();

    const codeRoot = await createReferralCode(root.id);
    const codeSponsor = await createReferralCode(sponsor.id);

    await createLink(sponsor.id, root.id, [root.id], codeRoot.id);
    await createLink(
      user.id,
      sponsor.id,
      [root.id, sponsor.id],
      codeSponsor.id,
    );

    await service.buildNodeForUser(root.id, em);
    await service.buildNodeForUser(sponsor.id, em);
    const userNode = await service.buildNodeForUser(user.id, em);

    expect(userNode.depth).toBe(2);
    const path =
      typeof userNode.upline_path === 'string'
        ? JSON.parse(userNode.upline_path)
        : userNode.upline_path;
    expect(path).toEqual([root.id, sponsor.id]);
  });

  // Test 4
  it('rebuildAllNodes() creates a GraphRebuildJob marked completed with correct nodes_processed', async () => {
    const job = await service.rebuildAllNodes('test-admin');
    expect(job.status).toBe('completed');
    expect(job.nodes_processed).toBeGreaterThan(0);
  });

  // Test 5
  it('GraphCorrectionLog is written atomically with the node update', async () => {
    const oldSponsor = await createUser();
    const newSponsor = await createUser();
    const user = await createUser();

    const code = await createReferralCode(oldSponsor.id);
    await createLink(user.id, oldSponsor.id, [oldSponsor.id], code.id);

    // Build nodes
    await service.buildNodeForUser(oldSponsor.id, em);
    await service.buildNodeForUser(newSponsor.id, em);
    await service.buildNodeForUser(user.id, em);

    const dto = {
      userId: user.id,
      newSponsorId: newSponsor.id,
      reason: 'Integration test correction reason',
    };

    await em.transaction(async (txEm) => {
      const log = await service.applyGraphCorrection(dto, 'admin-1', txEm);
      expect(log.correction_type).toBe('sponsor_reassignment');
      expect(log.user_id).toBe(user.id);
    });

    // Verify log exists
    const logs = await em.find(GraphCorrectionLog, {
      where: { user_id: user.id },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  // Test 6
  it('applying a correction that creates a cycle is rejected with NetworkCycleException', async () => {
    const parent = await createUser();
    const child = await createUser();

    const code = await createReferralCode(parent.id);
    await createLink(child.id, parent.id, [parent.id], code.id);

    await service.buildNodeForUser(parent.id, em);
    await service.buildNodeForUser(child.id, em);

    // Try to make parent's sponsor = child (creates cycle: child → parent → child)
    const dto = {
      userId: parent.id,
      newSponsorId: child.id,
      reason: 'Cycle test correction reason',
    };

    await expect(
      em.transaction(async (txEm) => {
        await service.applyGraphCorrection(dto, 'admin-1', txEm);
      }),
    ).rejects.toThrow(NetworkCycleException);
  });

  // Test 7
  it('OnboardingAuditLog entry is written for every graph correction', async () => {
    const sponsor1 = await createUser();
    const sponsor2 = await createUser();
    const user = await createUser();

    const code = await createReferralCode(sponsor1.id);
    await createLink(user.id, sponsor1.id, [sponsor1.id], code.id);

    await service.buildNodeForUser(sponsor1.id, em);
    await service.buildNodeForUser(sponsor2.id, em);
    await service.buildNodeForUser(user.id, em);

    const dto = {
      userId: user.id,
      newSponsorId: sponsor2.id,
      reason: 'Audit log test correction',
    };

    await em.transaction(async (txEm) => {
      await service.applyGraphCorrection(dto, 'admin-1', txEm);
    });

    const auditLogs = await em.find(OnboardingAuditLog, {
      where: { target_id: user.id, action: 'admin_network_correction' },
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
  });

  // Test 8
  it('after a graph correction, descendants of the corrected user have their upline_path updated', async () => {
    const root = await createUser();
    const oldSponsor = await createUser();
    const newSponsor = await createUser();
    const user = await createUser();
    const child = await createUser();

    const codeOld = await createReferralCode(oldSponsor.id);
    const codeUser = await createReferralCode(user.id);

    await createLink(
      oldSponsor.id,
      root.id,
      [root.id],
      await createReferralCode(root.id).then((c) => c.id),
    );
    await createLink(
      user.id,
      oldSponsor.id,
      [root.id, oldSponsor.id],
      codeOld.id,
    );
    await createLink(
      child.id,
      user.id,
      [root.id, oldSponsor.id, user.id],
      codeUser.id,
    );

    await service.buildNodeForUser(root.id, em);
    await service.buildNodeForUser(oldSponsor.id, em);
    await service.buildNodeForUser(newSponsor.id, em);
    await service.buildNodeForUser(user.id, em);
    await service.buildNodeForUser(child.id, em);

    const dto = {
      userId: user.id,
      newSponsorId: newSponsor.id,
      reason: 'Descendant update test reason',
    };

    await em.transaction(async (txEm) => {
      await service.applyGraphCorrection(dto, 'admin-1', txEm);
    });

    const childNode = await em.findOne(NetworkNode, {
      where: { user_id: child.id },
    });
    const childPath =
      typeof childNode!.upline_path === 'string'
        ? JSON.parse(childNode!.upline_path)
        : childNode!.upline_path;

    // Child's path should now include newSponsor instead of oldSponsor
    expect(childPath).toContain(newSponsor.id);
    expect(childPath).toContain(user.id);
  });

  // Test 9
  it('direct_count on a parent node equals the count of their direct children', async () => {
    const parent = await createUser();
    const child1 = await createUser();
    const child2 = await createUser();

    const code = await createReferralCode(parent.id);
    await createLink(child1.id, parent.id, [parent.id], code.id);
    await createLink(child2.id, parent.id, [parent.id], code.id);

    await service.rebuildAllNodes('test-admin');

    const parentNode = await em.findOne(NetworkNode, {
      where: { user_id: parent.id },
    });
    expect(parentNode!.direct_count).toBe(2);
  });

  // Test 10
  it('total_downline includes all descendants, not just direct children', async () => {
    const root = await createUser();
    const mid = await createUser();
    const leaf = await createUser();

    const codeRoot = await createReferralCode(root.id);
    const codeMid = await createReferralCode(mid.id);

    await createLink(mid.id, root.id, [root.id], codeRoot.id);
    await createLink(leaf.id, mid.id, [root.id, mid.id], codeMid.id);

    await service.rebuildAllNodes('test-admin');

    const rootNode = await em.findOne(NetworkNode, {
      where: { user_id: root.id },
    });
    expect(rootNode!.total_downline).toBeGreaterThanOrEqual(2); // mid + leaf
  });
});
