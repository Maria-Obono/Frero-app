import * as fc from 'fast-check';
import { Request, Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../../src/middleware/validateBody';
import { parsePaginationParams, PAGINATION_DEFAULTS, paginationSchema } from '../../src/utils/pagination';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockRequest(body: unknown = {}): Request {
  return {
    body,
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

// ============================================================================
// Property 33: Request body schema validation
// ============================================================================

/**
 * **Validates: Requirements 12.5**
 *
 * Property 33: Request body schema validation
 * For any request body, the validation middleware SHALL accept bodies that
 * conform to the endpoint-specific Zod schema and reject bodies that do not,
 * returning field-specific errors.
 */
describe('Property 33: Request body schema validation', () => {
  // A representative endpoint schema (user registration)
  const registrationSchema = z.object({
    email: z.string().email(),
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9]+$/),
    password: z.string().min(8).max(128),
  });

  // A profile update schema
  const profileUpdateSchema = z.object({
    displayName: z.string().min(1).max(50).optional(),
    bio: z.string().max(500).optional(),
    location: z.string().max(100).optional(),
    website: z.string().max(200).optional(),
  });

  it('should accept any body that conforms to the schema', () => {
    // Generate emails that Zod's email validator will accept
    const validEmailArb = fc
      .tuple(
        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9.]{0,10}$/),
        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/),
        fc.constantFrom('com', 'org', 'net', 'io', 'dev')
      )
      .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

    const validUsernameArb = fc.stringMatching(/^[a-zA-Z0-9]{3,30}$/);
    const validPasswordArb = fc.string({ minLength: 8, maxLength: 128 }).filter((s) => s.length >= 8);

    fc.assert(
      fc.property(
        fc.record({
          email: validEmailArb,
          username: validUsernameArb,
          password: validPasswordArb,
        }),
        (validBody) => {
          // Pre-check: only test values that the schema actually accepts
          const preCheck = registrationSchema.safeParse(validBody);
          if (!preCheck.success) return; // Skip edge cases the generator can't avoid

          const req = createMockRequest(validBody);
          const res = createMockResponse();
          const next = jest.fn();

          validateBody(registrationSchema)(req, res, next);

          expect(next).toHaveBeenCalled();
          expect(res._status).toBe(200); // unchanged, meaning no error response
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject any body with an invalid email and return field-specific errors', () => {
    fc.assert(
      fc.property(
        fc.record({
          email: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('@') || !s.includes('.')),
          username: fc.stringMatching(/^[a-zA-Z0-9]{3,30}$/),
          password: fc.string({ minLength: 8, maxLength: 128 }),
        }),
        (invalidBody) => {
          // Verify the email is actually invalid per Zod
          const parseResult = registrationSchema.safeParse(invalidBody);
          if (parseResult.success) return; // Skip if accidentally valid

          const req = createMockRequest(invalidBody);
          const res = createMockResponse();
          const next = jest.fn();

          validateBody(registrationSchema)(req, res, next);

          expect(next).not.toHaveBeenCalled();
          expect(res._status).toBe(422);
          const body = res._json as Record<string, unknown>;
          expect(body.status).toBe(422);
          expect(body.error).toBe('Unprocessable Entity');
          expect(body.message).toBe('Request body validation failed');
          expect(body.requestId).toBe('test-request-id');
          const details = body.details as { fields: Record<string, string[]> };
          expect(details.fields).toBeDefined();
          // At least one field should have errors
          expect(Object.keys(details.fields).length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject bodies with missing required fields and identify the failing fields', () => {
    fc.assert(
      fc.property(
        // Generate objects missing at least one required field
        fc.oneof(
          fc.record({
            email: fc.emailAddress(),
            username: fc.stringMatching(/^[a-zA-Z0-9]{3,30}$/),
            // missing password
          }),
          fc.record({
            email: fc.emailAddress(),
            // missing username
            password: fc.string({ minLength: 8, maxLength: 128 }),
          }),
          fc.record({
            // missing email
            username: fc.stringMatching(/^[a-zA-Z0-9]{3,30}$/),
            password: fc.string({ minLength: 8, maxLength: 128 }),
          })
        ),
        (partialBody) => {
          const req = createMockRequest(partialBody);
          const res = createMockResponse();
          const next = jest.fn();

          validateBody(registrationSchema)(req, res, next);

          expect(next).not.toHaveBeenCalled();
          expect(res._status).toBe(422);
          const body = res._json as Record<string, unknown>;
          const details = body.details as { fields: Record<string, string[]> };
          expect(details.fields).toBeDefined();
          // The missing field should be reported
          const fieldNames = Object.keys(details.fields);
          expect(fieldNames.length).toBeGreaterThan(0);
          // Each reported field should have at least one error message
          for (const field of fieldNames) {
            const fieldErrors = details.fields[field]!;
            expect(fieldErrors.length).toBeGreaterThan(0);
            // Error messages should be strings
            for (const msg of fieldErrors) {
              expect(typeof msg).toBe('string');
              expect(msg.length).toBeGreaterThan(0);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept valid profile updates with optional fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          displayName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          bio: fc.option(fc.string({ minLength: 0, maxLength: 500 }), { nil: undefined }),
          location: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
          website: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
        }),
        (validBody) => {
          const req = createMockRequest(validBody);
          const res = createMockResponse();
          const next = jest.fn();

          validateBody(profileUpdateSchema)(req, res, next);

          expect(next).toHaveBeenCalled();
          expect(res._status).toBe(200);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject profile updates with fields exceeding length limits', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // bio exceeds 500 chars
          fc.record({
            bio: fc.string({ minLength: 501, maxLength: 600 }),
          }),
          // displayName exceeds 50 chars
          fc.record({
            displayName: fc.string({ minLength: 51, maxLength: 100 }),
          }),
          // location exceeds 100 chars
          fc.record({
            location: fc.string({ minLength: 101, maxLength: 200 }),
          }),
          // website exceeds 200 chars
          fc.record({
            website: fc.string({ minLength: 201, maxLength: 300 }),
          })
        ),
        (invalidBody) => {
          const req = createMockRequest(invalidBody);
          const res = createMockResponse();
          const next = jest.fn();

          validateBody(profileUpdateSchema)(req, res, next);

          expect(next).not.toHaveBeenCalled();
          expect(res._status).toBe(422);
          const body = res._json as Record<string, unknown>;
          const details = body.details as { fields: Record<string, string[]> };
          expect(details.fields).toBeDefined();
          expect(Object.keys(details.fields).length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 34: Pagination parameter enforcement
// ============================================================================

/**
 * **Validates: Requirements 12.9**
 *
 * Property 34: Pagination parameter enforcement
 * For any pagination parameters, the API SHALL enforce a default limit of 20
 * and a maximum limit of 50, clamping values outside this range.
 */
describe('Property 34: Pagination parameter enforcement', () => {
  it('should default to limit of 20 when no limit is provided', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
        (cursor) => {
          const result = parsePaginationParams({ cursor });

          expect(result.limit).toBe(PAGINATION_DEFAULTS.defaultLimit);
          expect(result.limit).toBe(20);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should clamp limit to maximum of 50 for any value above 50', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 51, max: 10000 }),
        (limit) => {
          const result = parsePaginationParams({ limit });

          expect(result.limit).toBe(PAGINATION_DEFAULTS.maxLimit);
          expect(result.limit).toBe(50);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should clamp limit to minimum of 1 for any value below 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 0 }),
        (limit) => {
          const result = parsePaginationParams({ limit });

          expect(result.limit).toBe(PAGINATION_DEFAULTS.minLimit);
          expect(result.limit).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept any limit between 1 and 50 without modification', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (limit) => {
          const result = parsePaginationParams({ limit });

          expect(result.limit).toBe(limit);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle string limit values by parsing and clamping them', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 200 }),
        (numericLimit) => {
          const result = parsePaginationParams({ limit: String(numericLimit) });

          const expected = Math.min(
            Math.max(numericLimit, PAGINATION_DEFAULTS.minLimit),
            PAGINATION_DEFAULTS.maxLimit
          );
          expect(result.limit).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should default to 20 for non-numeric string limit values', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => isNaN(parseInt(s, 10))),
        (invalidLimit) => {
          const result = parsePaginationParams({ limit: invalidLimit });

          expect(result.limit).toBe(PAGINATION_DEFAULTS.defaultLimit);
          expect(result.limit).toBe(20);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should pass through cursor values unchanged', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.integer({ min: 1, max: 50 }),
        (cursor, limit) => {
          const result = parsePaginationParams({ cursor, limit });

          expect(result.cursor).toBe(cursor);
          expect(result.limit).toBe(limit);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should validate via Zod schema with consistent clamping behavior', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -500, max: 500 }),
        (limit) => {
          const result = paginationSchema.parse({ limit });

          const expected = Math.min(
            Math.max(limit, PAGINATION_DEFAULTS.minLimit),
            PAGINATION_DEFAULTS.maxLimit
          );
          expect(result.limit).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });
});
