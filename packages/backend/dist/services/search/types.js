"use strict";
/**
 * Search service type definitions.
 *
 * Covers Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRENDING_CACHE_TTL_SECONDS = exports.TRENDING_WINDOW_HOURS = exports.SUGGESTED_USERS_COUNT = exports.TRENDING_HASHTAGS_COUNT = exports.TRENDING_POSTS_COUNT = exports.MAX_TYPEAHEAD_RESULTS = exports.MIN_TYPEAHEAD_LENGTH = exports.DEFAULT_PAGE_SIZE = exports.MAX_QUERY_LENGTH = exports.MIN_QUERY_LENGTH = exports.SearchServiceError = void 0;
// ─── Error ──────────────────────────────────────────────────────────────────
class SearchServiceError extends Error {
    statusCode;
    details;
    constructor(message, statusCode, details) {
        super(message);
        this.name = 'SearchServiceError';
        this.statusCode = statusCode;
        this.details = details;
    }
}
exports.SearchServiceError = SearchServiceError;
// ─── Constants ──────────────────────────────────────────────────────────────
/** Minimum search query length (Requirement 10.1) */
exports.MIN_QUERY_LENGTH = 1;
/** Maximum search query length (Requirement 10.1) */
exports.MAX_QUERY_LENGTH = 100;
/** Default results per page (Requirement 10.1) */
exports.DEFAULT_PAGE_SIZE = 20;
/** Minimum typeahead query length (Requirement 10.4) */
exports.MIN_TYPEAHEAD_LENGTH = 2;
/** Maximum typeahead suggestions (Requirement 10.4) */
exports.MAX_TYPEAHEAD_RESULTS = 8;
/** Trending posts count for explore page (Requirement 10.3) */
exports.TRENDING_POSTS_COUNT = 10;
/** Trending hashtags count for explore page (Requirement 10.3) */
exports.TRENDING_HASHTAGS_COUNT = 10;
/** Suggested users count for explore page (Requirement 10.3) */
exports.SUGGESTED_USERS_COUNT = 10;
/** Trending window in hours (Requirement 10.3) */
exports.TRENDING_WINDOW_HOURS = 24;
/** Redis cache TTL for trending content in seconds (5 minutes) */
exports.TRENDING_CACHE_TTL_SECONDS = 300;
//# sourceMappingURL=types.js.map