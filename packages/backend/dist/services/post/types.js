"use strict";
/**
 * Post service type definitions.
 *
 * Covers Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11
 * Covers Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_STORY_SIZE = exports.MAX_STORY_VIDEO_DURATION = exports.MIN_STORY_VIDEO_DURATION = exports.STORY_EXPIRATION_MS = exports.StoryMediaType = exports.REEL_MAX_BITRATE = exports.REEL_MAX_HEIGHT = exports.REEL_MAX_WIDTH = exports.MAX_REEL_SIZE = exports.MAX_REEL_DURATION = exports.MIN_REEL_DURATION = exports.ENGAGEMENT_CACHE_TTL = exports.MAX_COMMENT_DEPTH = exports.MAX_COMMENT_LENGTH = exports.MIN_COMMENT_LENGTH = exports.LikeableType = exports.MAX_VIDEO_DURATION = exports.MAX_VIDEO_SIZE = exports.MAX_PHOTO_SIZE = exports.MAX_MENTIONS_PER_POST = exports.MAX_HASHTAGS_PER_POST = exports.MAX_CAROUSEL_ITEMS = exports.MIN_CAROUSEL_ITEMS = exports.MAX_CONTENT_LENGTH = exports.MIN_CONTENT_LENGTH = exports.PostServiceError = exports.MediaType = exports.PostPrivacy = exports.PostType = void 0;
var PostType;
(function (PostType) {
    PostType["TEXT"] = "text";
    PostType["PHOTO"] = "photo";
    PostType["VIDEO"] = "video";
    PostType["CAROUSEL"] = "carousel";
})(PostType || (exports.PostType = PostType = {}));
var PostPrivacy;
(function (PostPrivacy) {
    PostPrivacy["PUBLIC"] = "public";
    PostPrivacy["FRIENDS"] = "friends";
    PostPrivacy["PRIVATE"] = "private";
})(PostPrivacy || (exports.PostPrivacy = PostPrivacy = {}));
var MediaType;
(function (MediaType) {
    MediaType["IMAGE"] = "image";
    MediaType["VIDEO"] = "video";
})(MediaType || (exports.MediaType = MediaType = {}));
class PostServiceError extends Error {
    statusCode;
    details;
    constructor(message, statusCode, details) {
        super(message);
        this.name = 'PostServiceError';
        this.statusCode = statusCode;
        this.details = details;
    }
}
exports.PostServiceError = PostServiceError;
/** Minimum content length for text posts */
exports.MIN_CONTENT_LENGTH = 1;
/** Maximum content length for posts (Requirement 4.8) */
exports.MAX_CONTENT_LENGTH = 5000;
/** Minimum carousel items (Requirement 4.9) */
exports.MIN_CAROUSEL_ITEMS = 2;
/** Maximum carousel items (Requirement 4.9) */
exports.MAX_CAROUSEL_ITEMS = 10;
/** Maximum hashtags per post (Requirement 4.5) */
exports.MAX_HASHTAGS_PER_POST = 30;
/** Maximum mentions per post (Requirement 4.6) */
exports.MAX_MENTIONS_PER_POST = 20;
/** Maximum photo size: 15MB (Requirement 4.11) */
exports.MAX_PHOTO_SIZE = 15 * 1024 * 1024;
/** Maximum video size: 500MB (Requirement 4.11) */
exports.MAX_VIDEO_SIZE = 500 * 1024 * 1024;
/** Maximum video duration: 10 minutes in seconds (Requirement 4.11) */
exports.MAX_VIDEO_DURATION = 600;
// ============================================================
// Engagement Types (Requirements 6.1 - 6.15)
// ============================================================
/** Likeable entity types matching the DB enum */
var LikeableType;
(function (LikeableType) {
    LikeableType["POST"] = "post";
    LikeableType["REEL"] = "reel";
    LikeableType["COMMENT"] = "comment";
})(LikeableType || (exports.LikeableType = LikeableType = {}));
/** Minimum comment length (Requirement 6.5, 6.6) */
exports.MIN_COMMENT_LENGTH = 1;
/** Maximum comment length (Requirement 6.5, 6.6) */
exports.MAX_COMMENT_LENGTH = 2000;
/** Maximum comment nesting depth (Requirement 6.7, 6.8) */
exports.MAX_COMMENT_DEPTH = 3;
/** Redis cache TTL for engagement counts in seconds (Requirement 6.14) */
exports.ENGAGEMENT_CACHE_TTL = 5;
/** Minimum reel duration: 1 second (Requirement 5.2) */
exports.MIN_REEL_DURATION = 1;
/** Maximum reel duration: 90 seconds (Requirement 5.2) */
exports.MAX_REEL_DURATION = 90;
/** Maximum reel file size: 500MB (Requirement 5.2) */
exports.MAX_REEL_SIZE = 500 * 1024 * 1024;
/** Reel compression max width (Requirement 5.1) */
exports.REEL_MAX_WIDTH = 1080;
/** Reel compression max height (Requirement 5.1) */
exports.REEL_MAX_HEIGHT = 1920;
/** Reel compression max bitrate in bps (Requirement 5.1) */
exports.REEL_MAX_BITRATE = 8_000_000;
// ============================================================
// Story Types (Requirements 5.4, 5.5, 5.6, 5.7, 5.8)
// ============================================================
var StoryMediaType;
(function (StoryMediaType) {
    StoryMediaType["IMAGE"] = "image";
    StoryMediaType["VIDEO"] = "video";
})(StoryMediaType || (exports.StoryMediaType = StoryMediaType = {}));
/** Story expiration duration: 24 hours in milliseconds (Requirement 5.4) */
exports.STORY_EXPIRATION_MS = 24 * 60 * 60 * 1000;
/** Minimum story video duration: 1 second (Requirement 5.7) */
exports.MIN_STORY_VIDEO_DURATION = 1;
/** Maximum story video duration: 30 seconds (Requirement 5.7) */
exports.MAX_STORY_VIDEO_DURATION = 30;
/** Maximum story file size: 500MB (Requirement 5.7) */
exports.MAX_STORY_SIZE = 500 * 1024 * 1024;
//# sourceMappingURL=types.js.map