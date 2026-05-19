"use strict";
/**
 * Admin repository for database operations related to admin/moderation features.
 *
 * Requirements covered:
 * - 11.1: Dashboard analytics queries
 * - 11.2: Report creation
 * - 11.3: Report review/moderation
 * - 11.4: User search with activity history
 * - 11.6: User suspension
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminRepository = void 0;
const connection_1 = require("../../database/connection");
class AdminRepository {
    db;
    constructor(options) {
        this.db = options?.db || (0, connection_1.getDatabase)();
    }
    /**
     * Get active users count (users who logged in at least once) in the given period.
     * Uses updated_at as a proxy for last activity.
     */
    async getActiveUsersCount(since) {
        const result = await this.db('users')
            .whereNull('deleted_at')
            .where('updated_at', '>=', since)
            .count('* as count')
            .first();
        return Number(result?.count) || 0;
    }
    /**
     * Get total posts created in the given period.
     */
    async getPostsCount(since) {
        const result = await this.db('posts')
            .whereNull('deleted_at')
            .where('created_at', '>=', since)
            .count('* as count')
            .first();
        return Number(result?.count) || 0;
    }
    /**
     * Get total comments created in the given period.
     */
    async getCommentsCount(since) {
        const result = await this.db('comments')
            .whereNull('deleted_at')
            .where('created_at', '>=', since)
            .count('* as count')
            .first();
        return Number(result?.count) || 0;
    }
    /**
     * Get total likes created in the given period.
     */
    async getLikesCount(since) {
        const result = await this.db('likes')
            .where('created_at', '>=', since)
            .count('* as count')
            .first();
        return Number(result?.count) || 0;
    }
    /**
     * Create a new content report.
     */
    async createReport(data) {
        const [id] = await this.db('reports').insert({
            reporter_id: data.reporter_id,
            content_id: data.content_id,
            content_type: data.content_type,
            reason: data.reason,
            status: 'pending',
        });
        const report = await this.db('reports').where('id', id).first();
        return report;
    }
    /**
     * Find a report by ID.
     */
    async findReportById(reportId) {
        return this.db('reports').where('id', reportId).first();
    }
    /**
     * Update a report with moderation action.
     */
    async updateReport(reportId, data) {
        await this.db('reports').where('id', reportId).update(data);
        const report = await this.db('reports').where('id', reportId).first();
        return report;
    }
    /**
     * Find a user by ID (including role info).
     */
    async findUserById(userId) {
        return this.db('users')
            .whereNull('deleted_at')
            .where('id', userId)
            .first();
    }
    /**
     * Search users by username or email (partial match).
     */
    async searchUsers(query) {
        return this.db('users')
            .whereNull('deleted_at')
            .where(function () {
            this.where('username', 'like', `%${query}%`)
                .orWhere('email', 'like', `%${query}%`)
                .orWhere('display_name', 'like', `%${query}%`);
        })
            .select('id', 'email', 'username', 'display_name', 'avatar_url', 'role', 'created_at', 'deleted_at')
            .limit(20);
    }
    /**
     * Get the last 100 activity entries for a user (posts, comments, likes).
     */
    async getUserActivity(userId) {
        // Get recent posts
        const posts = await this.db('posts')
            .where('user_id', userId)
            .whereNull('deleted_at')
            .select('id', this.db.raw("'post' as type"), 'id as content_id', this.db.raw('SUBSTRING(content, 1, 100) as content_preview'), 'created_at')
            .orderBy('created_at', 'desc')
            .limit(100);
        // Get recent comments
        const comments = await this.db('comments')
            .where('user_id', userId)
            .whereNull('deleted_at')
            .select('id', this.db.raw("'comment' as type"), 'post_id as content_id', this.db.raw('SUBSTRING(content, 1, 100) as content_preview'), 'created_at')
            .orderBy('created_at', 'desc')
            .limit(100);
        // Get recent likes
        const likes = await this.db('likes')
            .where('user_id', userId)
            .select('id', this.db.raw("'like' as type"), 'likeable_id as content_id', this.db.raw('NULL as content_preview'), 'created_at')
            .orderBy('created_at', 'desc')
            .limit(100);
        // Combine, sort by created_at desc, and take top 100
        const allActivity = [...posts, ...comments, ...likes]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 100);
        return allActivity;
    }
    /**
     * Get reports filed against a user's content.
     */
    async getReportsForUser(userId) {
        // Get content IDs owned by the user
        const postIds = await this.db('posts')
            .where('user_id', userId)
            .select('id');
        const commentIds = await this.db('comments')
            .where('user_id', userId)
            .select('id');
        const contentIds = [
            ...postIds.map((p) => ({ id: p.id, type: 'post' })),
            ...commentIds.map((c) => ({ id: c.id, type: 'comment' })),
        ];
        if (contentIds.length === 0) {
            // Also check for direct user reports
            return this.db('reports')
                .where('content_id', userId)
                .where('content_type', 'user')
                .orderBy('created_at', 'desc');
        }
        return this.db('reports')
            .where(function () {
            // Reports against user's posts
            this.where(function () {
                this.whereIn('content_id', postIds.map((p) => p.id)).where('content_type', 'post');
            })
                // Reports against user's comments
                .orWhere(function () {
                this.whereIn('content_id', commentIds.map((c) => c.id)).where('content_type', 'comment');
            })
                // Direct user reports
                .orWhere(function () {
                this.where('content_id', userId).where('content_type', 'user');
            });
        })
            .orderBy('created_at', 'desc');
    }
    /**
     * Suspend a user by setting deleted_at (soft-delete approach for suspension).
     * We use a dedicated approach: set role to 'user' and locked_until to far future.
     */
    async suspendUser(userId) {
        await this.db('users')
            .where('id', userId)
            .update({
            locked_until: new Date('2099-12-31T23:59:59Z'),
        });
    }
    /**
     * Lift suspension by clearing locked_until.
     */
    async liftSuspension(userId) {
        await this.db('users')
            .where('id', userId)
            .update({
            locked_until: null,
        });
    }
    /**
     * Soft-delete content by ID and type.
     */
    async removeContent(contentId, contentType) {
        const table = this.getTableForContentType(contentType);
        if (table) {
            await this.db(table)
                .where('id', contentId)
                .update({ deleted_at: this.db.fn.now() });
        }
    }
    /**
     * Get the database table name for a content type.
     */
    getTableForContentType(contentType) {
        switch (contentType) {
            case 'post':
                return 'posts';
            case 'reel':
                return 'reels';
            case 'comment':
                return 'comments';
            case 'story':
                return 'stories';
            case 'message':
                return 'messages';
            case 'user':
                return null; // User suspension is handled separately
            default:
                return null;
        }
    }
    /**
     * Get the underlying Knex instance.
     */
    getDb() {
        return this.db;
    }
}
exports.AdminRepository = AdminRepository;
//# sourceMappingURL=admin.repository.js.map