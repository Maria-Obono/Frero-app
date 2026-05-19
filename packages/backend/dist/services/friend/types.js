"use strict";
/**
 * Friend service type definitions.
 *
 * Requirements covered:
 * - 3.1: Send friend request with max 500 pending outbound
 * - 3.2: Accept friend request with mutual friendship (max 5000 friends)
 * - 3.3: Decline friend request without notification
 * - 3.9: Reject self-request, blocked users, existing friendship/pending
 * - 3.10: Mutual pending request auto-accept
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_FRIENDS_PER_USER = exports.MAX_PENDING_OUTBOUND_REQUESTS = exports.FriendServiceError = void 0;
class FriendServiceError extends Error {
    statusCode;
    code;
    constructor(message, statusCode, code) {
        super(message);
        this.name = 'FriendServiceError';
        this.statusCode = statusCode;
        this.code = code;
    }
}
exports.FriendServiceError = FriendServiceError;
/** Maximum pending outbound friend requests per user (Requirement 3.1) */
exports.MAX_PENDING_OUTBOUND_REQUESTS = 500;
/** Maximum total friends per user (Requirement 3.2) */
exports.MAX_FRIENDS_PER_USER = 5000;
//# sourceMappingURL=types.js.map