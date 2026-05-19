import { Request, Response } from 'express';
import { requestIdMiddleware } from '../../src/middleware/requestId';

function createMockRequest(headers: Record<string, string> = {}): Request {
  return {
    headers,
  } as unknown as Request;
}

function createMockResponse(): Response & { _headers: Record<string, string> } {
  const res = {
    _headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      res._headers[name] = value;
      return res;
    },
  };
  return res as unknown as Response & { _headers: Record<string, string> };
}

describe('requestIdMiddleware', () => {
  it('should generate a UUID requestId when none is provided', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBeDefined();
    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(res._headers['X-Request-Id']).toBe(req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('should use the X-Request-Id header if provided', () => {
    const req = createMockRequest({ 'x-request-id': 'custom-id-123' });
    const res = createMockResponse();
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('custom-id-123');
    expect(res._headers['X-Request-Id']).toBe('custom-id-123');
    expect(next).toHaveBeenCalled();
  });

  it('should set the requestId on the response header', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(res._headers['X-Request-Id']).toBeDefined();
    expect(res._headers['X-Request-Id']).toBe(req.requestId);
  });
});
