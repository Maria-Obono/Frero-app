/**
 * User repository for auth-related database operations.
 */

import { Knex } from 'knex';
import { BaseRepository } from '../../database/base-repository';
import { UserRecord } from './types';

export class UserRepository extends BaseRepository<UserRecord & { id: number; deleted_at: Date | null; created_at: Date; updated_at: Date }> {
  constructor(options?: { db?: Knex }) {
    super('users', {
      db: options?.db,
      cascades: [
        { table: 'posts', foreignKey: 'user_id' },
        { table: 'reels', foreignKey: 'user_id' },
        { table: 'stories', foreignKey: 'user_id' },
        { table: 'comments', foreignKey: 'user_id' },
      ],
    });
  }

  /**
   * Find a user by email (case-insensitive).
   */
  async findByEmail(email: string): Promise<UserRecord | undefined> {
    return this.query()
      .where('email', email.toLowerCase())
      .first() as Promise<UserRecord | undefined>;
  }

  /**
   * Find a user by username (case-insensitive).
   */
  async findByUsername(username: string): Promise<UserRecord | undefined> {
    return this.query()
      .where('username', username.toLowerCase())
      .first() as Promise<UserRecord | undefined>;
  }

  /**
   * Find a user by email or username (for login).
   */
  async findByEmailOrUsername(identifier: string): Promise<UserRecord | undefined> {
    return this.query()
      .where('email', identifier.toLowerCase())
      .orWhere('username', identifier.toLowerCase())
      .first() as Promise<UserRecord | undefined>;
  }

  /**
   * Create a new user and return the full user record.
   */
  async createUser(data: {
    email: string;
    username: string;
    password_hash: string;
  }): Promise<UserRecord> {
    const id = await this.create({
      email: data.email.toLowerCase(),
      username: data.username.toLowerCase(),
      password_hash: data.password_hash,
      role: 'user',
      is_2fa_enabled: false,
      failed_login_attempts: 0,
    } as any);

    const user = await this.findById(id);
    return user as unknown as UserRecord;
  }

  /**
   * Check if an email already exists.
   */
  async emailExists(email: string): Promise<boolean> {
    return this.exists({ email: email.toLowerCase() });
  }

  /**
   * Check if a username already exists.
   */
  async usernameExists(username: string): Promise<boolean> {
    return this.exists({ username: username.toLowerCase() });
  }

  /**
   * Update the locked_until field for a user (account lockout).
   */
  async updateLockedUntil(userId: number, lockedUntil: Date | null): Promise<void> {
    await this.query(true)
      .where('id', userId)
      .update({ locked_until: lockedUntil });
  }
}
