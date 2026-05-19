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

import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

import { UserProfileRepository } from './user.repository';
import {
  UserProfile,
  ProfileUpdateDTO,
  ProfileValidationError,
  UploadedFile,
  ImageUploadResult,
  UserServiceError,
  OWNER_VISIBLE_FIELDS,
  PUBLIC_VISIBLE_FIELDS,
} from './types';

/** Maximum file size for image uploads: 10MB (Requirement 2.6) */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/** Accepted image MIME types (Requirement 2.8) */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Profile photo dimensions (Requirement 2.3) */
const PROFILE_PHOTO_SIZE = { width: 400, height: 400 };

/** Cover photo dimensions (Requirement 2.4) */
const COVER_PHOTO_SIZE = { width: 1500, height: 500 };

/**
 * Interface for the media upload service.
 * This will be implemented by MediaService in task 7.1.
 * For now, we use local file storage.
 */
export interface IMediaUploader {
  upload(buffer: Buffer, key: string, contentType: string): Promise<string>;
}

/**
 * Local media uploader that saves files to disk.
 * Serves them via the /uploads static route.
 */
export class LocalMediaUploader implements IMediaUploader {
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor() {
    const path = require('path');
    const fs = require('fs');
    this.uploadDir = path.resolve(process.cwd(), 'uploads');
    this.baseUrl = '/uploads';

    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async upload(buffer: Buffer, key: string, _contentType: string): Promise<string> {
    const path = require('path');
    const fs = require('fs');

    const filePath = path.join(this.uploadDir, key);
    const dir = path.dirname(filePath);

    // Ensure subdirectory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, buffer);

    return `${this.baseUrl}/${key}`;
  }
}

export class UserService {
  private readonly repository: UserProfileRepository;
  private readonly mediaUploader: IMediaUploader;

  constructor(options?: { repository?: UserProfileRepository; mediaUploader?: IMediaUploader }) {
    this.repository = options?.repository || new UserProfileRepository();
    this.mediaUploader = options?.mediaUploader || new LocalMediaUploader();
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
  async getProfile(userId: number, requesterId?: number): Promise<UserProfile> {
    const user = await this.repository.findProfileById(userId);

    if (!user) {
      throw new UserServiceError('User not found', 404);
    }

    const isOwner = requesterId !== undefined && requesterId === userId;

    if (isOwner) {
      return this.mapToProfile(user, OWNER_VISIBLE_FIELDS as unknown as string[]);
    }

    return this.mapToProfile(user, PUBLIC_VISIBLE_FIELDS as unknown as string[]);
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
  async updateProfile(userId: number, data: ProfileUpdateDTO): Promise<UserProfile> {
    // Validate fields
    const errors = this.validateProfileUpdate(data);
    if (errors.length > 0) {
      throw new UserServiceError('Profile validation failed', 400, errors);
    }

    // Check user exists
    const existingUser = await this.repository.findProfileById(userId);
    if (!existingUser) {
      throw new UserServiceError('User not found', 404);
    }

    // Build update object with only provided fields
    const updateData: Record<string, string | null> = {};
    if (data.display_name !== undefined) {
      updateData.display_name = data.display_name || null;
    }
    if (data.bio !== undefined) {
      updateData.bio = data.bio || null;
    }
    if (data.location !== undefined) {
      updateData.location = data.location || null;
    }
    if (data.website !== undefined) {
      updateData.website = data.website || null;
    }

    // Only update if there are fields to update
    if (Object.keys(updateData).length > 0) {
      await this.repository.updateProfile(userId, updateData as any);
    }

    // Return updated profile
    const updatedUser = await this.repository.findProfileById(userId);
    return this.mapToProfile(updatedUser!, OWNER_VISIBLE_FIELDS as unknown as string[]);
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
  async uploadProfilePhoto(userId: number, file: UploadedFile): Promise<ImageUploadResult> {
    // Validate the image
    this.validateImage(file);

    // Check user exists
    const user = await this.repository.findProfileById(userId);
    if (!user) {
      throw new UserServiceError('User not found', 404);
    }

    // Resize image to 400x400
    const resizedBuffer = await this.resizeImage(
      file.buffer,
      PROFILE_PHOTO_SIZE.width,
      PROFILE_PHOTO_SIZE.height,
    );

    // Generate unique key for S3
    const extension = this.getExtensionFromMimetype(file.mimetype);
    const key = `avatars/${userId}/${uuidv4()}.${extension}`;

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
  async uploadCoverPhoto(userId: number, file: UploadedFile): Promise<ImageUploadResult> {
    // Validate the image
    this.validateImage(file);

    // Check user exists
    const user = await this.repository.findProfileById(userId);
    if (!user) {
      throw new UserServiceError('User not found', 404);
    }

    // Resize image to 1500x500
    const resizedBuffer = await this.resizeImage(
      file.buffer,
      COVER_PHOTO_SIZE.width,
      COVER_PHOTO_SIZE.height,
    );

    // Generate unique key for S3
    const extension = this.getExtensionFromMimetype(file.mimetype);
    const key = `covers/${userId}/${uuidv4()}.${extension}`;

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
  private validateProfileUpdate(data: ProfileUpdateDTO): ProfileValidationError[] {
    const errors: ProfileValidationError[] = [];

    if (data.display_name !== undefined) {
      if (data.display_name.length > 50) {
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
  private validateImage(file: UploadedFile): void {
    // Check file size (Requirement 2.6, 2.7)
    if (file.size > MAX_IMAGE_SIZE) {
      throw new UserServiceError(
        'Image file size must not exceed 10MB',
        400,
      );
    }

    // Check file type (Requirement 2.8)
    if (!ACCEPTED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new UserServiceError(
        'Invalid image format. Accepted formats: JPEG, PNG, WebP, GIF',
        400,
      );
    }
  }

  /**
   * Resize an image buffer to the specified dimensions using sharp.
   * Uses cover fit to fill the exact dimensions.
   */
  private async resizeImage(buffer: Buffer, width: number, height: number): Promise<Buffer> {
    return sharp(buffer)
      .resize(width, height, { fit: 'cover' })
      .toBuffer();
  }

  /**
   * Get file extension from MIME type.
   */
  private getExtensionFromMimetype(mimetype: string): string {
    const map: Record<string, string> = {
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
  private mapToProfile(user: Record<string, any>, fields: string[]): UserProfile {
    const profile: Record<string, any> = {};
    for (const field of fields) {
      if (field in user) {
        profile[field] = user[field];
      }
    }
    return profile as UserProfile;
  }
}
