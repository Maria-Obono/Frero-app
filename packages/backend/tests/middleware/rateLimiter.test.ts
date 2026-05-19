import { Request, Response, NextFunction } from 'express';
import { rateLimiter, memoryStore } from '../../src/middleware/rateLimiter';

// Mock the config
jest.mock('../../src/config', () => ({
  config: {
    rateLimit: {
      authenticatedMaxRequests: 100,
      unauthenticatedMaxRequests: 20,
      windowMs: 60000,
    },
  },
}));

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
    requestId: 'test-request-id',
    ...overrides,
  } as unknown as Request;
}

function createMockResponse(): Response & { _headers: Record<string, string>; _status: number; _json: unknown } {
  const res = {
    _headers: {} as Record<string, string>,
    _status: 200,
    _json: null as unknown,
    setHeader(name: string, value: string) {
      res._headers[name] = value;
      return res;
    },
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._json = body;
      return res;
    },
  };
  return res as unknown as Response & { _headers: Record<string, string>; _status: number; _json: unknown };
}

describe('rateLimiter middleware', () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it('should allow requests under the limit for unauthenticated users', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = jest.fn();

    rateLimiter(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res._headers['X-RateLimit-Limit']).toBe('20');
    expect(res._headers['X-RateLimit-Remaining']).toBe('19');
  });

  it('should allow requests under the limit for authenticated users', () => {
    const req = createMockRequest({ userId: 'user-123' } as Partial<Request>);
    const res = createMockResponse();
    const next = jest.fn();

    rateLimiter(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res._headers['X-RateLimit-Limit']).toBe('100');
    expect(res._headers['X-RateLimit-Remaining']).toBe('99');
  });

  it('should block requests exceeding the unauthenticated limit', () => {
    const ip = '192.168.1.1';

    // Make 20 requests (the limit)
    for (let i = 0; i < 20; i++) {
      const req = createMockRequest({ ip });
      const res = createMockResponse();
      const next = jest.fn();
      rateLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
    }

    // 21st request should be blocked
    const req = createMockRequest({ ip });
    const res = createMockResponse();
    const next = jest.fn();
    rateLimiter(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(429);
    expect((res._json as Record<string, unknown>).error).toBe('Too Many Requests');
    expect(res._headers['Retry-After']).toBeDefined();
  });

  it('should block requests exceeding the authenticated limit', () => {
    const userId = 'user-456';

    // Make 100 requests (the limit)
    for (let i = 0; i < 100; i++) {
      const req = createMockRequest({ userId } as Partial<Request>);
      const res = createMockResponse();
      const next = jest.fn();
      rateLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
    }

    // 101st request should be blocked
    const req = createMockRequest({ userId } as Partial<Request>);
    const res = createMockResponse();
    const next = jest.fn();
    rateLimiter(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(429);
  });

  it('should include Retry-After header when rate limited', () => {
    const ip = '10.0.0.1';

    // Exhaust the limit
    for (let i = 0; i < 21; i++) {
      const req = createMockRequest({ ip });
      const res = createMockResponse();
      const next = jest.fn();
      rateLimiter(req, res, next);
    }

    const req = createMockRequest({ ip });
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;
    rateLimiter(req, res, next);

    expect(res._headers['Retry-After']).toBeDefined();
    const retryAfter = parseInt(res._headers['Retry-After'] || '0');
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('should include requestId in rate limit error response', () => {
    const ip = '10.0.0.2';

    // Exhaust the limit
    for (let i = 0; i < 21; i++) {
      const req = createMockRequest({ ip, requestId: 'req-abc' } as Partial<Request>);
      const res = createMockResponse();
      const next = jest.fn();
      rateLimiter(req, res, next);
    }

    const req = createMockRequest({ ip, requestId: 'req-abc' } as Partial<Request>);
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;
    rateLimiter(req, res, next);

    expect((res._json as Record<string, unknown>).requestId).toBe('req-abc');
  });

  it('should track different IPs separately', () => {
    // Exhaust limit for IP 1
    for (let i = 0; i < 21; i++) {
      const req = createMockRequest({ ip: '1.1.1.1' });
      const res = createMockResponse();
      const next = jest.fn();
      rateLimiter(req, res, next);
    }

    // IP 2 should still be allowed
    const req = createMockRequest({ ip: '2.2.2.2' });
    const res = createMockResponse();
    const next = jest.fn();
    rateLimiter(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should set X-RateLimit-Reset header', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = jest.fn();

    rateLimiter(req, res, next);

    expect(res._headers['X-RateLimit-Reset']).toBeDefined();
    const resetTime = parseInt(res._headers['X-RateLimit-Reset'] || '0');
    expect(resetTime).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});
