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
import { Socket } from 'socket.io';
import { SocketUser } from './types';
/**
 * Extract the JWT token from the socket handshake.
 * Supports both auth.token and query.token for flexibility.
 */
export declare function extractToken(socket: Socket): string | null;
/**
 * Verify a JWT token and return the decoded user payload.
 * Returns null if the token is invalid, expired, or malformed.
 */
export declare function verifySocketToken(token: string): SocketUser | null;
/**
 * Socket.IO authentication middleware.
 *
 * Extracts JWT from handshake, verifies it, and attaches user data
 * to the socket. Rejects the connection if authentication fails.
 */
export declare function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void): void;
//# sourceMappingURL=socket-auth.d.ts.map