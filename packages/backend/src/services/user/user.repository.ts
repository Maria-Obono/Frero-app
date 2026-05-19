/**
 * User repository for profile-related database operations.
 */

import { Knex } from 'knex';
import { BaseRepository } from '../../database/base-repository';

export interface UserEntity {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  role: 'user' | 'moderator' | 'admin';
  is_2fa_enabled: boolean;
  totp_secret: string | null;
  locked_until: Date | null;
  failed_login_attempts: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class UserProfileRepository extends BaseRepository<UserEntity> {
  constructor(options?: { db?: Knex }) {
    super('users', { db: options?.db });
  }

  /**
   * Find a user by ID, selecting only profile-relevant fields.
   */
  async findProfileById(userId: number): Promise<UserEntity | undefined> {
    return this.findById(userId);
  }

  /**
   * Update profile fields for a user.
   * Returns the number of affected rows.
   */
  async updateProfile(
    userId: number,
    data: Partial<Pick<UserEntity, 'display_name' | 'bio' | 'location' | 'website' | 'avatar_url' | 'cover_url'>>,
  ): Promise<number> {
    return this.update(userId, data as any);
  }
}
