import { SecurityEventService } from '../../../src/modules/ops/services/security-event.service';

describe('SecurityEventService', () => {
  let service: SecurityEventService;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      create: jest.fn((data) => data),
      save: jest.fn().mockResolvedValue({ id: 'test-id' }),
    };
    service = new SecurityEventService(mockRepo);
  });

  it('records a security event with all fields', async () => {
    await service.record({
      event_type: 'invalid_admin_token',
      severity: 'high',
      ip_address: '192.168.1.1',
      path: '/admin/ops',
      method: 'GET',
      details: { reason: 'token_mismatch' },
    });

    expect(mockRepo.save).toHaveBeenCalledTimes(1);
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'invalid_admin_token',
        severity: 'high',
        ip_address: '192.168.1.1',
      }),
    );
  });

  it('applies default severity when not specified', async () => {
    await service.record({ event_type: 'test_event' });

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'medium',
      }),
    );
  });

  it('does not throw when DB write fails', async () => {
    mockRepo.save.mockRejectedValue(new Error('DB connection refused'));

    // Should NOT throw
    await expect(
      service.record({
        event_type: 'invalid_admin_token',
        severity: 'high',
      }),
    ).resolves.not.toThrow();
  });

  it('handles null optional fields', async () => {
    await service.record({
      event_type: 'rate_limit_hit',
    });

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ip_address: null,
        user_id: null,
        path: null,
        method: null,
        details: null,
      }),
    );
  });
});
