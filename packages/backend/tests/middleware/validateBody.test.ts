import { Request, Response } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery, validateParams } from '../../src/middleware/validateBody';

function createMockRequest(body: unknown = {}, query: unknown = {}, params: unknown = {}): Request {
  return {
    body,
    query,
    params,
    requestId: 'test-request-id',
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

describe('validateBody middleware', () => {
  const schema = z.object({
    email: z.string().email(),
    username: z.string().min(3).max(30),
    age: z.number().int().positive().optional(),
  });

  it('should call next() when body is valid', () => {
    const req = createMockRequest({ email: 'test@example.com', username: 'john' });
    const res = createMockResponse();
    const next = jest.fn();

    validateBody(schema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(200); // unchanged
  });

  it('should replace body with parsed data (strips unknown fields)', () => {
    const req = createMockRequest({ name: 'John' });
    const res = createMockResponse();
    const next = jest.fn();

    const looseSchema = z.object({ name: z.string() });
    validateBody(looseSchema)(req, res, next);

    expect(req.body).toEqual({ name: 'John' });
  });

  it('should return 422 with field errors when body is invalid', () => {
    const req = createMockRequest({ email: 'not-an-email', username: 'ab' });
    const res = createMockResponse();
    const next = jest.fn();

    validateBody(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(422);
    const body = res._json as Record<string, unknown>;
    expect(body.status).toBe(422);
    expect(body.error).toBe('Unprocessable Entity');
    expect(body.message).toBe('Request body validation failed');
    expect(body.requestId).toBe('test-request-id');
    expect((body.details as Record<string, unknown>).fields).toBeDefined();
  });

  it('should include specific field error messages', () => {
    const req = createMockRequest({ email: 'bad', username: 'ab' });
    const res = createMockResponse();
    const next = jest.fn();

    validateBody(schema)(req, res, next);

    const body = res._json as Record<string, unknown>;
    const fields = (body.details as Record<string, unknown>).fields as Record<string, string[]>;
    expect(fields.email).toBeDefined();
    expect(fields.email!.length).toBeGreaterThan(0);
    expect(fields.username).toBeDefined();
    expect(fields.username!.length).toBeGreaterThan(0);
  });

  it('should handle nested object validation', () => {
    const nestedSchema = z.object({
      user: z.object({
        name: z.string().min(1),
        email: z.string().email(),
      }),
    });

    const req = createMockRequest({ user: { name: '', email: 'bad' } });
    const res = createMockResponse();
    const next = jest.fn();

    validateBody(nestedSchema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(422);
    const body = res._json as Record<string, unknown>;
    const fields = (body.details as Record<string, unknown>).fields as Record<string, string[]>;
    expect(fields['user.name']).toBeDefined();
    expect(fields['user.email']).toBeDefined();
  });

  it('should transform data through Zod schema', () => {
    const transformSchema = z.object({
      email: z.string().email().toLowerCase(),
    });

    const req = createMockRequest({ email: 'TEST@EXAMPLE.COM' });
    const res = createMockResponse();
    const next = jest.fn();

    validateBody(transformSchema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body.email).toBe('test@example.com');
  });
});

describe('validateQuery middleware', () => {
  const schema = z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
  });

  it('should call next() when query params are valid', () => {
    const req = createMockRequest({}, { page: '1', limit: '20' });
    const res = createMockResponse();
    const next = jest.fn();

    validateQuery(schema)(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 422 when query params are invalid', () => {
    const strictSchema = z.object({
      page: z.string().regex(/^\d+$/),
    });

    const req = createMockRequest({}, { page: 'abc' });
    const res = createMockResponse();
    const next = jest.fn();

    validateQuery(strictSchema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(422);
    const body = res._json as Record<string, unknown>;
    expect(body.message).toBe('Query parameter validation failed');
  });
});

describe('validateParams middleware', () => {
  const schema = z.object({
    id: z.string().uuid(),
  });

  it('should call next() when params are valid', () => {
    const req = createMockRequest({}, {}, { id: '550e8400-e29b-41d4-a716-446655440000' });
    const res = createMockResponse();
    const next = jest.fn();

    validateParams(schema)(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 422 when params are invalid', () => {
    const req = createMockRequest({}, {}, { id: 'not-a-uuid' });
    const res = createMockResponse();
    const next = jest.fn();

    validateParams(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(422);
    const body = res._json as Record<string, unknown>;
    expect(body.message).toBe('Path parameter validation failed');
  });
});
