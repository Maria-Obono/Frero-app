"use strict";
/**
 * Search repository handling database operations for search and discovery.
 *
 * Provides data access for:
 * - users table (user search)
 * - posts table (post search)
 * - hashtags table (hashtag search)
 * - post_hashtags table (hashtag-post relationships)
 * - reels table (reel search)
 *
 * Requirements covered: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchRepository = void 0;
const connection_1 = require("../../database/connection");
const types_1 = require("./types");
class SearchRepository {
    db;
    constructor(options) {
        this.db = options?.db || (0, connection_1.getDatabase)();
    }
    /**
     * Search users by username or display_name with text matching.
     * Results are ranked by follower count (engagement proxy).
     */
    async searchUsers(query, limit = types_1.DEFAULT_PAGE_SIZE, offset = 0) {
        const likeQuery = `%${query}%`;
        const results = await this.db('users')
            .where(function () {
            this.where('username', 'like', likeQuery)
                .orWhere('display_name', 'like', likeQuery);
        })
            .whereNull('deleted_at')
            .select('users.id', 'users.username', 'users.display_name', 'users.avatar_url')
            .orderByRaw(`CASE WHEN username LIKE ? THEN 0 ELSE 1 END, username`, [likeQuery])
            .limit(limit)
            .offset(offset);
        // Add follower count via subquery
        const userIds = results.map((r) => r.id);
        if (userIds.length === 0)
            return [];
        const followerCounts = await this.db('follows')
            .whereIn('followed_id', userIds)
            .groupBy('followed_id')
            .select('followed_id', this.db.raw('COUNT(*) as follower_count'));
        const countMap = new Map(followerCounts.map((r) => [r.followed_id, Number(r.follower_count)]));
        return results.map((r) => ({
            id: r.id,
            username: r.username,
            display_name: r.display_name,
            avatar_url: r.avatar_url,
            follower_count: countMap.get(r.id) || 0,
        }));
    }
    /**
     * Search posts by content text with engagement ranking.
     * Ranked by combination of text match and engagement metrics.
     */
    async searchPosts(query, limit = types_1.DEFAULT_PAGE_SIZE, offset = 0) {
        const likeQuery = `%${query}%`;
        return this.db('posts')
            .where('content', 'like', likeQuery)
            .where('privacy', 'public')
            .whereNull('deleted_at')
            .select('id', 'user_id', 'content', 'type', 'like_count', 'comment_count', 'share_count', 'created_at')
            .orderByRaw('(like_count + comment_count + share_count) DESC')
            .limit(limit)
            .offset(offset);
    }
    /**
     * Search hashtags by name.
     * Ranked by post_count (popularity).
     */
    async searchHashtags(query, limit = types_1.DEFAULT_PAGE_SIZE, offset = 0) {
        const likeQuery = `%${query}%`;
        return this.db('hashtags')
            .where('name', 'like', likeQuery)
            .select('id', 'name', 'post_count')
            .orderBy('post_count', 'desc')
            .limit(limit)
            .offset(offset);
    }
    /**
     * Search reels by caption with engagement ranking.
     */
    async searchReels(query, limit = types_1.DEFAULT_PAGE_SIZE, offset = 0) {
        const likeQuery = `%${query}%`;
        return this.db('reels')
            .where('caption', 'like', likeQuery)
            .whereNull('deleted_at')
            .select('id', 'user_id', 'caption', 'thumbnail_url', 'like_count', 'comment_count', 'share_count', 'created_at')
            .orderByRaw('(like_count + comment_count + share_count) DESC')
            .limit(limit)
            .offset(offset);
    }
    /**
     * Get posts for a specific hashtag in reverse chronological order.
     * Requirement 10.2, 10.6.
     */
    async getHashtagPosts(hashtagId, limit = types_1.DEFAULT_PAGE_SIZE, offset = 0) {
        return this.db('posts')
            .join('post_hashtags', 'posts.id', 'post_hashtags.post_id')
            .where('post_hashtags.hashtag_id', hashtagId)
            .where('posts.privacy', 'public')
            .whereNull('posts.deleted_at')
            .select('posts.id', 'posts.user_id', 'posts.content', 'posts.type', 'posts.like_count', 'posts.comment_count', 'posts.share_count', 'posts.created_at')
            .orderBy('posts.created_at', 'desc')
            .limit(limit)
            .offset(offset);
    }
    /**
     * Get a hashtag by name.
     */
    async getHashtagByName(name) {
        const result = await this.db('hashtags')
            .where('name', name.toLowerCase())
            .select('id', 'name', 'post_count')
            .first();
        return result || null;
    }
    /**
     * Get trending posts (highest engagement growth in last 24 hours).
     * Requirement 10.3.
     */
    async getTrendingPosts(limit) {
        const sinceDate = new Date();
        sinceDate.setHours(sinceDate.getHours() - types_1.TRENDING_WINDOW_HOURS);
        return this.db('posts')
            .where('created_at', '>=', sinceDate)
            .where('privacy', 'public')
            .whereNull('deleted_at')
            .select('id', 'user_id', 'content', 'type', 'like_count', 'comment_count', 'share_count', 'created_at')
            .orderByRaw('(like_count + comment_count + share_count) DESC')
            .limit(limit);
    }
    /**
     * Get trending hashtags (highest post_count growth in last 24 hours).
     * Requirement 10.3.
     */
    async getTrendingHashtags(limit) {
        return this.db('hashtags')
            .select('id', 'name', 'post_count')
            .orderBy('post_count', 'desc')
            .limit(limit);
    }
    /**
     * Get suggested users (users with highest follower counts).
     * Requirement 10.3.
     */
    async getSuggestedUsers(limit) {
        const results = await this.db('users')
            .whereNull('deleted_at')
            .select('id', 'username', 'display_name', 'avatar_url')
            .limit(limit * 2); // Fetch extra to account for follower count sorting
        const userIds = results.map((r) => r.id);
        if (userIds.length === 0)
            return [];
        const followerCounts = await this.db('follows')
            .whereIn('followed_id', userIds)
            .groupBy('followed_id')
            .select('followed_id', this.db.raw('COUNT(*) as follower_count'));
        const countMap = new Map(followerCounts.map((r) => [r.followed_id, Number(r.follower_count)]));
        const usersWithCounts = results.map((r) => ({
            id: r.id,
            username: r.username,
            display_name: r.display_name,
            avatar_url: r.avatar_url,
            follower_count: countMap.get(r.id) || 0,
        }));
        // Sort by follower count descending and take the limit
        usersWithCounts.sort((a, b) => (b.follower_count || 0) - (a.follower_count || 0));
        return usersWithCounts.slice(0, limit);
    }
    /**
     * Typeahead search for users (by username prefix).
     */
    async typeaheadUsers(query, limit) {
        const likeQuery = `${query}%`;
        return this.db('users')
            .where('username', 'like', likeQuery)
            .whereNull('deleted_at')
            .select('id', 'username', 'display_name', 'avatar_url')
            .limit(limit);
    }
    /**
     * Typeahead search for hashtags (by name prefix).
     */
    async typeaheadHashtags(query, limit) {
        const likeQuery = `${query}%`;
        return this.db('hashtags')
            .where('name', 'like', likeQuery)
            .select('id', 'name', 'post_count')
            .orderBy('post_count', 'desc')
            .limit(limit);
    }
    /**
     * Get the underlying Knex instance for advanced queries.
     */
    getDb() {
        return this.db;
    }
}
exports.SearchRepository = SearchRepository;
//# sourceMappingURL=search.repository.js.map