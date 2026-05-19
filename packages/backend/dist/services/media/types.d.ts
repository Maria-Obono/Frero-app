/**
 * Media service type definitions.
 *
 * Covers Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 12.6, 12.7
 */
export interface ImageUploadOptions {
    /** Original filename */
    filename: string;
    /** MIME type of the file */
    mimeType: string;
    /** Optional folder prefix in S3 */
    folder?: string;
    /** Signed URL expiration in seconds (300-86400, default 3600) */
    urlExpiration?: number;
}
export interface VideoUploadOptions {
    /** Original filename */
    filename: string;
    /** MIME type of the file */
    mimeType: string;
    /** Optional folder prefix in S3 */
    folder?: string;
    /** Signed URL expiration in seconds (300-86400, default 3600) */
    urlExpiration?: number;
    /** Maximum duration in seconds (optional, for validation) */
    maxDuration?: number;
}
export interface Dimensions {
    width: number;
    height?: number;
}
export interface CompressionOptions {
    /** Target codec (default: h264) */
    codec?: string;
    /** Maximum bitrate in bps */
    maxBitrate?: number;
    /** Maximum width */
    maxWidth?: number;
    /** Maximum height */
    maxHeight?: number;
}
export interface MediaResult {
    /** Unique key for the primary media file in S3 */
    key: string;
    /** Signed URL for the primary media file */
    url: string;
    /** All generated variants (e.g., thumbnail, medium, large for images) */
    variants: MediaVariant[];
    /** MIME type of the original file */
    mimeType: string;
    /** Original filename */
    filename: string;
}
export interface MediaVariant {
    /** S3 key for this variant */
    key: string;
    /** Signed URL for this variant */
    url: string;
    /** Width of this variant */
    width: number;
    /** Height of this variant */
    height: number;
    /** Label for this variant (e.g., 'thumbnail', 'medium', 'large') */
    label: string;
}
export interface ValidationResult {
    valid: boolean;
    error?: string;
}
export declare class MediaError extends Error {
    readonly statusCode: number;
    readonly details?: Record<string, unknown>;
    constructor(message: string, statusCode: number, details?: Record<string, unknown>);
}
/** Allowed image MIME types */
export declare const ALLOWED_IMAGE_TYPES: readonly ["image/jpeg", "image/png", "image/webp", "image/gif"];
/** Allowed video MIME types */
export declare const ALLOWED_VIDEO_TYPES: readonly ["video/mp4", "video/quicktime"];
/** Maximum image file size: 10MB */
export declare const MAX_IMAGE_SIZE: number;
/** Maximum video file size: 500MB */
export declare const MAX_VIDEO_SIZE: number;
/** Image resolution widths for multi-resolution generation */
export declare const IMAGE_RESOLUTIONS: readonly [{
    readonly width: 150;
    readonly label: "thumbnail";
}, {
    readonly width: 600;
    readonly label: "medium";
}, {
    readonly width: 1200;
    readonly label: "large";
}];
/** Default signed URL expiration in seconds */
export declare const DEFAULT_URL_EXPIRATION = 3600;
/** Minimum signed URL expiration in seconds */
export declare const MIN_URL_EXPIRATION = 300;
/** Maximum signed URL expiration in seconds */
export declare const MAX_URL_EXPIRATION = 86400;
/** Retry configuration */
export declare const RETRY_CONFIG: {
    readonly maxAttempts: 3;
    readonly baseDelayMs: 2000;
};
//# sourceMappingURL=types.d.ts.map