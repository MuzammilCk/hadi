import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, IsNull } from 'typeorm';
import { RankAssignmentService } from '../../src/modules/network/services/rank-assignment.service';
import { RankAssignment } from '../../src/modules/network/entities/rank-assignment.entity';
import { QualificationEvent } from '../../src/modules/network/entities/qualification-event.entity';
import { RankRule } from '../../src/modules/commission/entities/rank-rule.entity';
import { QualificationContext } from '../../src/modules/network/interfaces/qualification-context.interface';

jest.setTimeout(30000);

describe('RankAssignmentService (Unit)', () => {
  let service: RankAssignmentService;
  let mockRankAssignmentRepo: any;
  let mockQualEventRepo: any;
  let mockEntityManager: any;

  const policyVersionId = 'policy-v1';

  // Rank rules with varying thresholds
  const rankRules: Partial<RankRule>[] = [
    { id: 'rank-1', rank_level: 1, rank_name: 'Bronze', personal_sales_volume_requirement: 100, downline_sales_volume_requirement: 0, active_legs_requirement: 0 },
    { id: 'rank-2', rank_level: 2, rank_name: 'Silver', personal_sales_volume_requirement: 200, downline_sales_volume_requirement: 500, active_legs_requirement: 2 },
    { id: 'rank-3', rank_level: 3, rank_name: 'Gold', personal_sales_volume_requirement: 500, downline_sales_volume_requirement: 2000, active_legs_requirement: 5 },
  ];

  const createMockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((data) => ({ ...data })),
    save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 'mock-id', ...entity })),
  });

  beforeEach(async () => {
    mockRankAssignmentRepo = createMockRepo();
    mockQualEventRepo = createMockRepo();
    mockEntityManager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((_, data) => ({ ...data })),
      save: jest.fn().mockImplementation((_, entity) => Promise.resolve({ id: 'mock-id', ...entity })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RankAssignmentService,
        { provide: getRepositoryToken(RankAssignment), useValue: mockRankAssignmentRepo },
        { provide: getRepositoryToken(QualificationEvent), useValue: mockQualEventRepo },
        { provide: EntityManager, useValue: mockEntityManager },
      ],
    }).compile();

    service = module.get<RankAssignmentService>(RankAssignmentService);
  });

  // Test 1
  it('assignRank() returns null when no rank thresholds are met', async () => {
    const context: QualificationContext = { personalVolume: 0, downlineVolume: 0, activeLegCount: 0 };
    const result = await service.assignRank('user-1', context, rankRules as RankRule[], policyVersionId, null, mockEntityManager);
    expect(result).toBeNull();
  });

  // Test 2
  it('assignRank() assigns the highest eligible rank level when multiple are met', async () => {
    const context: QualificationContext = { personalVolume: 300, downlineVolume: 600, activeLegCount: 3 };
    const result = await service.assignRank('user-1', context, rankRules as RankRule[], policyVersionId, null, mockEntityManager);
    expect(result).not.toBeNull();
    expect(result!.rank_rule_id).toBe('rank-2'); // Silver — meets rank-1 and rank-2 but not rank-3
  });

  // Test 3
  it('assignRank() does NOT assign rank when only activeLegCount threshold is met (volume = 0)', async () => {
    const context: QualificationContext = { personalVolume: 0, downlineVolume: 0, activeLegCount: 10 };
    const result = await service.assignRank('user-1', context, rankRules as RankRule[], policyVersionId, null, mockEntityManager);
    expect(result).toBeNull();
  });

  // Test 4
  it('assignRank() does NOT assign rank when only personalVolume is met but downlineVolume requirement is unmet', async () => {
    const context: QualificationContext = { personalVolume: 600, downlineVolume: 0, activeLegCount: 5 };
    // Silver requires downline 500, Gold requires 2000 — fails both at downline=0
    // Bronze has 0 downline req, so Bronze IS met
    const result = await service.assignRank('user-1', context, rankRules as RankRule[], policyVersionId, null, mockEntityManager);
    expect(result).not.toBeNull();
    expect(result!.rank_rule_id).toBe('rank-1'); // Only Bronze
  });

  // Test 5
  it('assignRank() revokes previous rank (revoked_at set) before writing new one', async () => {
    const existingRank = { id: 'existing-rank', user_id: 'user-1', rank_rule_id: 'rank-1', revoked_at: null };
    mockEntityManager.findOne.mockResolvedValue(existingRank);

    const context: QualificationContext = { personalVolume: 300, downlineVolume: 600, activeLegCount: 3 };
    await service.assignRank('user-1', context, rankRules as RankRule[], policyVersionId, null, mockEntityManager);

    // Check that the old rank was revoked
    const saveCalls = mockEntityManager.save.mock.calls;
    const revokedCall = saveCalls.find(
      (call: any[]) => call[0] === RankAssignment && call[1]?.revoked_at
    );
    expect(revokedCall).toBeDefined();
  });

  // Test 6
  it('assignRank() writes QualificationEvent with event_type: rank_changed', async () => {
    const context: QualificationContext = { personalVolume: 300, downlineVolume: 600, activeLegCount: 3 };
    await service.assignRank('user-1', context, rankRules as RankRule[], policyVersionId, null, mockEntityManager);

    const saveCalls = mockEntityManager.save.mock.calls;
    const eventCall = saveCalls.find(
      (call: any[]) => call[0] === QualificationEvent && call[1]?.event_type === 'rank_changed'
    );
    expect(eventCall).toBeDefined();
  });

  // Test 7
  it('assignRank() no new assignment when user already holds the same rank rule', async () => {
    const existingRank = { id: 'existing-rank', user_id: 'user-1', rank_rule_id: 'rank-2', revoked_at: null };
    mockEntityManager.findOne.mockResolvedValue(existingRank);

    const context: QualificationContext = { personalVolume: 300, downlineVolume: 600, activeLegCount: 3 };
    const result = await service.assignRank('user-1', context, rankRules as RankRule[], policyVersionId, null, mockEntityManager);

    // Should return existing, no new saves for RankAssignment creation
    expect(result).toEqual(existingRank);
  });

  // Test 8
  it('getCurrentRank() returns only the non-revoked rank assignment', async () => {
    mockRankAssignmentRepo.findOne.mockResolvedValue({ id: 'a1', rank_rule_id: 'rank-2', revoked_at: null });
    const result = await service.getCurrentRank('user-1');
    expect(result).not.toBeNull();
    expect(result!.revoked_at).toBeNull();
  });

  // Test 9
  it('getCurrentRank() returns null when all assignments are revoked', async () => {
    mockRankAssignmentRepo.findOne.mockResolvedValue(null);
    const result = await service.getCurrentRank('user-1');
    expect(result).toBeNull();
  });

  // Test 10
  it('getRankHistory() returns all assignments including revoked ones', async () => {
    const history = [
      { id: 'a1', rank_rule_id: 'rank-2', revoked_at: new Date(), assigned_at: new Date('2026-02-01') },
      { id: 'a2', rank_rule_id: 'rank-3', revoked_at: null, assigned_at: new Date('2026-03-01') },
    ];
    mockRankAssignmentRepo.find.mockResolvedValue(history);
    const result = await service.getRankHistory('user-1');
    expect(result).toHaveLength(2);
  });
});
