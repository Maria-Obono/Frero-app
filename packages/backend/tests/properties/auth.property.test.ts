import * as fc from 'fast-check';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Response, NextFunction } from 'express';

import {
  validateEmail,
  validateUsername,
  validatePassword,
  validateRegistrationInput,
} from '../../src/services/auth/validators';
import { AuthService } from '../../src/services/auth/auth.service';
import { authMiddleware, AuthenticatedRequest } from '../../src/middleware/auth';
import { config } from '../../src/config';

// ============================================================================
// Test Helpers & Generators
// ============================================================================

/**
 * Generator for valid emails matching RFC 5322 format.
 */
const validEmailArb = fc
  .tuple(
    fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9.]{0,20}$/),
    fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{1,10}$/),
    fc.constantFrom('com', 'org', 'net', 'io', 'dev', 'co')
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/**
 * Generator for valid usernames (3-30 alphanumeric characters).
 */
const validUsernameArb = fc.stringMatching(/^[a-zA-Z0-9]{3,30}$/);

/**
 * Generator for valid passwords (8-128 chars with uppercase, lowercase, digit, special).
 */
const validPasswordArb = fc
  .tuple(
    fc.stringMatching(/^[A-Z]{1,5}$/),
    fc.stringMatching(/^[a-z]{1,5}$/),
    fc.stringMatching(/^[0-9]{1,3}$/),
    fc.constantFrom('!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '+', '='),
    fc.stringMatching(/^[a-zA-Z0-9!@#$%^&*]{0,110}$/)
  )
  .map(([upper, lower, digit, special, rest]) => `${upper}${lower}${digit}${special}${rest}`)
  .filter((p) => p.length >= 8 && p.length <= 128);

/**
 * Generator for invalid emails (missing @, missing domain, etc.).
 */
const invalidEmailArb = fc.oneof(
  // No @ sign
  fc.stringMatching(/^[a-zA-Z0-9]{3,20}$/),
  // No domain after @
  fc.stringMatching(/^[a-zA-Z0-9]{3,10}@$/),
  // No TLD
  fc.stringMatching(/^[a-zA-Z0-9]{3,10}@[a-zA-Z0-9]{3,10}$/),
  // Empty string
  fc.constant(''),
  // Just spaces
  fc.stringMatching(/^ {1,10}$/)
);

/**
 * Generator for invalid usernames.
 */
const invalidUsernameArb = fc.oneof(
  // Too short (1-2 chars)
  fc.stringMatching(/^[a-zA-Z0-9]{1,2}$/),
  // Too long (31+ chars)
  fc.stringMatching(/^[a-zA-Z0-9]{31,40}$/),
  // Contains special characters
  fc.stringMatching(/^[a-zA-Z0-9]{2,5}[!@#$%^&*][a-zA-Z0-9]{2,5}$/),
  // Empty string
  fc.constant('')
);

/**
 * Generator for invalid passwords.
 */
const invalidPasswordArb = fc.oneof(
  // Too short (< 8 chars)
  fc.stringMatching(/^[a-zA-Z0-9!@#]{1,7}$/),
  // No uppercase
  fc.stringMatching(/^[a-z0-9!@#$%]{8,20}$/),
  // No lowercase
  fc.stringMatching(/^[A-Z0-9!@#$%]{8,20}$/),
  // No digit
  fc.stringMatching(/^[a-zA-Z!@#$%]{8,20}$/),
  // No special character
  fc.stringMatching(/^[a-zA-Z0-9]{8,20}$/),
  // Empty string
  fc.constant('')
);

function createMockRequest(headers: Record<string, string> = {}): AuthenticatedRequest {
  return {
    headers,
    requestId: 'test-request-id',
  } as unknown as AuthenticatedRequest;
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
// Property 1: Registration input validation
// ============================================================================

/**
 * **Validates: Requirements 1.1, 1.3**
 *
 * Property 1: Registration input validation
 * For any email, username, and password combination, the Auth_Service SHALL
 * accept registration if and only if the email matches RFC 5322 format, the
 * username is between 3 and 30 alphanumeric characters, and the password is
 * between 8 and 128 characters containing at least one uppercase letter, one
 * lowercase letter, one digit, and one special character.
 */
describe('Property 1: Registration input validation', () => {
  it('should accept any valid email, username, and password combination', () => {
    fc.assert(
      fc.property(validEmailArb, validUsernameArb, validPasswordArb, (email, username, password) => {
        const result = validateRegistrationInput(email, username, password);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject any invalid email and report the email field', () => {
    fc.assert(
      fc.property(invalidEmailArb, validUsernameArb, validPasswordArb, (email, username, password) => {
        const result = validateRegistrationInput(email, username, password);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.field === 'email')).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject any invalid username and report the username field', () => {
    fc.assert(
      fc.property(validEmailArb, invalidUsernameArb, validPasswordArb, (email, username, password) => {
        const result = validateRegistrationInput(email, username, password);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.field === 'username')).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject any invalid password and report the password field', () => {
    fc.assert(
      fc.property(validEmailArb, validUsernameArb, invalidPasswordArb, (email, username, password) => {
        const result = validateRegistrationInput(email, username, password);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.field === 'password')).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should report all failing fields when multiple inputs are invalid', () => {
    fc.assert(
      fc.property(invalidEmailArb, invalidUsernameArb, invalidPasswordArb, (email, username, password) => {
        const result = validateRegistrationInput(email, username, password);
        expect(result.valid).toBe(false);
        // Should have errors for all three fields
        const fieldNames = result.errors.map((e) => e.field);
        expect(fieldNames).toContain('email');
        expect(fieldNames).toContain('username');
        expect(fieldNames).toContain('password');
      }),
      { numRuns: 100 }
    );
  });

  it('should validate email format correctly for individual validation', () => {
    fc.assert(
      fc.property(validEmailArb, (email) => {
        const error = validateEmail(email);
        expect(error).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('should validate username length boundaries correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 30 }),
        (length) => {
          const username = 'a'.repeat(length);
          const error = validateUsername(username);
          expect(error).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject usernames outside length boundaries', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: 1, max: 2 }),
          fc.integer({ min: 31, max: 50 })
        ),
        (length) => {
          const username = 'a'.repeat(length);
          const error = validateUsername(username);
          expect(error).not.toBeNull();
          expect(error!.field).toBe('username');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should validate password complexity requirements individually', () => {
    fc.assert(
      fc.property(validPasswordArb, (password) => {
        const error = validatePassword(password);
        expect(error).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 2: Registration uniqueness enforcement
// ============================================================================

/**
 * **Validates: Requirements 1.2**
 *
 * Property 2: Registration uniqueness enforcement
 * For any existing user in the system, attempting to register with the same
 * email or username SHALL be rejected with an error indicating the specific
 * duplicate field.
 */
describe('Property 2: Registration uniqueness enforcement', () => {
  it('should reject registration with duplicate email and indicate the email field', () => {
    fc.assert(
      fc.asyncProperty(validEmailArb, validUsernameArb, validPasswordArb, async (email, username, password) => {
        // Create a mock repository that reports email as existing
        const mockUserRepository = {
          emailExists: jest.fn().mockResolvedValue(true),
          usernameExists: jest.fn().mockResolvedValue(false),
          createUser: jest.fn(),
          findByEmail: jest.fn(),
          findByUsername: jest.fn(),
          findByEmailOrUsername: jest.fn(),
          updateLockedUntil: jest.fn(),
        };

        const authService = new AuthService({
          userRepository: mockUserRepository as any,
        });

        try {
          await authService.register({ email, username, password });
          // Should not reach here
          expect(true).toBe(false);
        } catch (err: any) {
          expect(err.statusCode).toBe(409);
          expect(err.details.duplicateFields).toContain('email');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should reject registration with duplicate username and indicate the username field', () => {
    fc.assert(
      fc.asyncProperty(validEmailArb, validUsernameArb, validPasswordArb, async (email, username, password) => {
        const mockUserRepository = {
          emailExists: jest.fn().mockResolvedValue(false),
          usernameExists: jest.fn().mockResolvedValue(true),
          createUser: jest.fn(),
          findByEmail: jest.fn(),
          findByUsername: jest.fn(),
          findByEmailOrUsername: jest.fn(),
          updateLockedUntil: jest.fn(),
        };

        const authService = new AuthService({
          userRepository: mockUserRepository as any,
        });

        try {
          await authService.register({ email, username, password });
          expect(true).toBe(false);
        } catch (err: any) {
          expect(err.statusCode).toBe(409);
          expect(err.details.duplicateFields).toContain('username');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should reject registration with both duplicate email and username and indicate both fields', () => {
    fc.assert(
      fc.asyncProperty(validEmailArb, validUsernameArb, validPasswordArb, async (email, username, password) => {
        const mockUserRepository = {
          emailExists: jest.fn().mockResolvedValue(true),
          usernameExists: jest.fn().mockResolvedValue(true),
          createUser: jest.fn(),
          findByEmail: jest.fn(),
          findByUsername: jest.fn(),
          findByEmailOrUsername: jest.fn(),
          updateLockedUntil: jest.fn(),
        };

        const authService = new AuthService({
          userRepository: mockUserRepository as any,
        });

        try {
          await authService.register({ email, username, password });
          expect(true).toBe(false);
        } catch (err: any) {
          expect(err.statusCode).toBe(409);
          expect(err.details.duplicateFields).toContain('email');
          expect(err.details.duplicateFields).toContain('username');
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 3: Password hashing integrity
// ============================================================================

/**
 * **Validates: Requirements 1.7**
 *
 * Property 3: Password hashing integrity
 * For any password submitted during registration, the stored hash SHALL be a
 * valid bcrypt hash with a work factor of at least 10, and verifying the
 * original password against the hash SHALL return true.
 */
describe('Property 3: Password hashing integrity', () => {
  it('should produce a valid bcrypt hash with work factor >= 10 for any valid password', () => {
    return fc.assert(
      fc.asyncProperty(validPasswordArb, async (password) => {
        const saltRounds = Math.max(10, config.bcrypt.saltRounds);
        const hash = await bcrypt.hash(password, saltRounds);

        // Verify it's a valid bcrypt hash (starts with $2b$ or $2a$)
        expect(hash).toMatch(/^\$2[aby]\$/);

        // Extract the work factor from the hash
        const parts = hash.split('$');
        const workFactor = parseInt(parts[2]!, 10);
        expect(workFactor).toBeGreaterThanOrEqual(10);
      }),
      { numRuns: 100 }
    );
  }, 60000);

  it('should verify the original password against the hash returns true', () => {
    return fc.assert(
      fc.asyncProperty(validPasswordArb, async (password) => {
        const saltRounds = Math.max(10, config.bcrypt.saltRounds);
        const hash = await bcrypt.hash(password, saltRounds);

        const isValid = await bcrypt.compare(password, hash);
        expect(isValid).toBe(true);
      }),
      { numRuns: 100 }
    );
  }, 60000);

  it('should reject a different password against the hash', () => {
    return fc.assert(
      fc.asyncProperty(
        validPasswordArb,
        validPasswordArb,
        async (password1, password2) => {
          // Only test when passwords are actually different
          fc.pre(password1 !== password2);

          const saltRounds = Math.max(10, config.bcrypt.saltRounds);
          const hash = await bcrypt.hash(password1, saltRounds);

          const isValid = await bcrypt.compare(password2, hash);
          expect(isValid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  it('should produce a hash via AuthService.register that verifies correctly', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const redisUtils = require('../../src/utils/redis-utils');
    jest.spyOn(redisUtils, 'storeSession').mockResolvedValue(undefined);

    return fc.assert(
      fc.asyncProperty(validEmailArb, validUsernameArb, validPasswordArb, async (email, username, password) => {
        let capturedHash = '';

        const mockUserRepository = {
          emailExists: jest.fn().mockResolvedValue(false),
          usernameExists: jest.fn().mockResolvedValue(false),
          createUser: jest.fn().mockImplementation(async (data: any) => {
            capturedHash = data.password_hash;
            return {
              id: 1,
              email: data.email,
              username: data.username,
              password_hash: data.password_hash,
              role: 'user',
            };
          }),
          findById: jest.fn().mockImplementation(async () => ({
            id: 1,
            email,
            username,
            password_hash: capturedHash,
            role: 'user',
          })),
          findByEmail: jest.fn(),
          findByUsername: jest.fn(),
          findByEmailOrUsername: jest.fn(),
          updateLockedUntil: jest.fn(),
        };

        const authService = new AuthService({
          userRepository: mockUserRepository as any,
        });

        await authService.register({ email, username, password });

        // Verify the captured hash
        expect(capturedHash).toMatch(/^\$2[aby]\$/);
        const workFactor = parseInt(capturedHash.split('$')[2]!, 10);
        expect(workFactor).toBeGreaterThanOrEqual(10);

        // Verify original password matches the hash
        const isValid = await bcrypt.compare(password, capturedHash);
        expect(isValid).toBe(true);
      }),
      { numRuns: 100 }
    );
  }, 60000);
});

// ============================================================================
// Property 4: Refresh token rotation invalidates previous token
// ============================================================================

/**
 * **Validates: Requirements 1.8**
 *
 * Property 4: Refresh token rotation invalidates previous token
 * For any valid refresh token, using it to obtain new tokens SHALL invalidate
 * the original refresh token such that subsequent use of the original token
 * is rejected.
 */
describe('Property 4: Refresh token rotation invalidates previous token', () => {
  it('should invalidate the original refresh token after rotation', () => {
    return fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),
        fc.stringMatching(/^[a-zA-Z0-9]{3,20}$/),
        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,15}$/),
        async (userId, username, emailLocal) => {
          const email = `${emailLocal}@test.com`;

          // Simulate Redis session store in memory
          const sessionStore = new Map<string, string>();

          // Mock redis-utils
          const redisUtils = require('../../src/utils/redis-utils');
          jest.spyOn(redisUtils, 'storeSession').mockImplementation(
            (async (...args: unknown[]) => {
              const uid = args[0] as string;
              const tid = args[1] as string;
              const data = args[2] as string;
              sessionStore.set(`session:${uid}:${tid}`, data);
            }) as any
          );
          jest.spyOn(redisUtils, 'getSession').mockImplementation(
            (async (...args: unknown[]) => {
              const uid = args[0] as string;
              const tid = args[1] as string;
              return sessionStore.get(`session:${uid}:${tid}`) || null;
            }) as any
          );
          jest.spyOn(redisUtils, 'deleteSession').mockImplementation(
            (async (...args: unknown[]) => {
              const uid = args[0] as string;
              const tid = args[1] as string;
              sessionStore.delete(`session:${uid}:${tid}`);
            }) as any
          );

          const mockUserRepository = {
            emailExists: jest.fn().mockResolvedValue(false),
            usernameExists: jest.fn().mockResolvedValue(false),
            createUser: jest.fn().mockResolvedValue({
              id: userId,
              email,
              username,
              password_hash: '$2b$10$dummy',
              role: 'user',
            }),
            findById: jest.fn().mockResolvedValue({
              id: userId,
              email,
              username,
              role: 'user',
            }),
            findByEmail: jest.fn(),
            findByUsername: jest.fn(),
            findByEmailOrUsername: jest.fn(),
            updateLockedUntil: jest.fn(),
          };

          const authService = new AuthService({
            userRepository: mockUserRepository as any,
          });

          // Generate a refresh token by creating a session directly
          const tokenId = `token-${Date.now()}-${Math.random()}`;
          const refreshToken = jwt.sign(
            { userId, tokenId, type: 'refresh' },
            config.jwt.refreshSecret,
            { expiresIn: '7d' }
          );

          // Store the session
          sessionStore.set(
            `session:${userId}:${tokenId}`,
            JSON.stringify({ userId, email, username, role: 'user' })
          );

          // First refresh should succeed
          const newTokens = await authService.refreshToken(refreshToken);
          expect(newTokens.accessToken).toBeDefined();
          expect(newTokens.refreshToken).toBeDefined();

          // The original token's session should be deleted
          const oldSession = sessionStore.get(`session:${userId}:${tokenId}`);
          expect(oldSession).toBeUndefined();

          // Second use of the same refresh token should fail
          try {
            await authService.refreshToken(refreshToken);
            expect(true).toBe(false); // Should not reach here
          } catch (err: any) {
            expect(err.statusCode).toBe(401);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});

// ============================================================================
// Property 5: Malformed or expired JWT rejection
// ============================================================================

/**
 * **Validates: Requirements 1.11**
 *
 * Property 5: Malformed or expired JWT rejection
 * For any JWT that is expired, has an invalid signature, or is structurally
 * malformed, the API_Gateway SHALL reject the request with a 401 status code.
 */
describe('Property 5: Malformed or expired JWT rejection', () => {
  it('should reject expired JWTs with 401', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.stringMatching(/^[a-zA-Z0-9]{3,20}$/),
        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,10}@test\\.com$/),
        (userId, username, email) => {
          // Create an expired token (expired 1 hour ago)
          const expiredToken = jwt.sign(
            { userId, email, username, role: 'user', tokenId: 'test-id' },
            config.jwt.accessSecret,
            { expiresIn: '-1h' }
          );

          const req = createMockRequest({ authorization: `Bearer ${expiredToken}` });
          const res = createMockResponse();
          const next = jest.fn();

          authMiddleware(req, res, next as NextFunction);

          expect(next).not.toHaveBeenCalled();
          expect(res._status).toBe(401);
          const body = res._json as Record<string, unknown>;
          expect(body.status).toBe(401);
          expect(body.error).toBe('Unauthorized');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject JWTs with invalid signature with 401', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.stringMatching(/^[a-zA-Z0-9]{3,20}$/),
        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{5,20}$/),
        (userId, username, wrongSecret) => {
          // Sign with a different secret
          const invalidToken = jwt.sign(
            { userId, email: `${username}@test.com`, username, role: 'user', tokenId: 'test-id' },
            `wrong-secret-${wrongSecret}`,
            { expiresIn: '15m' }
          );

          const req = createMockRequest({ authorization: `Bearer ${invalidToken}` });
          const res = createMockResponse();
          const next = jest.fn();

          authMiddleware(req, res, next as NextFunction);

          expect(next).not.toHaveBeenCalled();
          expect(res._status).toBe(401);
          const body = res._json as Record<string, unknown>;
          expect(body.status).toBe(401);
          expect(body.error).toBe('Unauthorized');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject structurally malformed tokens with 401', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Random strings that aren't valid JWTs
          fc.stringMatching(/^[a-zA-Z0-9]{10,50}$/),
          // Strings with wrong number of dots
          fc.stringMatching(/^[a-zA-Z0-9]{5,15}\.[a-zA-Z0-9]{5,15}$/),
          // Completely random garbage
          fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.split('.').length !== 3),
          // Empty-ish tokens
          fc.constantFrom('', ' ', 'null', 'undefined', '..', 'a.b.c')
        ),
        (malformedToken) => {
          const req = createMockRequest({ authorization: `Bearer ${malformedToken}` });
          const res = createMockResponse();
          const next = jest.fn();

          authMiddleware(req, res, next as NextFunction);

          expect(next).not.toHaveBeenCalled();
          expect(res._status).toBe(401);
          const body = res._json as Record<string, unknown>;
          expect(body.status).toBe(401);
          expect(body.error).toBe('Unauthorized');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject requests with missing Authorization header with 401', () => {
    fc.assert(
      fc.property(
        fc.record({
          'content-type': fc.constant('application/json'),
          'x-request-id': fc.stringMatching(/^[a-f0-9]{8,32}$/),
        }),
        (headers) => {
          // No authorization header
          const req = createMockRequest(headers);
          const res = createMockResponse();
          const next = jest.fn();

          authMiddleware(req, res, next as NextFunction);

          expect(next).not.toHaveBeenCalled();
          expect(res._status).toBe(401);
          const body = res._json as Record<string, unknown>;
          expect(body.status).toBe(401);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject requests with non-Bearer authorization schemes with 401', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('Basic', 'Digest', 'Token', 'ApiKey', 'OAuth'),
        fc.stringMatching(/^[a-zA-Z0-9+/=]{10,50}$/),
        (scheme, credentials) => {
          const req = createMockRequest({ authorization: `${scheme} ${credentials}` });
          const res = createMockResponse();
          const next = jest.fn();

          authMiddleware(req, res, next as NextFunction);

          expect(next).not.toHaveBeenCalled();
          expect(res._status).toBe(401);
          const body = res._json as Record<string, unknown>;
          expect(body.status).toBe(401);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept valid non-expired JWTs signed with the correct secret', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.stringMatching(/^[a-zA-Z0-9]{3,20}$/),
        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,10}$/),
        (userId, username, emailLocal) => {
          const email = `${emailLocal}@test.com`;
          const validToken = jwt.sign(
            { userId, email, username, role: 'user', tokenId: 'test-id' },
            config.jwt.accessSecret,
            { expiresIn: '15m' }
          );

          const req = createMockRequest({ authorization: `Bearer ${validToken}` });
          const res = createMockResponse();
          const next = jest.fn();

          authMiddleware(req, res, next as NextFunction);

          expect(next).toHaveBeenCalled();
          expect(res._status).toBe(200); // unchanged
          expect(req.user).toBeDefined();
          expect(req.user!.userId).toBe(userId);
          expect(req.user!.email).toBe(email);
        }
      ),
      { numRuns: 100 }
    );
  });
});
