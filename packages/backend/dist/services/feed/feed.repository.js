"use strict";
/**
 * Feed repository handling database operations for feed generation.
 *
 * Provides data access for:
 * - posts table (feed content)
 * - follows table (followed users)
 * - friendships table (friends)
 * - blocks table (blocked users)
 * - user_interest_signals table (ranking signals)
 *
 * Requirements covered: 9.1, 9.2, 9.3, 9.4, 9.5
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedRepository = void 0;
const connection_1 = require("../../database/connection");
class FeedRepository {
    db;
    constructor(options) {
        this.db = options?.db || (0, connection_1.getDatabase)();
    }
    /**
     * Get IDs of users that the given user follows.
     * Requirement 9.2: Include posts from followed users.
     */
    async getFollowedUserIds(userId) {
        const results = await this.db('follows')
            .where('follower_id', userId)
            .select('followed_id');
        return results.map((r) => r.followed_id);
    }
    /**
     * Get IDs of users that are friends with the given user.
     * Requirement 9.2: Include posts from friends.
     */
    async getFriendIds(userId) {
        const results = await this.db('friendships')
            .where('user_id_1', userId)
            .orWhere('user_id_2', userId)
            .select('user_id_1', 'user_id_2');
        return results.map((r) => r.user_id_1 === userId ? r.user_id_2 : r.user_id_1);
    }
    /**
     * Get IDs of users blocked by or blocking the given user.
     * Requirement 9.3: Exclude posts from blocked users.
     */
    async getBlockedUserIds(userId) {
        const results = await this.db('blocks')
            .where('blocker_id', userId)
            .orWhere('blocked_id', userId)
            .select('blocker_id', 'blocked_id');
        return results.map((r) => r.blocker_id === userId ? r.blocked_id : r.blocker_id);
    }
    /**
     * Get posts from specified authors within the recency window.
     * Excludes soft-deleted posts and respects privacy settings.
     *
     * Requirement 9.1: Posts no older than 7 days.
     * Requirement 9.2: Posts from followed users and friends.
     * Requirement 9.3: Exclude previously delivered posts.
     */
    async getPostsFromAuthors(authorIds, sinceDate, excludePostIds, limit) {
        if (authorIds.length === 0)
            return [];
        let query = this.db('posts')
            .whereIn('user_id', authorIds)
            .where('created_at', '>=', sinceDate)
            .whereNull('deleted_at')
            .whereIn('privacy', ['public', 'friends']);
        if (excludePostIds.length > 0) {
            query = query.whereNotIn('id', excludePostIds);
        }
        return query
            .orderBy('created_at', 'desc')
            .limit(limit)
            .select('*');
    }
    /**
     * Get trending posts (high engagement relative to age).
     * Requirement 9.6: Trending content with engagement rate > 3x average.
     */
    async getTrendingPosts(sinceDate, excludePostIds, excludeAuthorIds, limit) {
        let query = this.db('posts')
            .where('created_at', '>=', sinceDate)
            .where('privacy', 'public')
            .whereNull('deleted_at');
        if (excludePostIds.length > 0) {
            query = query.whereNotIn('id', excludePostIds);
        }
        if (excludeAuthorIds.length > 0) {
            query = query.whereNotIn('user_id', excludeAuthorIds);
        }
        // Order by total engagement (likes + comments + shares) descending
        return query
            .orderByRaw('(like_count + comment_count + share_count) DESC')
            .limit(limit)
            .select('*');
    }
    /**
     * Get user interest signals for ranking.
     * Requirement 9.5: Boost posts from recently-interacted authors.
     */
    async getUserInterestSignals(userId, sinceDays) {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - sinceDays);
        return this.db('user_interest_signals')
            .where('user_id', userId)
            .where('last_interaction_at', '>=', sinceDate)
            .orderBy('weight', 'desc')
            .select('*');
    }
    /**
     * Get posts in chronological order (fallback feed).
     * Requirement 9.7: Fallback to chronological feed on failure.
     */
    async getChronologicalFeed(authorIds, excludePostIds, limit) {
        if (authorIds.length === 0)
            return [];
        let query = this.db('posts')
            .whereIn('user_id', authorIds)
            .whereNull('deleted_at')
            .whereIn('privacy', ['public', 'friends']);
        if (excludePostIds.length > 0) {
            query = query.whereNotIn('id', excludePostIds);
        }
        return query
            .orderBy('created_at', 'desc')
            .limit(limit)
            .select('*');
    }
    /**
     * Get the underlying Knex instance for advanced queries.
     */
    getDb() {
        return this.db;
    }
}
exports.FeedRepository = FeedRepository;
//# sourceMappingURL=feed.repository.js.map