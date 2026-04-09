jest.setTimeout(30000);

import { v4 as uuidv4 } from 'uuid';
import { TrustAuditService } from '../../../src/modules/trust/audit/services/trust-audit.service';

describe('TrustAuditService', () => {
  let service: TrustAuditService;
  let mockRepo: any;
  let savedEntities: any[];

  beforeEach(() => {
    savedEntities = [];
    mockRepo = {
      manager: {
        save: jest.fn().mockImplementation(async (_: any, data: any) => {
          const saved = { id: uuidv4(), ...data };
          savedEntities.push(saved);
          return saved;
        }),
        create: jest.fn().mockImplementation((_: any, d: any) => d),
      },
    };
    service = new TrustAuditService(mockRepo);
  });

  it('logs an audit entry using default manager', async () => {
    await service.log({
      actorId: uuidv4(),
      actorType: 'admin',
      action: 'test.action',
      entityType: 'test_entity',
      entityId: uuidv4(),
      metadata: { key: 'value' },
    });

    expect(savedEntities).toHaveLength(1);
    expect(savedEntities[0].action).toBe('test.action');
    expect(savedEntities[0].actor_type).toBe('admin');
    expect(savedEntities[0].metadata).toEqual({ key: 'value' });
  });

  it('logs an audit entry with provided EntityManager', async () => {
    const emSaves: any[] = [];
    const customEm = {
      save: jest.fn().mockImplementation(async (_: any, data: any) => {
        const saved = { id: uuidv4(), ...data };
        emSaves.push(saved);
        return saved;
      }),
      create: jest.fn().mockImplementation((_: any, d: any) => d),
    };

    await service.log({
      actorId: null,
      actorType: 'system',
      action: 'system.heartbeat',
      entityType: 'system',
      entityId: uuidv4(),
    }, customEm as any);

    // Should have used the custom EM, not the default repo manager
    expect(emSaves).toHaveLength(1);
    expect(savedEntities).toHaveLength(0);
    expect(emSaves[0].actor_type).toBe('system');
  });

  it('sets metadata to null if not provided', async () => {
    await service.log({
      actorId: uuidv4(),
      actorType: 'customer',
      action: 'test.no_metadata',
      entityType: 'return_request',
      entityId: uuidv4(),
    });

    expect(savedEntities[0].metadata).toBeNull();
  });
});
