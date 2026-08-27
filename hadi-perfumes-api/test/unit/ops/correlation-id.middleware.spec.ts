import { CorrelationIdMiddleware, CORRELATION_ID_HEADER } from '../../../src/common/middleware/correlation-id.middleware';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
  });

  it('generates UUID when no X-Correlation-ID header present', () => {
    const req: any = { headers: {} };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.correlationId).toBeDefined();
    expect(req.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(next).toHaveBeenCalled();
  });

  it('reuses X-Correlation-ID header from upstream if present', () => {
    const upstreamId = 'upstream-correlation-id-123';
    const req: any = {
      headers: { 'x-correlation-id': upstreamId },
    };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.correlationId).toBe(upstreamId);
  });

  it('sets X-Correlation-ID on response', () => {
    const req: any = { headers: {} };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      req.correlationId,
    );
  });

  it('attaches correlationId to request object', () => {
    const req: any = { headers: {} };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(typeof req.correlationId).toBe('string');
    expect(req.correlationId.length).toBeGreaterThan(0);
  });

  it('two concurrent requests get different IDs', () => {
    const req1: any = { headers: {} };
    const req2: any = { headers: {} };
    const res1: any = { setHeader: jest.fn() };
    const res2: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req1, res1, next);
    middleware.use(req2, res2, next);

    expect(req1.correlationId).not.toBe(req2.correlationId);
  });

  it('does not modify request body', () => {
    const body = { name: 'test', amount: 100 };
    const req: any = { headers: {}, body: { ...body } };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.body).toEqual(body);
  });
});
