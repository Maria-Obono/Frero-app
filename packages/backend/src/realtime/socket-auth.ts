/**
 * Socket.IO JWT authentication middleware.
 *
 * Verifies JWT access token provided in the handshake auth object
 * or as a query parameter. Rejects connections with invalid/expired tokens.
 *
 * Requirements covered:
 * - 15.4: Socket.IO connection authentication
 * - 18.4: JWT authentication for WebSocket connections
 */

import jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';

import { config } from '../config';
import { AuthenticatedSocket, SocketUser } from './types';
import { logger } from '../utils/logger';

/**
 * Extract the JWT token from the socket handshake.
 * Supports both auth.token and query.token for flexibility.
 */
export function extractToken(socket: Socket): string | null {
  // Prefer auth object (recommended approach)
  const authToken = socket.handshake.auth?.token;
  if (authToken && typeof authToken === 'string') {
    return authToken;
  }

  // Fallback to query parameter
  const queryToken = socket.handshake.query?.token;
  if (queryToken && typeof queryToken === 'string') {
    return queryToken;
  }

  return null;
}

/**
 * Verify a JWT token and return the decoded user payload.
 * Returns null if the token is invalid, expired, or malformed.
 */
export function verifySocketToken(token: string): SocketUser | null {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret) as {
      userId: number;
      email: string;
      username: string;
      role: string;
      tokenId: string;
    };

    // Validate required fields
    if (!decoded.userId || !decoded.email || !decoded.username) {
      return null;
    }

    return {
      userId: decoded.userId,
      email: decoded.email,
      username: decoded.username,
      role: decoded.role || 'user',
      tokenId: decoded.tokenId || '',
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      logger.debug('Socket auth: token expired');
    } else if (err instanceof jwt.JsonWebTokenError) {
      logger.debug('Socket auth: invalid token');
    }
    return null;
  }
}

/**
 * Socket.IO authentication middleware.
 *
 * Extracts JWT from handshake, verifies it, and attaches user data
 * to the socket. Rejects the connection if authentication fails.
 */
export function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void,
): void {
  const token = extractToken(socket);

  if (!token) {
    logger.debug('Socket auth: no token provided', { socketId: socket.id });
    next(new Error('Authentication required: no token provided'));
    return;
  }

  const user = verifySocketToken(token);

  if (!user) {
    logger.debug('Socket auth: invalid token', { socketId: socket.id });
    next(new Error('Authentication failed: invalid or expired token'));
    return;
  }

  // Attach user data to the socket
  (socket as AuthenticatedSocket).user = user;
  socket.data.user = user;

  logger.debug('Socket auth: authenticated', {
    socketId: socket.id,
    userId: user.userId,
    username: user.username,
  });

  next();
}
