import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { authMiddleware, AuthenticatedRequest } from '../../src/middleware/auth';
import { config } from '../../src/config';

describe('authMiddleware', () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockReq = {
      headers: {},
      requestId: 'test-request-id',
    } as any;
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
    mockNext = jest.fn();
  });

  function createValidAccessToken(payload?: Record<string, any>): string {
    return jwt.sign(
      {
        userId: 1,
        email: 'user@example.com',
        username: 'testuser',
        role: 'user',
        tokenId: 'test-token-id',
        ...payload,
      },
      config.jwt.accessSecret,
      { expiresIn: '15m' },
    );
  }

  describe('successful authentication', () => {
    it('should call next() and attach user to request for valid token', () => {
      const token = createValidAccessToken();
      mockReq.headers = { authorization: `Bearer ${token}` };

      authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user!.userId).toBe(1);
      expect(mockReq.user!.email).toBe('user@example.com');
      expect(mockReq.user!.username).toBe('testuser');
      expect(mockReq.user!.role).toBe('user');
    });

    it('should attach all decoded fields to req.user', () => {
      const token = createValidAccessToken({ role: 'admin' });
      mockReq.headers = { authorization: `Bearer ${token}` };

      authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.user!.role).toBe('admin');
      expect(mockReq.user!.tokenId).toBe('test-token-id');
    });
  });

  describe('missing authorization header', () => {
    it('should return 401 when Authorization header is missing', () => {
      mockReq.headers = {};

      authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          error: 'Unauthorized',
          message: 'Authorization header is required',
        }),
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('malformed authorization header', () => {
    it('should return 401 when Authorization header does not use Bearer scheme', () => {
      mockReq.headers = { authorization: 'Basic abc123' };

      authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          message: 'Authorization header must use Bearer scheme',
        }),
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when Authorization header has no token', () => {
      mockReq.headers = { authorization: 'Bearer' };

      authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when Authorization header has extra parts', () => {
      mockReq.headers = { authorization: 'Bearer token extra' };

      authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('expired token', () => {
    it('should return 401 with expiration message for expired token', async () => {
      const expiredToken = jwt.sign(
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

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      mockReq.headers = { authorization: `Bearer ${expiredToken}` };

      authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          message: 'Access token has expired',
        }),
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('invalid token', () => {
    it('should return 401 for token signed with wrong secret', () => {
      const invalidToken = jwt.sign(
        { userId: 1, email: 'user@example.com', username: 'testuser', role: 'user', tokenId: 'id' },
        'wrong-secret',
        { expiresIn: '15m' },
      );
      mockReq.headers = { authorization: `Bearer ${invalidToken}` };

      authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          message: 'Access token is malformed or invalid',
        }),
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for completely malformed token', () => {
      mockReq.headers = { authorization: 'Bearer not-a-jwt-at-all' };

      authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for empty token string', () => {
      mockReq.headers = { authorization: 'Bearer ' };

      authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('response format', () => {
    it('should include requestId in error responses', () => {
      mockReq.headers = {};
      (mockReq as any).requestId = 'my-request-123';

      authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'my-request-123',
        }),
      );
    });
  });
});
