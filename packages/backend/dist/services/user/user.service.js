"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = exports.MockMediaUploader = void 0;
const sharp_1 = __importDefault(require("sharp"));
const uuid_1 = require("uuid");
const user_repository_1 = require("./user.repository");
const types_1 = require("./types");
/** Maximum file size for image uploads: 10MB (Requirement 2.6) */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
/** Accepted image MIME types (Requirement 2.8) */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
/** Profile photo dimensions (Requirement 2.3) */
const PROFILE_PHOTO_SIZE = { width: 400, height: 400 };
/** Cover photo dimensions (Requirement 2.4) */
const COVER_PHOTO_SIZE = { width: 1500, height: 500 };
/**
 * Mock media uploader that simulates S3 uploads.
 * Returns a fake URL based on the key.
 */
class MockMediaUploader {
    async upload(_buffer, key, _contentType) {
        return `https://frero-media.s3.amazonaws.com/${key}`;
    }
}
exports.MockMediaUploader = MockMediaUploader;
class UserService {
    repository;
    mediaUploader;
    constructor(options) {
        this.repository = options?.repository || new user_repository_1.UserProfileRepository();
        this.mediaUploader = options?.mediaUploader || new MockMediaUploader();
    }
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
    async getProfile(userId, requesterId) {
        const user = await this.repository.findProfileById(userId);
        if (!user) {
            throw new types_1.UserServiceError('User not found', 404);
        }
        const isOwner = requesterId !== undefined && requesterId === userId;
        if (isOwner) {
            return this.mapToProfile(user, types_1.OWNER_VISIBLE_FIELDS);
        }
        return this.mapToProfile(user, types_1.PUBLIC_VISIBLE_FIELDS);
    }
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
    async updateProfile(userId, data) {
        // Validate fields
        const errors = this.validateProfileUpdate(data);
        if (errors.length > 0) {
            throw new types_1.UserServiceError('Profile validation failed', 400, errors);
        }
        // Check user exists
        const existingUser = await this.repository.findProfileById(userId);
        if (!existingUser) {
            throw new types_1.UserServiceError('User not found', 404);
        }
        // Build update object with only provided fields
        const updateData = {};
        if (data.display_name !== undefined) {
            updateData.display_name = data.display_name;
        }
        if (data.bio !== undefined) {
            updateData.bio = data.bio;
        }
        if (data.location !== undefined) {
            updateData.location = data.location;
        }
        if (data.website !== undefined) {
            updateData.website = data.website;
        }
        // Only update if there are fields to update
        if (Object.keys(updateData).length > 0) {
            await this.repository.updateProfile(userId, updateData);
        }
        // Return updated profile
        const updatedUser = await this.repository.findProfileById(userId);
        return this.mapToProfile(updatedUser, types_1.OWNER_VISIBLE_FIELDS);
    }
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
    async uploadProfilePhoto(userId, file) {
        // Validate the image
        this.validateImage(file);
        // Check user exists
        const user = await this.repository.findProfileById(userId);
        if (!user) {
            throw new types_1.UserServiceError('User not found', 404);
        }
        // Resize image to 400x400
        const resizedBuffer = await this.resizeImage(file.buffer, PROFILE_PHOTO_SIZE.width, PROFILE_PHOTO_SIZE.height);
        // Generate unique key for S3
        const extension = this.getExtensionFromMimetype(file.mimetype);
        const key = `avatars/${userId}/${(0, uuid_1.v4)()}.${extension}`;
        // Upload to S3
        const url = await this.mediaUploader.upload(resizedBuffer, key, file.mimetype);
        // Update user's avatar_url
        await this.repository.updateProfile(userId, { avatar_url: url });
        return { url, key };
    }
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
    async uploadCoverPhoto(userId, file) {
        // Validate the image
        this.validateImage(file);
        // Check user exists
        const user = await this.repository.findProfileById(userId);
        if (!user) {
            throw new types_1.UserServiceError('User not found', 404);
        }
        // Resize image to 1500x500
        const resizedBuffer = await this.resizeImage(file.buffer, COVER_PHOTO_SIZE.width, COVER_PHOTO_SIZE.height);
        // Generate unique key for S3
        const extension = this.getExtensionFromMimetype(file.mimetype);
        const key = `covers/${userId}/${(0, uuid_1.v4)()}.${extension}`;
        // Upload to S3
        const url = await this.mediaUploader.upload(resizedBuffer, key, file.mimetype);
        // Update user's cover_url
        await this.repository.updateProfile(userId, { cover_url: url });
        return { url, key };
    }
    /**
     * Validate profile update fields.
     *
     * Requirement 2.1:
     * - bio: max 500 characters
     * - display_name: 1-50 characters
     * - location: max 100 characters
     * - website: max 200 characters
     */
    validateProfileUpdate(data) {
        const errors = [];
        if (data.display_name !== undefined) {
            if (data.display_name.length < 1) {
                errors.push({
                    field: 'display_name',
                    message: 'Display name must be at least 1 character',
                });
            }
            else if (data.display_name.length > 50) {
                errors.push({
                    field: 'display_name',
                    message: 'Display name must not exceed 50 characters',
                });
            }
        }
        if (data.bio !== undefined) {
            if (data.bio.length > 500) {
                errors.push({
                    field: 'bio',
                    message: 'Bio must not exceed 500 characters',
                });
            }
        }
        if (data.location !== undefined) {
            if (data.location.length > 100) {
                errors.push({
                    field: 'location',
                    message: 'Location must not exceed 100 characters',
                });
            }
        }
        if (data.website !== undefined) {
            if (data.website.length > 200) {
                errors.push({
                    field: 'website',
                    message: 'Website must not exceed 200 characters',
                });
            }
        }
        return errors;
    }
    /**
     * Validate an uploaded image file.
     *
     * Requirement 2.6: Max 10MB file size.
     * Requirement 2.8: Accepted formats: JPEG, PNG, WebP, GIF.
     */
    validateImage(file) {
        // Check file size (Requirement 2.6, 2.7)
        if (file.size > MAX_IMAGE_SIZE) {
            throw new types_1.UserServiceError('Image file size must not exceed 10MB', 400);
        }
        // Check file type (Requirement 2.8)
        if (!ACCEPTED_IMAGE_TYPES.includes(file.mimetype)) {
            throw new types_1.UserServiceError('Invalid image format. Accepted formats: JPEG, PNG, WebP, GIF', 400);
        }
    }
    /**
     * Resize an image buffer to the specified dimensions using sharp.
     * Uses cover fit to fill the exact dimensions.
     */
    async resizeImage(buffer, width, height) {
        return (0, sharp_1.default)(buffer)
            .resize(width, height, { fit: 'cover' })
            .toBuffer();
    }
    /**
     * Get file extension from MIME type.
     */
    getExtensionFromMimetype(mimetype) {
        const map = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/gif': 'gif',
        };
        return map[mimetype] || 'jpg';
    }
    /**
     * Map a user entity to a profile response with field filtering.
     */
    mapToProfile(user, fields) {
        const profile = {};
        for (const field of fields) {
            if (field in user) {
                profile[field] = user[field];
            }
        }
        return profile;
    }
}
exports.UserService = UserService;
//# sourceMappingURL=user.service.js.map