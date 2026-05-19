"use strict";
/**
 * User repository for profile-related database operations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserProfileRepository = void 0;
const base_repository_1 = require("../../database/base-repository");
class UserProfileRepository extends base_repository_1.BaseRepository {
    constructor(options) {
        super('users', { db: options?.db });
    }
    /**
     * Find a user by ID, selecting only profile-relevant fields.
     */
    async findProfileById(userId) {
        return this.findById(userId);
    }
    /**
     * Update profile fields for a user.
     * Returns the number of affected rows.
     */
    async updateProfile(userId, data) {
        return this.update(userId, data);
    }
}
exports.UserProfileRepository = UserProfileRepository;
//# sourceMappingURL=user.repository.js.map