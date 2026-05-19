/**
 * User Service - Profile Management
 *
 * Handles user profile retrieval, updates, and photo uploads.
 *
 * Requirements covered:
 * - 2.1: Profile field validation (bio ≤500, display_name 1-50, location ≤100, website ≤200)
 * - 2.2: Reject invalid updates with field-specific errors, preserve existing data
 * - 2.3: Profile photo upload (resize to 400x400, upload to S3)
 * - 2.4: Cover photo upload (resize to 1500x500, upload to S3)
 * - 2.5: Privacy-aware field filtering for non-owner requests
 * - 2.6: Image file size validation (max 10MB)
 * - 2.7: Reject uploads exceeding 10MB with error message
 * - 2.8: Reject invalid image formats with accepted formats error
 */
import { UserProfileRepository } from './user.repository';
import { UserProfile, ProfileUpdateDTO, UploadedFile, ImageUploadResult } from './types';
/**
 * Interface for the media upload service.
 * This will be implemented by MediaService in task 7.1.
 * For now, we use a mock implementation.
 */
export interface IMediaUploader {
    upload(buffer: Buffer, key: string, contentType: string): Promise<string>;
}
/**
 * Mock media uploader that simulates S3 uploads.
 * Returns a fake URL based on the key.
 */
export declare class MockMediaUploader implements IMediaUploader {
    upload(_buffer: Buffer, key: string, _contentType: string): Promise<string>;
}
export declare class UserService {
    private readonly repository;
    private readonly mediaUploader;
    constructor(options?: {
        repository?: UserProfileRepository;
        mediaUploader?: IMediaUploader;
    });
    /**
     * Get a user profile with privacy-aware field filtering.
     *
     * Requirement 2.5: When a profile is requested by another user,
     * only publicly visible fields are returned.
     *
     * @param userId - The ID of the profile to retrieve
     * @param requesterId - The ID of the user making the request (optional)
     * @returns The user profile with appropriate field visibility
     */
    getProfile(userId: number, requesterId?: number): Promise<UserProfile>;
    /**
     * Update a user's profile information.
     *
     * Requirement 2.1: Validates field lengths.
     * Requirement 2.2: Rejects invalid updates with field-specific errors,
     * preserves existing data on failure.
     *
     * @param userId - The ID of the user to update
     * @param data - The profile fields to update
     * @returns The updated user profile
     */
    updateProfile(userId: number, data: ProfileUpdateDTO): Promise<UserProfile>;
    /**
     * Upload and set a user's profile photo.
     *
     * Requirement 2.3: Resize to 400x400 pixels, upload to S3.
     * Requirement 2.6: Validate file size (max 10MB).
     * Requirement 2.8: Validate image format (JPEG, PNG, WebP, GIF).
     *
     * @param userId - The ID of the user
     * @param file - The uploaded file
     * @returns The upload result with the new URL
     */
    uploadProfilePhoto(userId: number, file: UploadedFile): Promise<ImageUploadResult>;
    /**
     * Upload and set a user's cover photo.
     *
     * Requirement 2.4: Resize to 1500x500 pixels, upload to S3.
     * Requirement 2.6: Validate file size (max 10MB).
     * Requirement 2.8: Validate image format (JPEG, PNG, WebP, GIF).
     *
     * @param userId - The ID of the user
     * @param file - The uploaded file
     * @returns The upload result with the new URL
     */
    uploadCoverPhoto(userId: number, file: UploadedFile): Promise<ImageUploadResult>;
    /**
     * Validate profile update fields.
     *
     * Requirement 2.1:
     * - bio: max 500 characters
     * - display_name: 1-50 characters
     * - location: max 100 characters
     * - website: max 200 characters
     */
    private validateProfileUpdate;
    /**
     * Validate an uploaded image file.
     *
     * Requirement 2.6: Max 10MB file size.
     * Requirement 2.8: Accepted formats: JPEG, PNG, WebP, GIF.
     */
    private validateImage;
    /**
     * Resize an image buffer to the specified dimensions using sharp.
     * Uses cover fit to fill the exact dimensions.
     */
    private resizeImage;
    /**
     * Get file extension from MIME type.
     */
    private getExtensionFromMimetype;
    /**
     * Map a user entity to a profile response with field filtering.
     */
    private mapToProfile;
}
//# sourceMappingURL=user.service.d.ts.map