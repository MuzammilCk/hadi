import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { QualificationEngineService } from '../../src/modules/network/services/qualification-engine.service';
import { QualificationRule } from '../../src/modules/network/entities/qualification-rule.entity';
import { QualificationState } from '../../src/modules/network/entities/qualification-state.entity';
import { QualificationEvent } from '../../src/modules/network/entities/qualification-event.entity';
import { User } from '../../src/modules/user/entities/user.entity';
import { CompensationPolicyVersion } from '../../src/modules/commission/entities/compensation-policy-version.entity';
import { CommissionRule } from '../../src/modules/commission/entities/commission-rule.entity';
import { ComplianceDisclosure } from '../../src/modules/commission/entities/compliance-disclosure.entity';
import { AllowedEarningsClaim } from '../../src/modules/commission/entities/allowed-earnings-claim.entity';
import { QualificationContext } from '../../src/modules/network/interfaces/qualification-context.interface';

jest.setTimeout(30000);

describe('QualificationState (Integration)', () => {
  let service: QualificationEngineService;
  let em: EntityManager;
  let policyVersionId: string;

  const allEntities = [
    User,
    QualificationRule,
    QualificationState,
    QualificationEvent,
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
      providers: [QualificationEngineService],
    }).compile();

    service = module.get<QualificationEngineService>(
      QualificationEngineService,
    );
    em = module.get<EntityManager>(EntityManager);

    // Seed a policy version
    const policy = em.create(CompensationPolicyVersion, {
      version: 1,
      name: 'Test Policy v1',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    });
    const saved = await em.save(CompensationPolicyVersion, policy);
    policyVersionId = saved.id;

    // Seed qualification rules
    const rules = [
      {
        policy_version_id: policyVersionId,
        rule_key: 'min_pv',
        rule_type: 'personal_volume',
        threshold_value: 100,
        window_days: 30,
        is_mandatory: true,
        created_at: new Date(),
      },
      {
        policy_version_id: policyVersionId,
        rule_key: 'min_dv',
        rule_type: 'downline_volume',
        threshold_value: 500,
        window_days: 30,
        is_mandatory: true,
        created_at: new Date(),
      },
      {
        policy_version_id: policyVersionId,
        rule_key: 'min_legs',
        rule_type: 'active_legs',
        threshold_value: 2,
        window_days: 30,
        is_mandatory: true,
        created_at: new Date(),
      },
      {
        policy_version_id: policyVersionId,
        rule_key: 'bonus_pv',
        rule_type: 'personal_volume',
        threshold_value: 1000,
        window_days: 30,
        is_mandatory: false,
        created_at: new Date(),
      },
    ];
    for (const r of rules) {
      await em.save(QualificationRule, em.create(QualificationRule, r));
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
  it('QualificationState record is created when none exists for a user', async () => {
    const user = await createUser();
    const ctx: QualificationContext = {
      personalVolume: 0,
      downlineVolume: 0,
      activeLegCount: 0,
    };
    await service.evaluateUser(user.id, ctx, policyVersionId);

    const state = await em.findOne(QualificationState, {
      where: { user_id: user.id },
    });
    expect(state).not.toBeNull();
  });

  // Test 2
  it('state is updated (not duplicated) on recalculation — only one row per user', async () => {
    const user = await createUser();
    const ctx1: QualificationContext = {
      personalVolume: 0,
      downlineVolume: 0,
      activeLegCount: 0,
    };
    await service.evaluateUser(user.id, ctx1, policyVersionId);

    const ctx2: QualificationContext = {
      personalVolume: 200,
      downlineVolume: 600,
      activeLegCount: 3,
    };
    await service.evaluateUser(user.id, ctx2, policyVersionId);

    const states = await em.find(QualificationState, {
      where: { user_id: user.id },
    });
    expect(states).toHaveLength(1);
  });

  // Test 3
  it('QualificationEvent is written when state changes from inactive to active', async () => {
    const user = await createUser();

    // First: inactive
    const ctx1: QualificationContext = {
      personalVolume: 0,
      downlineVolume: 0,
      activeLegCount: 0,
    };
    await service.evaluateUser(user.id, ctx1, policyVersionId);

    // Then: active
    const ctx2: QualificationContext = {
      personalVolume: 200,
      downlineVolume: 600,
      activeLegCount: 3,
    };
    await service.evaluateUser(user.id, ctx2, policyVersionId);

    const events = await em.find(QualificationEvent, {
      where: { user_id: user.id, event_type: 'activated' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  // Test 4
  it('QualificationEvent is NOT written when state is unchanged on repeated evaluation', async () => {
    const user = await createUser();
    const ctx: QualificationContext = {
      personalVolume: 200,
      downlineVolume: 600,
      activeLegCount: 3,
    };

    await service.evaluateUser(user.id, ctx, policyVersionId);
    const eventsAfterFirst = await em.find(QualificationEvent, {
      where: { user_id: user.id },
    });
    const countAfterFirst = eventsAfterFirst.length;

    // Evaluate again with same context
    await service.evaluateUser(user.id, ctx, policyVersionId);
    const eventsAfterSecond = await em.find(QualificationEvent, {
      where: { user_id: user.id },
    });

    expect(eventsAfterSecond.length).toBe(countAfterFirst);
  });

  // Test 5
  it('suspended user has is_active: false and a populated disqualified_reason', async () => {
    const user = await createUser();
    const ctx: QualificationContext = {
      personalVolume: 200,
      downlineVolume: 600,
      activeLegCount: 3,
    };
    await service.evaluateUser(user.id, ctx, policyVersionId);

    await service.suspendUserQualification(
      user.id,
      'Fraud investigation',
      'admin-1',
    );

    const state = await em.findOne(QualificationState, {
      where: { user_id: user.id },
    });
    expect(state!.is_active).toBe(false);
    expect(state!.disqualified_reason).toBe('Fraud investigation');
  });

  // Test 6
  it('restoring qualification clears disqualified_reason and writes a QualificationEvent', async () => {
    const user = await createUser();
    const ctx: QualificationContext = {
      personalVolume: 200,
      downlineVolume: 600,
      activeLegCount: 3,
    };
    await service.evaluateUser(user.id, ctx, policyVersionId);
    await service.suspendUserQualification(user.id, 'Temp hold', 'admin-1');
    await service.restoreUserQualification(user.id, 'admin-1');

    const state = await em.findOne(QualificationState, {
      where: { user_id: user.id },
    });
    expect(state!.is_active).toBe(true);
    expect(state!.disqualified_reason).toBeNull();

    const events = await em.find(QualificationEvent, {
      where: { user_id: user.id, event_type: 'restored' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  // Test 7
  it('recalculateAll() processes all users and returns correct counts', async () => {
    // Create a couple of users
    await createUser();
    await createUser();

    const result = await service.recalculateAll('admin-1', policyVersionId);
    expect(result.processed).toBeGreaterThanOrEqual(2);
    expect(typeof result.changed).toBe('number');
  });

  // Test 8
  it('evaluation with zero volumes returns isActive: false when rules have non-zero thresholds', async () => {
    const user = await createUser();
    const ctx: QualificationContext = {
      personalVolume: 0,
      downlineVolume: 0,
      activeLegCount: 0,
    };
    const result = await service.evaluateUser(user.id, ctx, policyVersionId);
    expect(result.isActive).toBe(false);
  });

  // Test 9
  it('evaluation with volumes meeting all rules returns isActive: true', async () => {
    const user = await createUser();
    const ctx: QualificationContext = {
      personalVolume: 200,
      downlineVolume: 600,
      activeLegCount: 3,
    };
    const result = await service.evaluateUser(user.id, ctx, policyVersionId);
    expect(result.isActive).toBe(true);
  });

  // Test 10
  it('non-mandatory rule failure does not set isActive: false', async () => {
    const user = await createUser();
    // Meets all mandatory rules but bonus_pv (non-mandatory, threshold=1000) is not met
    const ctx: QualificationContext = {
      personalVolume: 200,
      downlineVolume: 600,
      activeLegCount: 3,
    };
    const result = await service.evaluateUser(user.id, ctx, policyVersionId);
    expect(result.isActive).toBe(true);
  });
});
