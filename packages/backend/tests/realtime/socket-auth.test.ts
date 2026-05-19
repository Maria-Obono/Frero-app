/**
 * Unit tests for Socket.IO JWT authentication middleware.
 *
 * Tests token extraction, verification, and the middleware flow
 * for WebSocket connections.
 */

import jwt from 'jsonwebtoken';

import { extractToken, verifySocketToken, socketAuthMiddleware } from '../../src/realtime/socket-auth';
import { config } from '../../src/config';

// Mock the logger to avoid console output during tests
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Socket Authentication', () => {
  function createValidToken(payload?: Record<string, unknown>): string {
    return jwt.sign(
      {
        userId: 42,
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        tokenId: 'token-123',
        ...payload,
      },
      config.jwt.accessSecret,
      { expiresIn: '15m' },
    );
  }

  function createMockSocket(auth?: Record<string, unknown>, query?: Record<string, unknown>) {
    return {
      id: 'socket-id-123',
      handshake: {
        auth: auth || {},
        query: query || {},
      },
      data: {},
      rooms: new Set<string>(),
      join: jest.fn(),
      leave: jest.fn(),
    } as any;
  }

  describe('extractToken', () => {
    it('should extract token from auth object', () => {
      const socket = createMockSocket({ token: 'my-jwt-token' });
      expect(extractToken(socket)).toBe('my-jwt-token');
    });

    it('should extract token from query parameter as fallback', () => {
      const socket = createMockSocket({}, { token: 'query-jwt-token' });
      expect(extractToken(socket)).toBe('query-jwt-token');
    });

    it('should prefer auth token over query token', () => {
      const socket = createMockSocket(
        { token: 'auth-token' },
        { token: 'query-token' },
      );
      expect(extractToken(socket)).toBe('auth-token');
    });

    it('should return null when no token is provided', () => {
      const socket = createMockSocket();
      expect(extractToken(socket)).toBeNull();
    });

    it('should return null for non-string auth token', () => {
      const socket = createMockSocket({ token: 12345 });
      expect(extractToken(socket)).toBeNull();
    });

    it('should return null for empty string token', () => {
      const socket = createMockSocket({ token: '' });
      expect(extractToken(socket)).toBeNull();
    });

    it('should return null for undefined auth object', () => {
      const socket = {
        id: 'socket-id',
        handshake: { auth: undefined, query: {} },
        data: {},
      } as any;
      expect(extractToken(socket)).toBeNull();
    });
  });

  describe('verifySocketToken', () => {
    it('should return user data for a valid token', () => {
      const token = createValidToken();
      const user = verifySocketToken(token);

      expect(user).not.toBeNull();
      expect(user!.userId).toBe(42);
      expect(user!.email).toBe('test@example.com');
      expect(user!.username).toBe('testuser');
      expect(user!.role).toBe('user');
      expect(user!.tokenId).toBe('token-123');
    });

    it('should return null for an expired token', () => {
      const token = jwt.sign(
        {
          userId: 1,
          email: 'test@example.com',
          username: 'testuser',
          role: 'user',
          tokenId: 'id',
        },
        config.jwt.accessSecret,
        { expiresIn: '-1s' },
      );

      expect(verifySocketToken(token)).toBeNull();
    });

    it('should return null for a token signed with wrong secret', () => {
      const token = jwt.sign(
        {
          userId: 1,
          email: 'test@example.com',
          username: 'testuser',
          role: 'user',
          tokenId: 'id',
        },
        'wrong-secret',
        { expiresIn: '15m' },
      );

      expect(verifySocketToken(token)).toBeNull();
    });

    it('should return null for a malformed token', () => {
      expect(verifySocketToken('not-a-jwt')).toBeNull();
    });

    it('should return null for an empty string', () => {
      expect(verifySocketToken('')).toBeNull();
    });

    it('should return null when userId is missing from payload', () => {
      const token = jwt.sign(
        { email: 'test@example.com', username: 'testuser', role: 'user' },
        config.jwt.accessSecret,
        { expiresIn: '15m' },
      );

      expect(verifySocketToken(token)).toBeNull();
    });

    it('should return null when email is missing from payload', () => {
      const token = jwt.sign(
        { userId: 1, username: 'testuser', role: 'user' },
        config.jwt.accessSecret,
        { expiresIn: '15m' },
      );

      expect(verifySocketToken(token)).toBeNull();
    });

    it('should return null when username is missing from payload', () => {
      const token = jwt.sign(
        { userId: 1, email: 'test@example.com', role: 'user' },
        config.jwt.accessSecret,
        { expiresIn: '15m' },
      );

      expect(verifySocketToken(token)).toBeNull();
    });

    it('should default role to "user" when not provided', () => {
      const token = jwt.sign(
        { userId: 1, email: 'test@example.com', username: 'testuser', tokenId: 'id' },
        config.jwt.accessSecret,
        { expiresIn: '15m' },
      );

      const user = verifySocketToken(token);
      expect(user).not.toBeNull();
      expect(user!.role).toBe('user');
    });

    it('should handle admin role correctly', () => {
      const token = createValidToken({ role: 'admin' });
      const user = verifySocketToken(token);

      expect(user).not.toBeNull();
      expect(user!.role).toBe('admin');
    });
  });

  describe('socketAuthMiddleware', () => {
    it('should call next() without error for valid token', () => {
      const token = createValidToken();
      const socket = createMockSocket({ token });
      const next = jest.fn();

      socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith();
      expect(next).toHaveBeenCalledTimes(1);
      expect(socket.data.user).toBeDefined();
      expect(socket.data.user.userId).toBe(42);
    });

    it('should attach user data to socket.user', () => {
      const token = createValidToken();
      const socket = createMockSocket({ token });
      const next = jest.fn();

      socketAuthMiddleware(socket, next);

      expect(socket.user).toBeDefined();
      expect(socket.user.userId).toBe(42);
      expect(socket.user.email).toBe('test@example.com');
      expect(socket.user.username).toBe('testuser');
    });

    it('should call next with error when no token is provided', () => {
      const socket = createMockSocket();
      const next = jest.fn();

      socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toContain('no token provided');
    });

    it('should call next with error for expired token', () => {
      const token = jwt.sign(
        {
          userId: 1,
          email: 'test@example.com',
          username: 'testuser',
          role: 'user',
          tokenId: 'id',
        },
        config.jwt.accessSecret,
        { expiresIn: '-1s' },
      );
      const socket = createMockSocket({ token });
      const next = jest.fn();

      socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toContain('invalid or expired token');
    });

    it('should call next with error for invalid token', () => {
      const socket = createMockSocket({ token: 'invalid-jwt' });
      const next = jest.fn();

      socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toContain('invalid or expired token');
    });

    it('should call next with error for token signed with wrong secret', () => {
      const token = jwt.sign(
        { userId: 1, email: 'a@b.com', username: 'user', role: 'user', tokenId: 'id' },
        'wrong-secret',
        { expiresIn: '15m' },
      );
      const socket = createMockSocket({ token });
      const next = jest.fn();

      socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should work with token from query parameter', () => {
      const token = createValidToken();
      const socket = createMockSocket({}, { token });
      const next = jest.fn();

      socketAuthMiddleware(socket, next);

      expect(next).toHaveBeenCalledWith();
      expect(socket.data.user.userId).toBe(42);
    });
  });
});
