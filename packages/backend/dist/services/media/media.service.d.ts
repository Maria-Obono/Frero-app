/**
 * Media service handling file uploads, image processing, video compression,
 * and S3 storage with signed URL generation.
 *
 * Requirements covered:
 * - 16.1: Multi-resolution image generation (150px, 600px, 1200px) preserving aspect ratio
 * - 16.2: Video compression to H.264 with thumbnail generation
 * - 16.3: Video file size validation (max 500MB)
 * - 16.4: Image file size validation (max 10MB)
 * - 16.5: Signed URLs with configurable expiration (300-86400s, default 3600s)
 * - 16.6: Retry logic (3 attempts, exponential backoff from 2s)
 * - 16.7: Failure notification after retry exhaustion
 * - 16.8: Image format validation (JPEG, PNG, WebP, GIF)
 * - 12.6: File type validation (JPEG, PNG, GIF, WebP, MP4, MOV)
 * - 12.7: Reject invalid uploads with specific error
 */
import { S3Client } from '@aws-sdk/client-s3';
import { ImageUploadOptions, VideoUploadOptions, Dimensions, CompressionOptions, MediaResult, ValidationResult } from './types';
export declare class MediaService {
    private readonly s3Client;
    private readonly bucket;
    constructor(options?: {
        s3Client?: S3Client;
        bucket?: string;
    });
    /**
     * Upload an image with multi-resolution generation.
     *
     * Validates file type and size, generates thumbnail (150px), medium (600px),
     * and large (1200px) versions preserving aspect ratio, uploads all to S3,
     * and returns signed URLs.
     *
     * Requirements: 16.1, 16.4, 16.5, 16.6, 16.8
     *
     * @throws MediaError with statusCode 400 for invalid file type or size
     */
    uploadImage(file: Buffer, options: ImageUploadOptions): Promise<MediaResult>;
    /**
     * Upload a video with H.264 compression and thumbnail generation.
     *
     * Validates file type and size, compresses to H.264, generates a thumbnail,
     * uploads both to S3, and returns signed URLs.
     *
     * Requirements: 16.2, 16.3, 16.5, 16.6
     *
     * @throws MediaError with statusCode 400 for invalid file type or size
     */
    uploadVideo(file: Buffer, options: VideoUploadOptions): Promise<MediaResult>;
    /**
     * Validate a file's type and size.
     *
     * Requirements: 16.3, 16.4, 16.8, 12.6, 12.7
     *
     * @param file - The file buffer
     * @param type - 'image' or 'video'
     * @param mimeType - The MIME type of the file
     * @returns ValidationResult indicating if the file is valid
     */
    validateFile(file: Buffer, type: 'image' | 'video', mimeType?: string): ValidationResult;
    /**
     * Resize an image to the specified width, preserving aspect ratio.
     *
     * Uses sharp for high-quality image resizing.
     *
     * @param file - The image buffer
     * @param dimensions - Target dimensions (width required, height auto-calculated)
     * @returns Resized image buffer
     */
    resizeImage(file: Buffer, dimensions: Dimensions): Promise<Buffer>;
    /**
     * Compress a video to H.264 format.
     *
     * In production, this would use ffmpeg for actual compression.
     * For now, returns the original buffer (compression is a placeholder
     * that can be replaced with ffmpeg integration).
     *
     * Requirement: 16.2
     *
     * @param file - The video buffer
     * @param options - Compression options
     * @returns Compressed video buffer
     */
    compressVideo(file: Buffer, _options?: CompressionOptions): Promise<Buffer>;
    /**
     * Generate a thumbnail from a video file.
     *
     * In production, this would extract a frame using ffmpeg.
     * For now, generates a placeholder JPEG thumbnail.
     *
     * Requirement: 16.2
     *
     * @param _videoFile - The video buffer
     * @returns Thumbnail image buffer (JPEG)
     */
    generateThumbnail(_videoFile: Buffer): Promise<Buffer>;
    /**
     * Generate a signed URL for an S3 object.
     *
     * Requirement: 16.5
     *
     * @param key - The S3 object key
     * @param expiresIn - Expiration in seconds (300-86400, default 3600)
     * @returns Signed URL string
     */
    getSignedUrl(key: string, expiresIn?: number): Promise<string>;
    /**
     * Upload a buffer to S3 with retry logic.
     *
     * Implements exponential backoff: 3 attempts, starting at 2s delay.
     * Delays: attempt 1 = immediate, attempt 2 = 2s, attempt 3 = 4s.
     *
     * Requirement: 16.6
     *
     * @throws MediaError after all retry attempts are exhausted
     */
    private uploadToS3WithRetry;
    /**
     * Upload a buffer to S3.
     */
    private uploadToS3;
    /**
     * Clamp URL expiration to valid range (300-86400s, default 3600s).
     */
    private clampExpiration;
    /**
     * Get file extension from MIME type.
     */
    private getExtensionFromMimeType;
    /**
     * Sleep utility for retry backoff.
     */
    private sleep;
}
//# sourceMappingURL=media.service.d.ts.map