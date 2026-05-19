"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
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
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    // Check for Authorization header
    if (!authHeader) {
        res.status(401).json({
            status: 401,
            error: 'Unauthorized',
            message: 'Authorization header is required',
            requestId: req.requestId || 'unknown',
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
            requestId: req.requestId || 'unknown',
        });
        return;
    }
    const token = parts[1];
    // Verify JWT
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwt.accessSecret);
        req.user = decoded;
        next();
    }
    catch (err) {
        let message = 'Invalid access token';
        if (err instanceof jsonwebtoken_1.default.TokenExpiredError) {
            message = 'Access token has expired';
        }
        else if (err instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            message = 'Access token is malformed or invalid';
        }
        res.status(401).json({
            status: 401,
            error: 'Unauthorized',
            message,
            requestId: req.requestId || 'unknown',
        });
    }
}
//# sourceMappingURL=auth.js.map