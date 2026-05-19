"use strict";
/**
 * Social service type definitions.
 *
 * Requirements covered:
 * - 3.4: Follow user with notification
 * - 3.5: Unfollow user (remove follower relationship)
 * - 3.6: Block user (remove all relationships, prevent future interactions)
 * - 3.7: Mutual friends count calculation
 * - 3.8: Paginated connections (cursor-based, default 20, max 100)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialServiceError = exports.MAX_CONNECTIONS_PAGE_SIZE = exports.DEFAULT_CONNECTIONS_PAGE_SIZE = void 0;
/** Default page size for connections (Requirement 3.8) */
exports.DEFAULT_CONNECTIONS_PAGE_SIZE = 20;
/** Maximum page size for connections (Requirement 3.8) */
exports.MAX_CONNECTIONS_PAGE_SIZE = 100;
class SocialServiceError extends Error {
    statusCode;
    code;
    constructor(message, statusCode, code) {
        super(message);
        this.name = 'SocialServiceError';
        this.statusCode = statusCode;
        this.code = code;
    }
}
exports.SocialServiceError = SocialServiceError;
//# sourceMappingURL=types.js.map