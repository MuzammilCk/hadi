jest.setTimeout(30000);

import { v4 as uuidv4 } from 'uuid';
import { ModerationService } from '../../../src/modules/trust/moderation/services/moderation.service';
import { ModerationTargetType, ModerationActionType } from '../../../src/modules/trust/moderation/entities/moderation-action.entity';

describe('ModerationService', () => {
  let service: ModerationService;
  let mockModerationRepo: any;
  let mockAuditService: any;
  let mockDataSource: any;

  beforeEach(() => {
    mockModerationRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation(async (d: any) => ({ id: uuidv4(), ...d })),
      create: jest.fn().mockImplementation((d: any) => d),
      update: jest.fn().mockResolvedValue({}),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };
    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    mockDataSource = {};
  });

  function buildService() {
    service = new ModerationService(
      mockModerationRepo,
      mockAuditService,
      mockDataSource,
    );
  }

  it('applyModerationAction: idempotency — returns existing if key already exists', async () => {
    const existing = { id: uuidv4(), idempotency_key: 'mod-key' };
    mockModerationRepo.findOne.mockResolvedValue(existing);
    buildService();

    const result = await service.applyModerationAction(uuidv4(), {
      target_type: ModerationTargetType.USER,
      target_id: uuidv4(),
      action_type: ModerationActionType.SUSPEND,
      reason: 'Testing suspension action',
      idempotency_key: 'mod-key',
    });

    expect(result).toBe(existing);
    expect(mockModerationRepo.save).not.toHaveBeenCalled();
  });

  it('applyModerationAction: creates action and audit logs', async () => {
    buildService();

    const result = await service.applyModerationAction(uuidv4(), {
      target_type: ModerationTargetType.USER,
      target_id: uuidv4(),
      action_type: ModerationActionType.WARN,
      reason: 'Violation of terms of service',
      idempotency_key: uuidv4(),
    });

    expect(result).toBeDefined();
    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'moderation.warn' }),
    );
  });

  it('reverseModerationAction: throws if action not found', async () => {
    buildService();
    await expect(service.reverseModerationAction(uuidv4(), uuidv4()))
      .rejects.toThrow('Moderation action');
  });

  it('reverseModerationAction: throws if already reversed', async () => {
    const reversedAction = {
      id: uuidv4(),
      reversed_at: new Date(),
    };
    mockModerationRepo.findOne.mockResolvedValue(reversedAction);
    buildService();

    await expect(service.reverseModerationAction(reversedAction.id, uuidv4()))
      .rejects.toThrow('already been reversed');
  });

  it('getModerationAction: throws if not found', async () => {
    buildService();
    await expect(service.getModerationAction(uuidv4()))
      .rejects.toThrow('Moderation action');
  });
});
