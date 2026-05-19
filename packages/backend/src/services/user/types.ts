/**
 * User service type definitions.
 */

export interface UserProfile {
  id: number;
  username: string;
  email?: string;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  role: 'user' | 'moderator' | 'admin';
  created_at: Date;
}

export interface ProfileUpdateDTO {
  display_name?: string;
  bio?: string;
  location?: string;
  website?: string;
}

export interface ProfileValidationError {
  field: string;
  message: string;
}

export interface ImageUploadResult {
  url: string;
  key: string;
}

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

/**
 * Fields visible to the profile owner (all fields).
 */
export const OWNER_VISIBLE_FIELDS = [
  'id',
  'username',
  'email',
  'display_name',
  'bio',
  'location',
  'website',
  'avatar_url',
  'cover_url',
  'role',
  'created_at',
] as const;

/**
 * Fields visible to other users (public fields only).
 * Requirement 2.5: Only publicly visible fields returned to non-owners.
 */
export const PUBLIC_VISIBLE_FIELDS = [
  'id',
  'username',
  'display_name',
  'bio',
  'location',
  'website',
  'avatar_url',
  'cover_url',
  'role',
  'created_at',
] as const;

export class UserServiceError extends Error {
  public readonly statusCode: number;
  public readonly errors?: ProfileValidationError[];

  constructor(message: string, statusCode: number, errors?: ProfileValidationError[]) {
    super(message);
    this.name = 'UserServiceError';
    this.statusCode = statusCode;
    this.errors = errors;
  }
}
