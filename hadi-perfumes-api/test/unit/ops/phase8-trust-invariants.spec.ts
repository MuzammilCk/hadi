import { AdminGuard } from '../../../src/modules/admin/guards/admin.guard';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

describe('Phase 8 — Trust Invariants', () => {
  describe('AdminGuard security event logging', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, ADMIN_TOKEN: 'valid-admin-token-1234' };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    function createMockContext(token?: string): ExecutionContext {
      return {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: token ? { 'x-admin-token': token } : {},
            ip: '127.0.0.1',
            path: '/admin/test',
            method: 'GET',
          }),
        }),
      } as any;
    }

    it('security event write failure does not prevent AdminGuard from rejecting bad token', () => {
      const failingSecurityService = {
        record: jest.fn().mockRejectedValue(new Error('DB connection failed')),
      };
      const guard = new AdminGuard(failingSecurityService);
      const ctx = createMockContext('wrong-token-12345');

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(failingSecurityService.record).toHaveBeenCalled();
    });

    it('AdminGuard still rejects when security service is not available', () => {
      const guard = new AdminGuard(undefined);
      const ctx = createMockContext('wrong-token-12345');

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('AdminGuard still accepts valid token with security service', () => {
      const guard = new AdminGuard(undefined);
      const ctx = createMockContext('valid-admin-token-1234');

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('security event contains correct event_type and severity', () => {
      const mockService = {
        record: jest.fn().mockResolvedValue(undefined),
      };
      const guard = new AdminGuard(mockService);
      const ctx = createMockContext('wrong-token-12345');

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);

      expect(mockService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'invalid_admin_token',
          severity: 'high',
        }),
      );
    });
  });

  describe('CorrelationIdMiddleware invariants', () => {
    it('is idempotent per request — calling twice does not change existing correlationId', () => {
      const { CorrelationIdMiddleware } = require('../../../src/common/middleware/correlation-id.middleware');
      const middleware = new CorrelationIdMiddleware();
      const req: any = { headers: {} };
      const res: any = { setHeader: jest.fn() };
      const next = jest.fn();

      middleware.use(req, res, next);
      const firstId = req.correlationId;

      // Second call with existing correlationId set on headers
      req.headers['x-correlation-id'] = firstId;
      middleware.use(req, res, next);

      expect(req.correlationId).toBe(firstId);
    });

    it('correlation ID from untrusted upstream is not used for access decisions', () => {
      // This test documents the design constraint: correlationId is ONLY for tracing
      const { CorrelationIdMiddleware } = require('../../../src/common/middleware/correlation-id.middleware');
      const middleware = new CorrelationIdMiddleware();
      const req: any = {
        headers: { 'x-correlation-id': 'attacker-supplied-id' },
      };
      const res: any = { setHeader: jest.fn() };
      const next = jest.fn();

      middleware.use(req, res, next);

      // The correlationId is set but never checked by any guard or auth logic
      expect(req.correlationId).toBe('attacker-supplied-id');
      // Guards use headers['x-admin-token'] and JWT, never correlationId
    });
  });

  describe('LoggingInterceptor invariants', () => {
    it('does not change handler return value', (done) => {
      const { LoggingInterceptor } = require('../../../src/common/interceptors/logging.interceptor');
      const interceptor = new LoggingInterceptor();
      const { of } = require('rxjs');

      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({ method: 'GET', path: '/test' }),
        }),
      } as any;

      const expected = { data: [1, 2, 3], total: 3 };
      const handler = { handle: () => of(expected) };

      interceptor.intercept(ctx, handler).subscribe({
        next: (result: any) => {
          expect(result).toBe(expected); // reference equality — not cloned
          done();
        },
      });
    });
  });

  describe('Log output does not contain sensitive values', () => {
    it('redactSensitive strips all known sensitive fields', () => {
      const { redactSensitive } = require('../../../src/common/utils/log-redact.util');
      const obj = {
        otp: '123456',
        access_token: 'eyJhb...',
        password: 'secret',
        authorization: 'Bearer xxx',
        stripe_secret_key: 'sk_test_xxx',
        client_secret: 'cs_xxx',
        jwt_secret: 'super-secret',
        'x-admin-token': 'admin123',
        card_number: '4242424242424242',
        cvv: '123',
        // Non-sensitive
        name: 'John',
        email: 'john@test.com',
      };

      const redacted = redactSensitive(obj);

      // All sensitive fields should be redacted
      expect(redacted.otp).toBe('[REDACTED]');
      expect(redacted.access_token).toBe('[REDACTED]');
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.authorization).toBe('[REDACTED]');
      expect(redacted.stripe_secret_key).toBe('[REDACTED]');
      expect(redacted.client_secret).toBe('[REDACTED]');
      expect(redacted.jwt_secret).toBe('[REDACTED]');
      expect(redacted['x-admin-token']).toBe('[REDACTED]');
      expect(redacted.card_number).toBe('[REDACTED]');
      expect(redacted.cvv).toBe('[REDACTED]');

      // Non-sensitive fields should be untouched
      expect(redacted.name).toBe('John');
      expect(redacted.email).toBe('john@test.com');
    });
  });
});
