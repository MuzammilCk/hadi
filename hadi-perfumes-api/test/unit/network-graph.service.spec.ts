import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, IsNull } from 'typeorm';
import { NetworkGraphService } from '../../src/modules/network/services/network-graph.service';
import { NetworkNode } from '../../src/modules/network/entities/network-node.entity';
import { GraphRebuildJob } from '../../src/modules/network/entities/graph-rebuild-job.entity';
import { GraphCorrectionLog } from '../../src/modules/network/entities/graph-correction-log.entity';
import { NetworkSnapshot } from '../../src/modules/network/entities/network-snapshot.entity';
import { QualificationEvent } from '../../src/modules/network/entities/qualification-event.entity';
import { SponsorshipLink } from '../../src/modules/referral/entities/sponsorship-link.entity';
import { User } from '../../src/modules/user/entities/user.entity';
import { OnboardingAuditLog } from '../../src/modules/auth/entities/onboarding-audit-log.entity';
import { NetworkCycleException } from '../../src/modules/network/exceptions/network.exceptions';

jest.setTimeout(30000);

describe('NetworkGraphService (Unit)', () => {
  let service: NetworkGraphService;
  let mockNodeRepo: any;
  let mockJobRepo: any;
  let mockCorrectionLogRepo: any;
  let mockSnapshotRepo: any;
  let mockQualEventRepo: any;
  let mockLinkRepo: any;
  let mockUserRepo: any;
  let mockAuditLogRepo: any;
  let mockEntityManager: any;

  const createMockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((data) => ({ ...data })),
    save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 'mock-id', ...entity })),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
    }),
  });

  beforeEach(async () => {
    mockNodeRepo = createMockRepo();
    mockJobRepo = createMockRepo();
    mockCorrectionLogRepo = createMockRepo();
    mockSnapshotRepo = createMockRepo();
    mockQualEventRepo = createMockRepo();
    mockLinkRepo = createMockRepo();
    mockUserRepo = createMockRepo();
    mockAuditLogRepo = createMockRepo();
    mockEntityManager = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((_, data) => ({ ...data })),
      save: jest.fn().mockImplementation((_, entity) => Promise.resolve({ id: 'mock-id', ...entity })),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        getOne: jest.fn().mockResolvedValue(null),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NetworkGraphService,
        { provide: getRepositoryToken(NetworkNode), useValue: mockNodeRepo },
        { provide: getRepositoryToken(GraphRebuildJob), useValue: mockJobRepo },
        { provide: getRepositoryToken(GraphCorrectionLog), useValue: mockCorrectionLogRepo },
        { provide: getRepositoryToken(NetworkSnapshot), useValue: mockSnapshotRepo },
        { provide: getRepositoryToken(QualificationEvent), useValue: mockQualEventRepo },
        { provide: getRepositoryToken(SponsorshipLink), useValue: mockLinkRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(OnboardingAuditLog), useValue: mockAuditLogRepo },
        { provide: EntityManager, useValue: mockEntityManager },
      ],
    }).compile();

    service = module.get<NetworkGraphService>(NetworkGraphService);
  });

  // Test 1
  it('buildNodeForUser() sets depth=0, upline_path=[] when no SponsorshipLink exists', async () => {
    mockEntityManager.findOne.mockResolvedValue(null); // no link, no existing node

    const result = await service.buildNodeForUser('user-1', mockEntityManager);

    expect(result.depth).toBe(0);
    expect(result.sponsor_id).toBeNull();
  });

  // Test 2
  it('buildNodeForUser() sets depth=1, upline_path=[sponsorId] when SponsorshipLink exists with 1-element path', async () => {
    const sponsorId = 'sponsor-1';
    mockEntityManager.findOne
      .mockResolvedValueOnce({
        user_id: 'user-1',
        sponsor_id: sponsorId,
        upline_path: JSON.stringify([sponsorId]),
        corrected_at: null,
        created_at: new Date(),
      }) // SponsorshipLink
      .mockResolvedValueOnce(null); // No existing NetworkNode

    const result = await service.buildNodeForUser('user-1', mockEntityManager);

    expect(result.depth).toBe(1);
    expect(result.sponsor_id).toBe(sponsorId);
  });

  // Test 3
  it('buildNodeForUser() throws NetworkCycleException when userId is already in upline_path', async () => {
    const userId = 'user-1';
    mockEntityManager.findOne.mockResolvedValueOnce({
      user_id: userId,
      sponsor_id: 'sponsor-1',
      upline_path: JSON.stringify([userId, 'sponsor-1']),
      corrected_at: null,
      created_at: new Date(),
    });

    await expect(service.buildNodeForUser(userId, mockEntityManager))
      .rejects
      .toThrow(NetworkCycleException);
  });

  // Test 4
  it('detectCycle() returns true when userId is in path', () => {
    expect(service.detectCycle('user-1', ['root', 'user-1', 'other'])).toBe(true);
  });

  // Test 5
  it('detectCycle() returns false for empty path', () => {
    expect(service.detectCycle('user-1', [])).toBe(false);
  });

  // Test 6
  it('detectCycle() returns false when userId is not in path', () => {
    expect(service.detectCycle('user-1', ['root', 'sponsor-1'])).toBe(false);
  });

  // Test 7
  it('parsePath() handles already-parsed string array correctly', () => {
    const parsed = (service as any).parsePath(['uuid1', 'uuid2']);
    expect(parsed).toEqual(['uuid1', 'uuid2']);
  });

  // Test 8
  it('parsePath() handles raw JSON string correctly', () => {
    const parsed = (service as any).parsePath('["uuid1","uuid2"]');
    expect(parsed).toEqual(['uuid1', 'uuid2']);
  });

  // Test 9
  it('parsePath() returns [] for null/undefined input', () => {
    expect((service as any).parsePath(null)).toEqual([]);
    expect((service as any).parsePath(undefined)).toEqual([]);
  });

  // Test 10
  it('getDownline() returns all nodes matching LIKE pattern', async () => {
    const mockNodes = [
      { user_id: 'child-1', depth: 2, sponsor_id: 'user-1', upline_path: '["user-1"]' },
      { user_id: 'child-2', depth: 3, sponsor_id: 'child-1', upline_path: '["user-1","child-1"]' },
    ];
    mockNodeRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(mockNodes),
    });

    const result = await service.getDownline('user-1');
    expect(result).toHaveLength(2);
  });

  // Test 11
  it('getDirectRecruits() returns only nodes where sponsor_id matches userId', async () => {
    const directNodes = [
      { user_id: 'child-1', sponsor_id: 'user-1' },
    ];
    mockNodeRepo.find.mockResolvedValue(directNodes);

    const result = await service.getDirectRecruits('user-1');
    expect(result).toHaveLength(1);
    expect(result[0].sponsor_id).toBe('user-1');
  });

  // Test 12
  it('applyGraphCorrection() throws NetworkCycleException if new path creates cycle', async () => {
    const dto = { userId: 'user-1', newSponsorId: 'child-1', reason: 'Test correction reason' };
    const mockEm = {
      findOne: jest.fn()
        .mockResolvedValueOnce({ user_id: 'user-1', sponsor_id: 'old-sponsor', upline_path: '[]' }) // current node
        .mockResolvedValueOnce({ user_id: 'child-1', sponsor_id: 'user-1', upline_path: JSON.stringify(['user-1']) }), // new sponsor's node has user-1 in path
      create: jest.fn().mockImplementation((_, data) => data),
      save: jest.fn().mockResolvedValue({}),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    } as any;

    await expect(service.applyGraphCorrection(dto, 'admin-1', mockEm))
      .rejects
      .toThrow(NetworkCycleException);
  });

  // Test 13
  it('applyGraphCorrection() throws BadRequestException if userId === newSponsorId', async () => {
    const dto = { userId: 'user-1', newSponsorId: 'user-1', reason: 'Test correction reason' };
    const mockEm = {} as any;

    await expect(service.applyGraphCorrection(dto, 'admin-1', mockEm))
      .rejects
      .toThrow('Cannot assign a user as their own sponsor');
  });
});
