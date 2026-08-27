import { UnauthorizedException } from '@nestjs/common';

describe('Phase 8 — Trust Invariants', () => {
  // AdminGuard tests removed — guard was replaced by JwtAuthGuard + RolesGuard in Phase 9.
  // JWT auth is tested via e2e specs that send Bearer tokens.

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
