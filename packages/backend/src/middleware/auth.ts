/**
 * JWT verification middleware for the API gateway.
 *
 * Extracts Bearer token from Authorization header, verifies JWT signature
 * and expiration, attaches decoded user info to request, and rejects
 * expired/malformed/invalid tokens with 401.
 *
 * Requirements covered:
 * - 1.11: Expired/malformed JWT rejected with 401 status code
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { config } from '../config';
import { DecodedToken } from '../services/auth/types';

/**
 * Extend Express Request to include authenticated user info.
 */
export interface AuthenticatedRequest extends Request {
  user?: DecodedToken;
}

/**
 * JWT authentication middleware.
 *
 * Extracts the Bearer token from the Authorization header, verifies
 * the JWT signature and expiration, and attaches the decoded user
 * payload to `req.user`.
 *
 * Rejects requests with:
 * - Missing Authorization header → 401
 * - Malformed Authorization header (not Bearer format) → 401
 * - Expired JWT → 401
 * - Invalid/malformed JWT → 401
 */
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  // Check for Authorization header
  if (!authHeader) {
    res.status(401).json({
      status: 401,
      error: 'Unauthorized',
      message: 'Authorization header is required',
      requestId: (req as Request & { requestId?: string }).requestId || 'unknown',
    });
    return;
  }

  // Check for Bearer format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      status: 401,
      error: 'Unauthorized',
      message: 'Authorization header must use Bearer scheme',
      requestId: (req as Request & { requestId?: string }).requestId || 'unknown',
    });
    return;
  }

  const token = parts[1]!;

  // Verify JWT
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret) as DecodedToken;
    req.user = decoded;
    next();
  } catch (err) {
    let message = 'Invalid access token';
    if (err instanceof jwt.TokenExpiredError) {
      message = 'Access token has expired';
    } else if (err instanceof jwt.JsonWebTokenError) {
      message = 'Access token is malformed or invalid';
    }

    res.status(401).json({
      status: 401,
      error: 'Unauthorized',
      message,
      requestId: (req as Request & { requestId?: string }).requestId || 'unknown',
    });
  }
}
