"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractToken = extractToken;
exports.verifySocketToken = verifySocketToken;
exports.socketAuthMiddleware = socketAuthMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
/**
 * Extract the JWT token from the socket handshake.
 * Supports both auth.token and query.token for flexibility.
 */
function extractToken(socket) {
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
function verifySocketToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwt.accessSecret);
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
    }
    catch (err) {
        if (err instanceof jsonwebtoken_1.default.TokenExpiredError) {
            logger_1.logger.debug('Socket auth: token expired');
        }
        else if (err instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            logger_1.logger.debug('Socket auth: invalid token');
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
function socketAuthMiddleware(socket, next) {
    const token = extractToken(socket);
    if (!token) {
        logger_1.logger.debug('Socket auth: no token provided', { socketId: socket.id });
        next(new Error('Authentication required: no token provided'));
        return;
    }
    const user = verifySocketToken(token);
    if (!user) {
        logger_1.logger.debug('Socket auth: invalid token', { socketId: socket.id });
        next(new Error('Authentication failed: invalid or expired token'));
        return;
    }
    // Attach user data to the socket
    socket.user = user;
    socket.data.user = user;
    logger_1.logger.debug('Socket auth: authenticated', {
        socketId: socket.id,
        userId: user.userId,
        username: user.username,
    });
    next();
}
//# sourceMappingURL=socket-auth.js.map