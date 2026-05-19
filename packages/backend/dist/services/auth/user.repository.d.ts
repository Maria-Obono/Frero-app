/**
 * User repository for auth-related database operations.
 */
import { Knex } from 'knex';
import { BaseRepository } from '../../database/base-repository';
import { UserRecord } from './types';
export declare class UserRepository extends BaseRepository<UserRecord & {
    id: number;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}> {
    constructor(options?: {
        db?: Knex;
    });
    /**
     * Find a user by email (case-insensitive).
     */
    findByEmail(email: string): Promise<UserRecord | undefined>;
    /**
     * Find a user by username (case-insensitive).
     */
    findByUsername(username: string): Promise<UserRecord | undefined>;
    /**
     * Find a user by email or username (for login).
     */
    findByEmailOrUsername(identifier: string): Promise<UserRecord | undefined>;
    /**
     * Create a new user and return the full user record.
     */
    createUser(data: {
        email: string;
        username: string;
        password_hash: string;
    }): Promise<UserRecord>;
    /**
     * Check if an email already exists.
     */
    emailExists(email: string): Promise<boolean>;
    /**
     * Check if a username already exists.
     */
    usernameExists(username: string): Promise<boolean>;
    /**
     * Update the locked_until field for a user (account lockout).
     */
    updateLockedUntil(userId: number, lockedUntil: Date | null): Promise<void>;
}
//# sourceMappingURL=user.repository.d.ts.map