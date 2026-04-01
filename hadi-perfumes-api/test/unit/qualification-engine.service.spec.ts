import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { QualificationEngineService } from '../../src/modules/network/services/qualification-engine.service';
import { QualificationRule } from '../../src/modules/network/entities/qualification-rule.entity';
import { QualificationState } from '../../src/modules/network/entities/qualification-state.entity';
import { QualificationEvent } from '../../src/modules/network/entities/qualification-event.entity';
import { User } from '../../src/modules/user/entities/user.entity';
import { QualificationContext } from '../../src/modules/network/interfaces/qualification-context.interface';

jest.setTimeout(30000);

describe('QualificationEngineService (Unit)', () => {
  let service: QualificationEngineService;
  let mockRuleRepo: any;
  let mockStateRepo: any;
  let mockEventRepo: any;
  let mockUserRepo: any;
  let mockEntityManager: any;

  const policyVersionId = 'policy-v1';

  // Standard rules: personal_volume >= 100, downline_volume >= 500, active_legs >= 2
  const mandatoryRules: Partial<QualificationRule>[] = [
    { id: 'r1', policy_version_id: policyVersionId, rule_key: 'min_personal_volume', rule_type: 'personal_volume', threshold_value: 100, is_mandatory: true, window_days: 30 },
    { id: 'r2', policy_version_id: policyVersionId, rule_key: 'min_downline_volume', rule_type: 'downline_volume', threshold_value: 500, is_mandatory: true, window_days: 30 },
    { id: 'r3', policy_version_id: policyVersionId, rule_key: 'min_active_legs', rule_type: 'active_legs', threshold_value: 2, is_mandatory: true, window_days: 30 },
  ];

  const createMockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((data) => ({ ...data })),
    save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 'mock-id', ...entity })),
  });

  beforeEach(async () => {
    mockRuleRepo = createMockRepo();
    mockStateRepo = createMockRepo();
    mockEventRepo = createMockRepo();
    mockUserRepo = createMockRepo();
    mockEntityManager = {
      find: jest.fn().mockResolvedValue(mandatoryRules),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((_, data) => ({ ...data })),
      save: jest.fn().mockImplementation((_, entity) => Promise.resolve({ id: 'mock-id', ...entity })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QualificationEngineService,
        { provide: getRepositoryToken(QualificationRule), useValue: mockRuleRepo },
        { provide: getRepositoryToken(QualificationState), useValue: mockStateRepo },
        { provide: getRepositoryToken(QualificationEvent), useValue: mockEventRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: EntityManager, useValue: mockEntityManager },
      ],
    }).compile();

    service = module.get<QualificationEngineService>(QualificationEngineService);
  });

  // Test 1
  it('evaluateUser() returns isActive: false when personal_volume rule not met', async () => {
    const context: QualificationContext = { personalVolume: 50, downlineVolume: 600, activeLegCount: 3 };
    const result = await service.evaluateUser('user-1', context, policyVersionId, mockEntityManager);
    expect(result.isActive).toBe(false);
    expect(result.failedRules).toContain('min_personal_volume');
  });

  // Test 2
  it('evaluateUser() returns isActive: true when all mandatory rules are met', async () => {
    const context: QualificationContext = { personalVolume: 200, downlineVolume: 600, activeLegCount: 3 };
    const result = await service.evaluateUser('user-1', context, policyVersionId, mockEntityManager);
    expect(result.isActive).toBe(true);
    expect(result.failedRules).toHaveLength(0);
  });

  // Test 3
  it('evaluateUser() returns isQualified: false when not active', async () => {
    const context: QualificationContext = { personalVolume: 0, downlineVolume: 0, activeLegCount: 0 };
    const result = await service.evaluateUser('user-1', context, policyVersionId, mockEntityManager);
    expect(result.isQualified).toBe(false);
  });

  // Test 4
  it('evaluateUser() populates failedRules with all unmet mandatory rule_keys', async () => {
    const context: QualificationContext = { personalVolume: 0, downlineVolume: 0, activeLegCount: 0 };
    const result = await service.evaluateUser('user-1', context, policyVersionId, mockEntityManager);
    expect(result.failedRules).toContain('min_personal_volume');
    expect(result.failedRules).toContain('min_downline_volume');
    expect(result.failedRules).toContain('min_active_legs');
    expect(result.failedRules).toHaveLength(3);
  });

  // Test 5
  it('evaluateUser() does NOT set isActive: true from activeLegCount alone (volume required)', async () => {
    const context: QualificationContext = { personalVolume: 0, downlineVolume: 0, activeLegCount: 10 };
    const result = await service.evaluateUser('user-1', context, policyVersionId, mockEntityManager);
    expect(result.isActive).toBe(false);
    expect(result.failedRules).toContain('min_personal_volume');
    expect(result.failedRules).toContain('min_downline_volume');
  });

  // Test 6
  it('evaluateUser() reads thresholds from QualificationRule entities, not hardcoded values', async () => {
    // Override threshold_value to a different value
    const customRules = [
      { ...mandatoryRules[0], threshold_value: 50 },
      { ...mandatoryRules[1], threshold_value: 200 },
      { ...mandatoryRules[2], threshold_value: 1 },
    ];
    mockEntityManager.find.mockResolvedValue(customRules);

    const context: QualificationContext = { personalVolume: 50, downlineVolume: 200, activeLegCount: 1 };
    const result = await service.evaluateUser('user-1', context, policyVersionId, mockEntityManager);
    expect(result.isActive).toBe(true);
  });

  // Test 7
  it('evaluateUser() writes QualificationEvent when state changes from inactive to active', async () => {
    // evaluateUser calls: manager.find(QualificationRule) then manager.findOne(QualificationState)
    // Set find to return rules
    mockEntityManager.find.mockResolvedValue(mandatoryRules);
    // Set findOne to return previous inactive state
    mockEntityManager.findOne.mockResolvedValueOnce({
      user_id: 'user-1',
      is_active: false,
      is_qualified: false,
      personal_volume: 0,
      downline_volume: 0,
    });

    const context: QualificationContext = { personalVolume: 200, downlineVolume: 600, activeLegCount: 3 };
    await service.evaluateUser('user-1', context, policyVersionId, mockEntityManager);

    // Verify QualificationEvent was saved (save is called as manager.save(EntityClass, data))
    const saveCalls = mockEntityManager.save.mock.calls;
    const eventSaved = saveCalls.some(
      (call: any[]) => call[0] === QualificationEvent
    );
    expect(eventSaved).toBe(true);
  });

  // Test 8
  it('evaluateUser() does NOT write QualificationEvent when state is unchanged', async () => {
    // Previous state: already active
    mockEntityManager.findOne.mockResolvedValueOnce({
      user_id: 'user-1',
      is_active: true,
      is_qualified: true,
      personal_volume: 200,
      downline_volume: 600,
    });

    const context: QualificationContext = { personalVolume: 200, downlineVolume: 600, activeLegCount: 3 };
    await service.evaluateUser('user-1', context, policyVersionId, mockEntityManager);

    // Verify NO QualificationEvent was saved
    const saveCalls = mockEntityManager.save.mock.calls;
    const eventSaved = saveCalls.some(
      (call: any[]) => call[0] === QualificationEvent
    );
    expect(eventSaved).toBe(false);
  });

  // Test 9
  it('suspendUserQualification() sets is_active: false, disqualified_reason, writes QualificationEvent', async () => {
    mockStateRepo.findOne.mockResolvedValue({
      user_id: 'user-1',
      is_active: true,
      is_qualified: true,
    });

    await service.suspendUserQualification('user-1', 'Fraud detected', 'admin-1');

    expect(mockStateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        is_active: false,
        is_qualified: false,
        disqualified_reason: 'Fraud detected',
      }),
    );
    expect(mockEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'suspended',
        user_id: 'user-1',
        actor_id: 'admin-1',
      }),
    );
  });

  // Test 10
  it('restoreUserQualification() clears disqualified_reason, sets is_active: true, writes QualificationEvent', async () => {
    mockStateRepo.findOne.mockResolvedValue({
      user_id: 'user-1',
      is_active: false,
      is_qualified: false,
      disqualified_reason: 'Fraud detected',
    });

    await service.restoreUserQualification('user-1', 'admin-1');

    expect(mockStateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        is_active: true,
        is_qualified: true,
        disqualified_reason: null,
      }),
    );
    expect(mockEventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'restored',
        user_id: 'user-1',
        actor_id: 'admin-1',
      }),
    );
  });

  // Test 11
  it('same QualificationContext always produces the same result (determinism check)', async () => {
    const context: QualificationContext = { personalVolume: 150, downlineVolume: 600, activeLegCount: 3 };
    const result1 = await service.evaluateUser('user-1', context, policyVersionId, mockEntityManager);

    // Reset mock
    mockEntityManager.find.mockResolvedValue(mandatoryRules);
    mockEntityManager.findOne.mockResolvedValue(null);

    const result2 = await service.evaluateUser('user-1', context, policyVersionId, mockEntityManager);

    expect(result1.isActive).toBe(result2.isActive);
    expect(result1.isQualified).toBe(result2.isQualified);
    expect(result1.failedRules).toEqual(result2.failedRules);
  });

  // Test 12
  it('non-mandatory rules do NOT block isActive when threshold is not met', async () => {
    const rulesWithOptional = [
      ...mandatoryRules,
      { id: 'r4', policy_version_id: policyVersionId, rule_key: 'bonus_volume', rule_type: 'personal_volume', threshold_value: 1000, is_mandatory: false, window_days: 30 },
    ];
    mockEntityManager.find.mockResolvedValue(rulesWithOptional);

    // Meets all mandatory rules but not the optional one
    const context: QualificationContext = { personalVolume: 200, downlineVolume: 600, activeLegCount: 3 };
    const result = await service.evaluateUser('user-1', context, policyVersionId, mockEntityManager);
    expect(result.isActive).toBe(true);
    expect(result.failedRules).not.toContain('bonus_volume');
  });
});
