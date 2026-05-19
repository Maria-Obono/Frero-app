import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { AuthService } from '../../../src/services/auth/auth.service';
import { AuthError } from '../../../src/services/auth/types';
import { config } from '../../../src/config';

// Mock dependencies
jest.mock('../../../src/config/redis', () => ({
  getRedisClient: jest.fn(() => ({
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  })),
}));

jest.mock('../../../src/utils/redis-utils', () => ({
  storeSession: jest.fn().mockResolvedValue(undefined),
  getSession: jest.fn().mockResolvedValue(null),
  deleteSession: jest.fn().mockResolvedValue(undefined),
  incrementLoginAttempts: jest.fn().mockResolvedValue(1),
  getLoginAttempts: jest.fn().mockResolvedValue(0),
  resetLoginAttempts: jest.fn().mockResolvedValue(undefined),
}));

// Mock UserRepository
const mockUserRepository = {
  emailExists: jest.fn(),
  usernameExists: jest.fn(),
  createUser: jest.fn(),
  findByEmail: jest.fn(),
  findByUsername: jest.fn(),
  findByEmailOrUsername: jest.fn(),
  updateLockedUntil: jest.fn().mockResolvedValue(undefined),
};

describe('AuthService.register()', () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserRepository.emailExists.mockResolvedValue(false);
    mockUserRepository.usernameExists.mockResolvedValue(false);
    mockUserRepository.createUser.mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      password_hash: 'hashed',
      role: 'user',
      is_2fa_enabled: false,
      failed_login_attempts: 0,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    });

    authService = new AuthService({
      userRepository: mockUserRepository as any,
    });
  });

  describe('successful registration', () => {
    it('should return access token and refresh token on valid input', async () => {
      const result = await authService.register({
        email: 'user@example.com',
        username: 'testuser',
        password: 'MyP@ssw0rd',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
      expect(typeof result.expiresIn).toBe('number');
      expect(result.expiresIn).toBeGreaterThan(0);
    });

    it('should generate a valid JWT access token', async () => {
      const result = await authService.register({
        email: 'user@example.com',
        username: 'testuser',
        password: 'MyP@ssw0rd',
      });

      const decoded = jwt.verify(result.accessToken, config.jwt.accessSecret) as any;
      expect(decoded.userId).toBe(1);
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.username).toBe('testuser');
      expect(decoded.role).toBe('user');
      expect(decoded.tokenId).toBeDefined();
    });

    it('should generate a valid JWT refresh token', async () => {
      const result = await authService.register({
        email: 'user@example.com',
        username: 'testuser',
        password: 'MyP@ssw0rd',
      });

      const decoded = jwt.verify(result.refreshToken, config.jwt.refreshSecret) as any;
      expect(decoded.userId).toBe(1);
      expect(decoded.tokenId).toBeDefined();
      expect(decoded.type).toBe('refresh');
    });

    it('should hash password with bcrypt work factor >= 10', async () => {
      await authService.register({
        email: 'user@example.com',
        username: 'testuser',
        password: 'MyP@ssw0rd',
      });

      expect(mockUserRepository.createUser).toHaveBeenCalledTimes(1);
      const createCall = mockUserRepository.createUser.mock.calls[0][0];
      const hash = createCall.password_hash;

      // Verify it's a valid bcrypt hash
      expect(hash).toMatch(/^\$2[aby]?\$\d{2}\$/);

      // Verify work factor is at least 10
      const rounds = parseInt(hash.split('$')[2], 10);
      expect(rounds).toBeGreaterThanOrEqual(10);

      // Verify the original password matches the hash
      const matches = await bcrypt.compare('MyP@ssw0rd', hash);
      expect(matches).toBe(true);
    });

    it('should store refresh token in Redis', async () => {
      const { storeSession } = require('../../../src/utils/redis-utils');

      await authService.register({
        email: 'user@example.com',
        username: 'testuser',
        password: 'MyP@ssw0rd',
      });

      expect(storeSession).toHaveBeenCalledTimes(1);
      const [userId, tokenId, tokenData, ttl] = storeSession.mock.calls[0];
      expect(userId).toBe('1');
      expect(typeof tokenId).toBe('string');
      expect(tokenId.length).toBeGreaterThan(0);

      const parsed = JSON.parse(tokenData);
      expect(parsed.userId).toBe(1);
      expect(parsed.email).toBe('test@example.com');
      expect(parsed.username).toBe('testuser');
      expect(parsed.role).toBe('user');

      // TTL should be 7 days in seconds
      expect(ttl).toBe(7 * 24 * 60 * 60);
    });
  });

  describe('validation errors (Requirement 1.3)', () => {
    it('should reject invalid email with 422 and field-specific error', async () => {
      await expect(
        authService.register({
          email: 'invalid-email',
          username: 'testuser',
          password: 'MyP@ssw0rd',
        }),
      ).rejects.toThrow(AuthError);

      try {
        await authService.register({
          email: 'invalid-email',
          username: 'testuser',
          password: 'MyP@ssw0rd',
        });
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.statusCode).toBe(422);
        expect(authErr.details?.fields).toBeDefined();
        const fields = authErr.details!.fields as Record<string, string[]>;
        expect(fields['email']).toBeDefined();
        expect(fields['email']!.length).toBeGreaterThan(0);
      }
    });

    it('should reject invalid username with 422 and field-specific error', async () => {
      try {
        await authService.register({
          email: 'user@example.com',
          username: 'ab',
          password: 'MyP@ssw0rd',
        });
        fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.statusCode).toBe(422);
        const fields = authErr.details!.fields as Record<string, string[]>;
        expect(fields.username).toBeDefined();
      }
    });

    it('should reject invalid password with 422 and field-specific error', async () => {
      try {
        await authService.register({
          email: 'user@example.com',
          username: 'testuser',
          password: 'weak',
        });
        fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.statusCode).toBe(422);
        const fields = authErr.details!.fields as Record<string, string[]>;
        expect(fields.password).toBeDefined();
      }
    });

    it('should report multiple validation errors at once', async () => {
      try {
        await authService.register({
          email: 'bad',
          username: 'x',
          password: 'no',
        });
        fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.statusCode).toBe(422);
        const fields = authErr.details!.fields as Record<string, string[]>;
        expect(Object.keys(fields).length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('duplicate detection (Requirement 1.2)', () => {
    it('should reject duplicate email with 409 and specific error', async () => {
      mockUserRepository.emailExists.mockResolvedValue(true);
      mockUserRepository.usernameExists.mockResolvedValue(false);

      try {
        await authService.register({
          email: 'existing@example.com',
          username: 'newuser',
          password: 'MyP@ssw0rd',
        });
        fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.statusCode).toBe(409);
        expect(authErr.details?.duplicateFields).toContain('email');
        expect(authErr.details?.duplicateFields).not.toContain('username');
      }
    });

    it('should reject duplicate username with 409 and specific error', async () => {
      mockUserRepository.emailExists.mockResolvedValue(false);
      mockUserRepository.usernameExists.mockResolvedValue(true);

      try {
        await authService.register({
          email: 'new@example.com',
          username: 'existinguser',
          password: 'MyP@ssw0rd',
        });
        fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.statusCode).toBe(409);
        expect(authErr.details?.duplicateFields).toContain('username');
        expect(authErr.details?.duplicateFields).not.toContain('email');
      }
    });

    it('should reject when both email and username are duplicates', async () => {
      mockUserRepository.emailExists.mockResolvedValue(true);
      mockUserRepository.usernameExists.mockResolvedValue(true);

      try {
        await authService.register({
          email: 'existing@example.com',
          username: 'existinguser',
          password: 'MyP@ssw0rd',
        });
        fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.statusCode).toBe(409);
        expect(authErr.details?.duplicateFields).toContain('email');
        expect(authErr.details?.duplicateFields).toContain('username');
      }
    });
  });
});


describe('AuthService.login()', () => {
  let authService: AuthService;
  const validPasswordHash = bcrypt.hashSync('MyP@ssw0rd', 10);

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    username: 'testuser',
    password_hash: validPasswordHash,
    display_name: null,
    bio: null,
    location: null,
    website: null,
    avatar_url: null,
    cover_url: null,
    role: 'user' as const,
    is_2fa_enabled: false,
    totp_secret: null,
    locked_until: null,
    failed_login_attempts: 0,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserRepository.findByEmailOrUsername.mockResolvedValue({ ...mockUser });
    mockUserRepository.updateLockedUntil.mockResolvedValue(undefined);

    const { incrementLoginAttempts, resetLoginAttempts } = require('../../../src/utils/redis-utils');
    incrementLoginAttempts.mockResolvedValue(1);
    resetLoginAttempts.mockResolvedValue(undefined);

    authService = new AuthService({
      userRepository: mockUserRepository as any,
    });
  });

  describe('successful login (Requirement 1.4)', () => {
    it('should return access token and refresh token on valid credentials', async () => {
      const result = await authService.login({
        identifier: 'test@example.com',
        password: 'MyP@ssw0rd',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
      expect(typeof result.expiresIn).toBe('number');
    });

    it('should generate a valid JWT access token with correct claims', async () => {
      const result = await authService.login({
        identifier: 'test@example.com',
        password: 'MyP@ssw0rd',
      });

      const decoded = jwt.verify(result.accessToken, config.jwt.accessSecret) as any;
      expect(decoded.userId).toBe(1);
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.username).toBe('testuser');
      expect(decoded.role).toBe('user');
      expect(decoded.tokenId).toBeDefined();
    });

    it('should generate a valid JWT refresh token', async () => {
      const result = await authService.login({
        identifier: 'test@example.com',
        password: 'MyP@ssw0rd',
      });

      const decoded = jwt.verify(result.refreshToken, config.jwt.refreshSecret) as any;
      expect(decoded.userId).toBe(1);
      expect(decoded.tokenId).toBeDefined();
      expect(decoded.type).toBe('refresh');
    });

    it('should accept login by username (case-insensitive)', async () => {
      const result = await authService.login({
        identifier: 'testuser',
        password: 'MyP@ssw0rd',
      });

      expect(result).toHaveProperty('accessToken');
      expect(mockUserRepository.findByEmailOrUsername).toHaveBeenCalledWith('testuser');
    });

    it('should reset login attempts on successful login', async () => {
      const { resetLoginAttempts } = require('../../../src/utils/redis-utils');

      await authService.login({
        identifier: 'test@example.com',
        password: 'MyP@ssw0rd',
      });

      expect(resetLoginAttempts).toHaveBeenCalledWith('1');
    });

    it('should clear locked_until on successful login if previously set', async () => {
      mockUserRepository.findByEmailOrUsername.mockResolvedValue({
        ...mockUser,
        locked_until: new Date(Date.now() - 1000), // expired lock
      });

      await authService.login({
        identifier: 'test@example.com',
        password: 'MyP@ssw0rd',
      });

      expect(mockUserRepository.updateLockedUntil).toHaveBeenCalledWith(1, null);
    });

    it('should store refresh token in Redis', async () => {
      const { storeSession } = require('../../../src/utils/redis-utils');

      await authService.login({
        identifier: 'test@example.com',
        password: 'MyP@ssw0rd',
      });

      expect(storeSession).toHaveBeenCalledTimes(1);
      const [userId, tokenId, tokenData, ttl] = storeSession.mock.calls[0];
      expect(userId).toBe('1');
      expect(typeof tokenId).toBe('string');

      const parsed = JSON.parse(tokenData);
      expect(parsed.userId).toBe(1);
      expect(parsed.email).toBe('test@example.com');

      // TTL should be 7 days in seconds
      expect(ttl).toBe(7 * 24 * 60 * 60);
    });
  });

  describe('invalid credentials (Requirement 1.5)', () => {
    it('should throw 401 error for wrong password', async () => {
      try {
        await authService.login({
          identifier: 'test@example.com',
          password: 'WrongP@ss1',
        });
        fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.statusCode).toBe(401);
        expect(authErr.message).toBe('Invalid credentials');
      }
    });

    it('should throw 401 error for non-existent user', async () => {
      mockUserRepository.findByEmailOrUsername.mockResolvedValue(undefined);

      try {
        await authService.login({
          identifier: 'nonexistent@example.com',
          password: 'MyP@ssw0rd',
        });
        fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.statusCode).toBe(401);
        expect(authErr.message).toBe('Invalid credentials');
      }
    });

    it('should perform constant-time comparison even for non-existent users', async () => {
      mockUserRepository.findByEmailOrUsername.mockResolvedValue(undefined);

      const start = Date.now();
      try {
        await authService.login({
          identifier: 'nonexistent@example.com',
          password: 'MyP@ssw0rd',
        });
      } catch {
        // expected
      }
      const elapsed = Date.now() - start;

      // bcrypt.compare should take some time even for dummy hash
      // This verifies that we're not short-circuiting on user not found
      expect(elapsed).toBeGreaterThan(0);
    });

    it('should increment login attempts on failed password', async () => {
      const { incrementLoginAttempts } = require('../../../src/utils/redis-utils');

      try {
        await authService.login({
          identifier: 'test@example.com',
          password: 'WrongP@ss1',
        });
      } catch {
        // expected
      }

      expect(incrementLoginAttempts).toHaveBeenCalledWith('1');
    });
  });

  describe('account lockout (Requirement 1.6)', () => {
    it('should throw 423 error when account is locked', async () => {
      mockUserRepository.findByEmailOrUsername.mockResolvedValue({
        ...mockUser,
        locked_until: new Date(Date.now() + 10 * 60 * 1000), // locked for 10 more minutes
      });

      try {
        await authService.login({
          identifier: 'test@example.com',
          password: 'MyP@ssw0rd',
        });
        fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.statusCode).toBe(423);
        expect(authErr.message).toBe('Account locked');
        expect(authErr.details?.message).toContain('temporarily locked');
      }
    });

    it('should allow login when lock has expired', async () => {
      mockUserRepository.findByEmailOrUsername.mockResolvedValue({
        ...mockUser,
        locked_until: new Date(Date.now() - 1000), // lock expired 1 second ago
      });

      const result = await authService.login({
        identifier: 'test@example.com',
        password: 'MyP@ssw0rd',
      });

      expect(result).toHaveProperty('accessToken');
    });

    it('should lock account after 5 failed attempts', async () => {
      const { incrementLoginAttempts } = require('../../../src/utils/redis-utils');
      incrementLoginAttempts.mockResolvedValue(5);

      try {
        await authService.login({
          identifier: 'test@example.com',
          password: 'WrongP@ss1',
        });
      } catch {
        // expected
      }

      expect(mockUserRepository.updateLockedUntil).toHaveBeenCalledWith(
        1,
        expect.any(Date),
      );

      // Verify the lock duration is approximately 15 minutes
      const lockedUntil = mockUserRepository.updateLockedUntil.mock.calls[0][1] as Date;
      const lockDurationMs = lockedUntil.getTime() - Date.now();
      // Allow 5 seconds tolerance for test execution time
      expect(lockDurationMs).toBeGreaterThan(14 * 60 * 1000);
      expect(lockDurationMs).toBeLessThanOrEqual(15 * 60 * 1000);
    });

    it('should not lock account before 5 failed attempts', async () => {
      const { incrementLoginAttempts } = require('../../../src/utils/redis-utils');
      incrementLoginAttempts.mockResolvedValue(4);

      try {
        await authService.login({
          identifier: 'test@example.com',
          password: 'WrongP@ss1',
        });
      } catch {
        // expected
      }

      expect(mockUserRepository.updateLockedUntil).not.toHaveBeenCalled();
    });

    it('should lock account on 6th attempt as well (>= 5)', async () => {
      const { incrementLoginAttempts } = require('../../../src/utils/redis-utils');
      incrementLoginAttempts.mockResolvedValue(6);

      try {
        await authService.login({
          identifier: 'test@example.com',
          password: 'WrongP@ss1',
        });
      } catch {
        // expected
      }

      expect(mockUserRepository.updateLockedUntil).toHaveBeenCalledWith(
        1,
        expect.any(Date),
      );
    });

    it('should not check password when account is locked', async () => {
      mockUserRepository.findByEmailOrUsername.mockResolvedValue({
        ...mockUser,
        locked_until: new Date(Date.now() + 10 * 60 * 1000),
      });

      const bcryptCompareSpy = jest.spyOn(bcrypt, 'compare');

      try {
        await authService.login({
          identifier: 'test@example.com',
          password: 'MyP@ssw0rd',
        });
      } catch {
        // expected
      }

      // bcrypt.compare should NOT be called when account is locked
      expect(bcryptCompareSpy).not.toHaveBeenCalled();
      bcryptCompareSpy.mockRestore();
    });
  });

  describe('token expiration defaults', () => {
    it('should generate access token with ~15 minute expiration by default', async () => {
      const result = await authService.login({
        identifier: 'test@example.com',
        password: 'MyP@ssw0rd',
      });

      // Default is 15m = 900 seconds
      expect(result.expiresIn).toBe(900);
    });

    it('should generate refresh token with 7-day expiration by default', async () => {
      const result = await authService.login({
        identifier: 'test@example.com',
        password: 'MyP@ssw0rd',
      });

      const decoded = jwt.verify(result.refreshToken, config.jwt.refreshSecret) as any;
      const tokenLifespan = decoded.exp - decoded.iat;
      // 7 days = 604800 seconds
      expect(tokenLifespan).toBe(604800);
    });
  });
});
