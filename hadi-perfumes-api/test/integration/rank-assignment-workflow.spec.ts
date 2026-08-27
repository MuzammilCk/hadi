import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { RankAssignmentService } from '../../src/modules/network/services/rank-assignment.service';
import { RankAssignment } from '../../src/modules/network/entities/rank-assignment.entity';
import { QualificationEvent } from '../../src/modules/network/entities/qualification-event.entity';
import { RankRule } from '../../src/modules/commission/entities/rank-rule.entity';
import { CompensationPolicyVersion } from '../../src/modules/commission/entities/compensation-policy-version.entity';
import { CommissionRule } from '../../src/modules/commission/entities/commission-rule.entity';
import { ComplianceDisclosure } from '../../src/modules/commission/entities/compliance-disclosure.entity';
import { AllowedEarningsClaim } from '../../src/modules/commission/entities/allowed-earnings-claim.entity';
import { User } from '../../src/modules/user/entities/user.entity';
import { QualificationContext } from '../../src/modules/network/interfaces/qualification-context.interface';

jest.setTimeout(30000);

describe('RankAssignment Workflow (Integration)', () => {
  let service: RankAssignmentService;
  let em: EntityManager;
  let policyVersionId: string;
  let rankRules: RankRule[];

  const allEntities = [
    User,
    RankAssignment,
    QualificationEvent,
    RankRule,
    CompensationPolicyVersion,
    CommissionRule,
    ComplianceDisclosure,
    AllowedEarningsClaim,
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
      providers: [RankAssignmentService],
    }).compile();

    service = module.get<RankAssignmentService>(RankAssignmentService);
    em = module.get<EntityManager>(EntityManager);

    // Seed policy version
    const policy = em.create(CompensationPolicyVersion, {
      version: 1,
      name: 'Test Policy v1',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    });
    const savedPolicy = await em.save(CompensationPolicyVersion, policy);
    policyVersionId = savedPolicy.id;

    // Seed rank rules
    const ruleData = [
      {
        rank_level: 1,
        rank_name: 'Bronze',
        personal_sales_volume_requirement: 100,
        downline_sales_volume_requirement: 0,
        active_legs_requirement: 0,
      },
      {
        rank_level: 2,
        rank_name: 'Silver',
        personal_sales_volume_requirement: 200,
        downline_sales_volume_requirement: 500,
        active_legs_requirement: 2,
      },
      {
        rank_level: 3,
        rank_name: 'Gold',
        personal_sales_volume_requirement: 500,
        downline_sales_volume_requirement: 2000,
        active_legs_requirement: 5,
      },
    ];

    rankRules = [];
    for (const rd of ruleData) {
      const rule = em.create(RankRule, {
        ...rd,
        policy_version: savedPolicy,
        created_at: new Date(),
      });
      const saved = await em.save(RankRule, rule);
      rankRules.push(saved);
    }
  }, 30000);

  async function createUser(): Promise<User> {
    const user = em.create(User, {
      phone: `+1${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      status: 'active',
      kyc_status: 'not_required',
      created_at: new Date(),
      updated_at: new Date(),
    });
    return em.save(User, user);
  }

  // Test 1
  it('user meeting no rank thresholds has no active RankAssignment', async () => {
    const user = await createUser();
    const ctx: QualificationContext = {
      personalVolume: 0,
      downlineVolume: 0,
      activeLegCount: 0,
    };
    const result = await service.assignRank(
      user.id,
      ctx,
      rankRules,
      policyVersionId,
      null,
    );
    expect(result).toBeNull();

    const current = await service.getCurrentRank(user.id);
    expect(current).toBeNull();
  });

  // Test 2
  it('user meeting rank 1 thresholds gets a RankAssignment for rank level 1', async () => {
    const user = await createUser();
    const ctx: QualificationContext = {
      personalVolume: 150,
      downlineVolume: 0,
      activeLegCount: 0,
    };
    const result = await service.assignRank(
      user.id,
      ctx,
      rankRules,
      policyVersionId,
      null,
    );

    expect(result).not.toBeNull();
    expect(result!.rank_rule_id).toBe(rankRules[0].id); // Bronze
  });

  // Test 3
  it('upgrading volume triggers: old rank gets revoked_at, new rank is created', async () => {
    const user = await createUser();

    // First: Bronze
    const ctx1: QualificationContext = {
      personalVolume: 150,
      downlineVolume: 0,
      activeLegCount: 0,
    };
    const bronze = await service.assignRank(
      user.id,
      ctx1,
      rankRules,
      policyVersionId,
      null,
    );
    expect(bronze!.rank_rule_id).toBe(rankRules[0].id);

    // Then: Silver
    const ctx2: QualificationContext = {
      personalVolume: 300,
      downlineVolume: 600,
      activeLegCount: 3,
    };
    const silver = await service.assignRank(
      user.id,
      ctx2,
      rankRules,
      policyVersionId,
      null,
    );
    expect(silver!.rank_rule_id).toBe(rankRules[1].id);

    // Verify bronze was revoked
    const history = await service.getRankHistory(user.id);
    const revokedBronze = history.find(
      (h) => h.rank_rule_id === rankRules[0].id,
    );
    expect(revokedBronze!.revoked_at).not.toBeNull();
  });

  // Test 4
  it('user cannot be assigned a rank whose downline_sales_volume_requirement > 0 when downlineVolume = 0', async () => {
    const user = await createUser();
    const ctx: QualificationContext = {
      personalVolume: 600,
      downlineVolume: 0,
      activeLegCount: 5,
    };
    const result = await service.assignRank(
      user.id,
      ctx,
      rankRules,
      policyVersionId,
      null,
    );

    // Should only get Bronze (rank 1 has downline req = 0)
    expect(result).not.toBeNull();
    expect(result!.rank_rule_id).toBe(rankRules[0].id);
  });

  // Test 5
  it('user cannot be assigned a rank whose personal_sales_volume_requirement > 0 when personalVolume = 0', async () => {
    const user = await createUser();
    const ctx: QualificationContext = {
      personalVolume: 0,
      downlineVolume: 5000,
      activeLegCount: 10,
    };
    const result = await service.assignRank(
      user.id,
      ctx,
      rankRules,
      policyVersionId,
      null,
    );
    expect(result).toBeNull();
  });

  // Test 6
  it('rank history includes both revoked and active assignments', async () => {
    const user = await createUser();

    // Bronze → Silver
    await service.assignRank(
      user.id,
      { personalVolume: 150, downlineVolume: 0, activeLegCount: 0 },
      rankRules,
      policyVersionId,
      null,
    );
    await service.assignRank(
      user.id,
      { personalVolume: 300, downlineVolume: 600, activeLegCount: 3 },
      rankRules,
      policyVersionId,
      null,
    );

    const history = await service.getRankHistory(user.id);
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  // Test 7
  it('getCurrentRank() returns null after the only rank is revoked', async () => {
    const user = await createUser();
    // Assign Bronze
    await service.assignRank(
      user.id,
      { personalVolume: 150, downlineVolume: 0, activeLegCount: 0 },
      rankRules,
      policyVersionId,
      null,
    );
    // Drop to nothing
    await service.assignRank(
      user.id,
      { personalVolume: 0, downlineVolume: 0, activeLegCount: 0 },
      rankRules,
      policyVersionId,
      null,
    );

    const current = await service.getCurrentRank(user.id);
    expect(current).toBeNull();
  });

  // Test 8
  it('assigning the same rank twice is idempotent (no duplicate)', async () => {
    const user = await createUser();
    const ctx: QualificationContext = {
      personalVolume: 150,
      downlineVolume: 0,
      activeLegCount: 0,
    };

    const first = await service.assignRank(
      user.id,
      ctx,
      rankRules,
      policyVersionId,
      null,
    );
    const second = await service.assignRank(
      user.id,
      ctx,
      rankRules,
      policyVersionId,
      null,
    );

    expect(first!.id).toBe(second!.id);
  });
});
