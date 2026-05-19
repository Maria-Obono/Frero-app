"use strict";
/**
 * Media service type definitions.
 *
 * Covers Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 12.6, 12.7
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RETRY_CONFIG = exports.MAX_URL_EXPIRATION = exports.MIN_URL_EXPIRATION = exports.DEFAULT_URL_EXPIRATION = exports.IMAGE_RESOLUTIONS = exports.MAX_VIDEO_SIZE = exports.MAX_IMAGE_SIZE = exports.ALLOWED_VIDEO_TYPES = exports.ALLOWED_IMAGE_TYPES = exports.MediaError = void 0;
class MediaError extends Error {
    statusCode;
    details;
    constructor(message, statusCode, details) {
        super(message);
        this.name = 'MediaError';
        this.statusCode = statusCode;
        this.details = details;
    }
}
exports.MediaError = MediaError;
/** Allowed image MIME types */
exports.ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
];
/** Allowed video MIME types */
exports.ALLOWED_VIDEO_TYPES = [
    'video/mp4',
    'video/quicktime',
];
/** Maximum image file size: 10MB */
exports.MAX_IMAGE_SIZE = 10 * 1024 * 1024;
/** Maximum video file size: 500MB */
exports.MAX_VIDEO_SIZE = 500 * 1024 * 1024;
/** Image resolution widths for multi-resolution generation */
exports.IMAGE_RESOLUTIONS = [
    { width: 150, label: 'thumbnail' },
    { width: 600, label: 'medium' },
    { width: 1200, label: 'large' },
];
/** Default signed URL expiration in seconds */
exports.DEFAULT_URL_EXPIRATION = 3600;
/** Minimum signed URL expiration in seconds */
exports.MIN_URL_EXPIRATION = 300;
/** Maximum signed URL expiration in seconds */
exports.MAX_URL_EXPIRATION = 86400;
/** Retry configuration */
exports.RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelayMs: 2000,
};
//# sourceMappingURL=types.js.map