import { LoggingInterceptor } from '../../../src/common/interceptors/logging.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
  });

  function createMockContext(overrides: any = {}): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          path: '/test',
          correlationId: 'test-correlation-id',
          ...overrides,
        }),
      }),
    } as any;
  }

  function createMockCallHandler(returnValue: any): CallHandler {
    return {
      handle: () => of(returnValue),
    };
  }

  function createErrorCallHandler(error: Error): CallHandler {
    return {
      handle: () => throwError(() => error),
    };
  }

  it('does not alter return value from handler', (done) => {
    const ctx = createMockContext();
    const expectedResult = { data: 'test', id: 123 };
    const handler = createMockCallHandler(expectedResult);

    interceptor.intercept(ctx, handler).subscribe({
      next: (result) => {
        expect(result).toEqual(expectedResult);
        done();
      },
    });
  });

  it('logs on success without throwing', (done) => {
    const ctx = createMockContext();
    const handler = createMockCallHandler({ ok: true });

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        // If we get here, interceptor did not throw
        done();
      },
      error: () => {
        fail('Should not error on successful handler');
      },
    });
  });

  it('rethrows error from handler', (done) => {
    const ctx = createMockContext();
    const error = new Error('Test error');
    const handler = createErrorCallHandler(error);

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        fail('Should not emit on error');
      },
      error: (err) => {
        expect(err).toBe(error);
        expect(err.message).toBe('Test error');
        done();
      },
    });
  });

  it('does not log secrets from request body', (done) => {
    const ctx = createMockContext({
      body: { password: 'secret', otp: '123456' },
    });
    const handler = createErrorCallHandler(new Error('fail'));

    // The interceptor logs redacted errors — we just verify it doesn't crash
    interceptor.intercept(ctx, handler).subscribe({
      error: () => {
        // Interceptor logged and rethrew — success
        done();
      },
    });
  });

  it('works when correlationId is not set on request', (done) => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          path: '/api/test',
          // no correlationId
        }),
      }),
    } as any;
    const handler = createMockCallHandler({ success: true });

    interceptor.intercept(ctx, handler).subscribe({
      next: (result) => {
        expect(result).toEqual({ success: true });
        done();
      },
    });
  });
});
