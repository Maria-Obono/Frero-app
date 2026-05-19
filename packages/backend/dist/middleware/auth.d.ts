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
export declare function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map