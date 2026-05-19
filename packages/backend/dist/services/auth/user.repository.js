"use strict";
/**
 * User repository for auth-related database operations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const base_repository_1 = require("../../database/base-repository");
class UserRepository extends base_repository_1.BaseRepository {
    constructor(options) {
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
    async findByEmail(email) {
        return this.query()
            .where('email', email.toLowerCase())
            .first();
    }
    /**
     * Find a user by username (case-insensitive).
     */
    async findByUsername(username) {
        return this.query()
            .where('username', username.toLowerCase())
            .first();
    }
    /**
     * Find a user by email or username (for login).
     */
    async findByEmailOrUsername(identifier) {
        return this.query()
            .where('email', identifier.toLowerCase())
            .orWhere('username', identifier.toLowerCase())
            .first();
    }
    /**
     * Create a new user and return the full user record.
     */
    async createUser(data) {
        const id = await this.create({
            email: data.email.toLowerCase(),
            username: data.username.toLowerCase(),
            password_hash: data.password_hash,
            role: 'user',
            is_2fa_enabled: false,
            failed_login_attempts: 0,
        });
        const user = await this.findById(id);
        return user;
    }
    /**
     * Check if an email already exists.
     */
    async emailExists(email) {
        return this.exists({ email: email.toLowerCase() });
    }
    /**
     * Check if a username already exists.
     */
    async usernameExists(username) {
        return this.exists({ username: username.toLowerCase() });
    }
    /**
     * Update the locked_until field for a user (account lockout).
     */
    async updateLockedUntil(userId, lockedUntil) {
        await this.query(true)
            .where('id', userId)
            .update({ locked_until: lockedUntil });
    }
}
exports.UserRepository = UserRepository;
//# sourceMappingURL=user.repository.js.map