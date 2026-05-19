"use strict";
/**
 * Feed service type definitions.
 *
 * Covers Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FEED_CACHE_TTL_SECONDS = exports.RECENT_INTERACTION_BOOST = exports.RECENT_INTERACTION_DAYS = exports.FEED_RECENCY_WINDOW_DAYS = exports.FEED_MAX_POSTS_PER_SESSION = exports.FEED_PAGE_SIZE = exports.FeedServiceError = void 0;
class FeedServiceError extends Error {
    statusCode;
    details;
    constructor(message, statusCode, details) {
        super(message);
        this.name = 'FeedServiceError';
        this.statusCode = statusCode;
        this.details = details;
    }
}
exports.FeedServiceError = FeedServiceError;
/** Number of posts per page (Requirement 9.4) */
exports.FEED_PAGE_SIZE = 20;
/** Maximum posts per session (Requirement 9.4) */
exports.FEED_MAX_POSTS_PER_SESSION = 500;
/** Recency window in days (Requirement 9.1) */
exports.FEED_RECENCY_WINDOW_DAYS = 7;
/** Recent interaction window in days for author boost (Requirement 9.5) */
exports.RECENT_INTERACTION_DAYS = 30;
/** Boost multiplier for recently-interacted authors (Requirement 9.5) */
exports.RECENT_INTERACTION_BOOST = 1.5;
/** Redis cache TTL for feed in seconds (5 minutes) */
exports.FEED_CACHE_TTL_SECONDS = 300;
//# sourceMappingURL=types.js.map