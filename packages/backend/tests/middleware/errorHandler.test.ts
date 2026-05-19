import { Request, Response, NextFunction } from 'express';
import { errorHandler, notFoundHandler, createAppError } from '../../src/middleware/errorHandler';

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/api/v1/test',
    url: '/api/v1/test',
    requestId: 'test-request-id',
    ...overrides,
  } as unknown as Request;
}

function createMockResponse(): Response & { _status: number; _json: unknown } {
  const res = {
    _status: 200,
    _json: null as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._json = body;
      return res;
    },
  };
  return res as unknown as Response & { _status: number; _json: unknown };
}

describe('errorHandler middleware', () => {
  it('should return consistent error format with requestId', () => {
    const err = createAppError('Something went wrong', 400);
    const req = createMockRequest({ requestId: 'req-123' } as Partial<Request>);
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    errorHandler(err, req, res, next);

    expect(res._status).toBe(400);
    const body = res._json as Record<string, unknown>;
    expect(body.status).toBe(400);
    expect(body.error).toBe('Bad Request');
    expect(body.message).toBe('Something went wrong');
    expect(body.requestId).toBe('req-123');
  });

  it('should hide internal error messages for 500 errors', () => {
    const err = new Error('Database connection failed') as any;
    err.statusCode = 500;
    const req = createMockRequest();
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    errorHandler(err, req, res, next);

    expect(res._status).toBe(500);
    const body = res._json as Record<string, unknown>;
    expect(body.message).toBe('Internal Server Error');
    expect(body.message).not.toContain('Database');
  });

  it('should default to 500 when no statusCode is set', () => {
    const err = new Error('Unexpected error');
    const req = createMockRequest();
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    errorHandler(err, req, res, next);

    expect(res._status).toBe(500);
  });

  it('should include details for client errors', () => {
    const err = createAppError('Validation failed', 422, { fields: { email: ['Invalid format'] } });
    const req = createMockRequest();
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    errorHandler(err, req, res, next);

    const body = res._json as Record<string, unknown>;
    expect(body.details).toEqual({ fields: { email: ['Invalid format'] } });
  });

  it('should not include details for server errors', () => {
    const err = createAppError('Internal issue', 500, { sensitive: 'data' });
    const req = createMockRequest();
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    errorHandler(err, req, res, next);

    const body = res._json as Record<string, unknown>;
    expect(body.details).toBeUndefined();
  });
});

describe('notFoundHandler middleware', () => {
  it('should create a 404 error for unmatched routes', () => {
    const req = createMockRequest({ method: 'GET', originalUrl: '/api/v1/nonexistent' });
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    notFoundHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: expect.stringContaining('/api/v1/nonexistent'),
      }),
    );
  });
});

describe('createAppError', () => {
  it('should create an error with statusCode and isOperational flag', () => {
    const err = createAppError('Not found', 404);

    expect(err.message).toBe('Not found');
    expect(err.statusCode).toBe(404);
    expect(err.isOperational).toBe(true);
  });

  it('should include details when provided', () => {
    const err = createAppError('Bad request', 400, { field: 'email' });

    expect(err.details).toEqual({ field: 'email' });
  });
});
