import jwt from 'jsonwebtoken';

import { AuthService } from '../../../src/services/auth/auth.service';
import { AuthError } from '../../../src/services/auth/types';
import { config } from '../../../src/config';

// Mock Redis utilities
const mockStoreSession = jest.fn().mockResolvedValue(undefined);
const mockGetSession = jest.fn().mockResolvedValue(null);
const mockDeleteSession = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/config/redis', () => ({
  getRedisClient: jest.fn(() => ({
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
  })),
}));

jest.mock('../../../src/utils/redis-utils', () => ({
  storeSession: (...args: any[]) => mockStoreSession(...args),
  getSession: (...args: any[]) => mockGetSession(...args),
  deleteSession: (...args: any[]) => mockDeleteSession(...args),
  incrementLoginAttempts: jest.fn().mockResolvedValue(1),
  getLoginAttempts: jest.fn().mockResolvedValue(0),
  resetLoginAttempts: jest.fn().mockResolvedValue(undefined),
}));

// Mock UserRepository
const mockUserRepository = {
  emailExists: jest.fn().mockResolvedValue(false),
  usernameExists: jest.fn().mockResolvedValue(false),
  createUser: jest.fn(),
  findByEmail: jest.fn(),
  findByUsername: jest.fn(),
  findByEmailOrUsername: jest.fn(),
  updateLockedUntil: jest.fn(),
};

describe('AuthService.refreshToken()', () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService({
      userRepository: mockUserRepository as any,
    });
  });

  function createValidRefreshToken(
    userId: number = 1,
    tokenId: string = 'test-token-id',
  ): string {
    return jwt.sign(
      { userId, tokenId, type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: '7d' },
    );
  }

  describe('successful token refresh', () => {
    it('should return new access and refresh tokens for a valid refresh token', async () => {
      const tokenId = 'valid-token-id';
      const refreshToken = createValidRefreshToken(1, tokenId);

      mockGetSession.mockResolvedValue(
        JSON.stringify({
          userId: 1,
          email: 'user@example.com',
          username: 'testuser',
          role: 'user',
          createdAt: Date.now(),
        }),
      );

      const result = await authService.refreshToken(refreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.expiresIn).toBeGreaterThan(0);
    });

    it('should invalidate the old refresh token (token rotation)', async () => {
      const tokenId = 'old-token-id';
      const refreshToken = createValidRefreshToken(1, tokenId);

      mockGetSession.mockResolvedValue(
        JSON.stringify({
          userId: 1,
          email: 'user@example.com',
          username: 'testuser',
          role: 'user',
        }),
      );

      await authService.refreshToken(refreshToken);

      // Verify the old session was deleted
      expect(mockDeleteSession).toHaveBeenCalledWith('1', tokenId);
    });

    it('should store a new session in Redis for the new refresh token', async () => {
      const tokenId = 'old-token-id';
      const refreshToken = createValidRefreshToken(1, tokenId);

      mockGetSession.mockResolvedValue(
        JSON.stringify({
          userId: 1,
          email: 'user@example.com',
          username: 'testuser',
          role: 'user',
        }),
      );

      await authService.refreshToken(refreshToken);

      // Verify a new session was stored
      expect(mockStoreSession).toHaveBeenCalledTimes(1);
      const [userId, newTokenId, tokenData] = mockStoreSession.mock.calls[0];
      expect(userId).toBe('1');
      expect(newTokenId).not.toBe(tokenId); // New token ID
      const parsed = JSON.parse(tokenData);
      expect(parsed.userId).toBe(1);
      expect(parsed.email).toBe('user@example.com');
    });

    it('should generate a new access token with correct user claims', async () => {
      const refreshToken = createValidRefreshToken(1, 'token-id');

      mockGetSession.mockResolvedValue(
        JSON.stringify({
          userId: 1,
          email: 'user@example.com',
          username: 'testuser',
          role: 'admin',
        }),
      );

      const result = await authService.refreshToken(refreshToken);

      const decoded = jwt.verify(result.accessToken, config.jwt.accessSecret) as any;
      expect(decoded.userId).toBe(1);
      expect(decoded.email).toBe('user@example.com');
      expect(decoded.username).toBe('testuser');
      expect(decoded.role).toBe('admin');
    });
  });

  describe('token validation errors', () => {
    it('should reject an expired refresh token with 401', async () => {
      const expiredToken = jwt.sign(
        { userId: 1, tokenId: 'expired-id', type: 'refresh' },
        config.jwt.refreshSecret,
        { expiresIn: '0s' },
      );

      // Wait a moment for the token to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      try {
        await authService.refreshToken(expiredToken);
        fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.statusCode).toBe(401);
        expect(authErr.message).toContain('expired');
      }
    });

    it('should reject a token with invalid signature with 401', async () => {
      const invalidToken = jwt.sign(
        { userId: 1, tokenId: 'bad-sig', type: 'refresh' },
        'wrong-secret',
        { expiresIn: '7d' },
      );

      try {
        await authService.refreshToken(invalidToken);
        fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.statusCode).toBe(401);
      }
    });

    it('should reject a malformed token with 401', async () => {
      try {
        await authService.refreshToken('not.a.valid.jwt');
        fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.statusCode).toBe(401);
      }
    });

    it('should reject a token that is not of type refresh', async () => {
      const accessToken = jwt.sign(
        { userId: 1, tokenId: 'access-id', type: 'access' },
        config.jwt.refreshSecret,
        { expiresIn: '15m' },
      );

      try {
        await authService.refreshToken(accessToken);
        fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.statusCode).toBe(401);
        expect(authErr.details?.code).toBe('INVALID_TOKEN_TYPE');
      }
    });

    it('should reject a revoked refresh token (not in Redis) with 401', async () => {
      const refreshToken = createValidRefreshToken(1, 'revoked-token-id');

      // Session not found in Redis (already deleted/revoked)
      mockGetSession.mockResolvedValue(null);

      try {
        await authService.refreshToken(refreshToken);
        fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthError;
        expect(authErr.statusCode).toBe(401);
        expect(authErr.details?.code).toBe('TOKEN_REVOKED');
      }
    });
  });
});

describe('AuthService.logout()', () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService({
      userRepository: mockUserRepository as any,
    });
  });

  function createValidRefreshToken(
    userId: number = 1,
    tokenId: string = 'test-token-id',
  ): string {
    return jwt.sign(
      { userId, tokenId, type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: '7d' },
    );
  }

  it('should delete the session from Redis on valid logout', async () => {
    const tokenId = 'session-token-id';
    const refreshToken = createValidRefreshToken(1, tokenId);

    await authService.logout('1', refreshToken);

    expect(mockDeleteSession).toHaveBeenCalledWith('1', tokenId);
  });

  it('should reject logout with an invalid refresh token', async () => {
    try {
      await authService.logout('1', 'invalid.token.here');
      fail('Should have thrown');
    } catch (err) {
      const authErr = err as AuthError;
      expect(authErr.statusCode).toBe(401);
    }
  });

  it('should reject logout when token does not belong to the user', async () => {
    const refreshToken = createValidRefreshToken(2, 'other-user-token');

    try {
      await authService.logout('1', refreshToken);
      fail('Should have thrown');
    } catch (err) {
      const authErr = err as AuthError;
      expect(authErr.statusCode).toBe(401);
      expect(authErr.details?.code).toBe('TOKEN_MISMATCH');
    }
  });

  it('should reject logout with an expired refresh token', async () => {
    const expiredToken = jwt.sign(
      { userId: 1, tokenId: 'expired-id', type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: '0s' },
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    try {
      await authService.logout('1', expiredToken);
      fail('Should have thrown');
    } catch (err) {
      const authErr = err as AuthError;
      expect(authErr.statusCode).toBe(401);
    }
  });
});

describe('AuthService.verifyAccessToken()', () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService({
      userRepository: mockUserRepository as any,
    });
  });

  it('should return decoded token for a valid access token', async () => {
    const token = jwt.sign(
      {
        userId: 1,
        email: 'user@example.com',
        username: 'testuser',
        role: 'user',
        tokenId: 'test-id',
      },
      config.jwt.accessSecret,
      { expiresIn: '15m' },
    );

    const decoded = await authService.verifyAccessToken(token);

    expect(decoded.userId).toBe(1);
    expect(decoded.email).toBe('user@example.com');
    expect(decoded.username).toBe('testuser');
    expect(decoded.role).toBe('user');
    expect(decoded.tokenId).toBe('test-id');
  });

  it('should reject an expired access token with 401', async () => {
    const token = jwt.sign(
      {
        userId: 1,
        email: 'user@example.com',
        username: 'testuser',
        role: 'user',
        tokenId: 'test-id',
      },
      config.jwt.accessSecret,
      { expiresIn: '0s' },
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    try {
      await authService.verifyAccessToken(token);
      fail('Should have thrown');
    } catch (err) {
      const authErr = err as AuthError;
      expect(authErr.statusCode).toBe(401);
      expect(authErr.message).toContain('expired');
    }
  });

  it('should reject a token with wrong signature with 401', async () => {
    const token = jwt.sign(
      { userId: 1, email: 'user@example.com', username: 'testuser', role: 'user', tokenId: 'id' },
      'wrong-secret',
      { expiresIn: '15m' },
    );

    try {
      await authService.verifyAccessToken(token);
      fail('Should have thrown');
    } catch (err) {
      const authErr = err as AuthError;
      expect(authErr.statusCode).toBe(401);
      expect(authErr.message).toContain('malformed or invalid');
    }
  });

  it('should reject a malformed token with 401', async () => {
    try {
      await authService.verifyAccessToken('not-a-jwt');
      fail('Should have thrown');
    } catch (err) {
      const authErr = err as AuthError;
      expect(authErr.statusCode).toBe(401);
    }
  });
});
