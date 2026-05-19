"use strict";
/**
 * Post repository handling database operations for posts, post_media,
 * hashtags, post_hashtags, reels, stories, and story_views tables.
 *
 * Requirements covered: 4.1, 4.4, 4.5, 5.1, 5.2, 5.4, 5.5, 5.6
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostRepository = void 0;
const base_repository_1 = require("../../database/base-repository");
class PostRepository extends base_repository_1.BaseRepository {
    constructor(options) {
        super('posts', { db: options?.db });
    }
    /**
     * Insert a post media record.
     */
    async createPostMedia(data) {
        const [id] = await this.db('post_media').insert(data);
        return id;
    }
    /**
     * Get all media for a post, ordered by order_index.
     */
    async getPostMedia(postId) {
        return this.db('post_media')
            .where('post_id', postId)
            .orderBy('order_index', 'asc');
    }
    /**
     * Find or create a hashtag by name. Returns the hashtag ID.
     */
    async findOrCreateHashtag(name, trx) {
        const queryBuilder = trx || this.db;
        const existing = await queryBuilder('hashtags')
            .where('name', name)
            .first();
        if (existing) {
            // Increment post_count
            await queryBuilder('hashtags')
                .where('id', existing.id)
                .increment('post_count', 1);
            return existing.id;
        }
        const [id] = await queryBuilder('hashtags').insert({
            name,
            post_count: 1,
        });
        return id;
    }
    /**
     * Link a post to a hashtag.
     */
    async createPostHashtag(postId, hashtagId, trx) {
        const queryBuilder = trx || this.db;
        await queryBuilder('post_hashtags').insert({
            post_id: postId,
            hashtag_id: hashtagId,
        });
    }
    /**
     * Get hashtags for a post.
     */
    async getPostHashtags(postId) {
        const results = await this.db('post_hashtags')
            .join('hashtags', 'post_hashtags.hashtag_id', 'hashtags.id')
            .where('post_hashtags.post_id', postId)
            .select('hashtags.name');
        return results.map((r) => r.name);
    }
    /**
     * Get the underlying Knex transaction support.
     */
    async transaction(callback) {
        return this.db.transaction(callback);
    }
    // ============================================================
    // Reel Repository Methods (Requirements 5.1, 5.2, 5.3)
    // ============================================================
    /**
     * Create a reel record.
     */
    async createReel(data) {
        const [id] = await this.db('reels').insert(data);
        return id;
    }
    /**
     * Find a reel by ID (excluding soft-deleted).
     */
    async findReelById(id) {
        return this.db('reels')
            .where('id', id)
            .whereNull('deleted_at')
            .first();
    }
    // ============================================================
    // Story Repository Methods (Requirements 5.4, 5.5, 5.6)
    // ============================================================
    /**
     * Create a story record.
     */
    async createStory(data) {
        const [id] = await this.db('stories').insert(data);
        return id;
    }
    /**
     * Find a story by ID (excluding soft-deleted).
     */
    async findStoryById(id) {
        return this.db('stories')
            .where('id', id)
            .whereNull('deleted_at')
            .first();
    }
    /**
     * Get active (non-expired) stories for a user.
     * Active stories have expires_at > now and are not soft-deleted.
     *
     * Requirement 5.5: Exclude expired stories from active queries.
     */
    async getActiveStories(userId, now) {
        const currentTime = now || new Date();
        return this.db('stories')
            .where('user_id', userId)
            .where('expires_at', '>', currentTime)
            .whereNull('deleted_at')
            .orderBy('created_at', 'desc');
    }
    /**
     * Get active stories from multiple users (e.g., followed users).
     *
     * Requirement 5.5: Only return non-expired, non-deleted stories.
     */
    async getActiveStoriesForUsers(userIds, now) {
        if (userIds.length === 0)
            return [];
        const currentTime = now || new Date();
        return this.db('stories')
            .whereIn('user_id', userIds)
            .where('expires_at', '>', currentTime)
            .whereNull('deleted_at')
            .orderBy('created_at', 'desc');
    }
    // ============================================================
    // Story View Repository Methods (Requirement 5.6)
    // ============================================================
    /**
     * Record a story view. Uses INSERT IGNORE to prevent duplicates
     * (unique constraint on story_id + viewer_id).
     *
     * Requirement 5.6: Record view and prevent duplicate views.
     */
    async recordStoryView(storyId, viewerId) {
        try {
            await this.db('story_views').insert({
                story_id: storyId,
                viewer_id: viewerId,
            });
            return true;
        }
        catch (error) {
            // Duplicate entry - view already recorded
            if (error.code === 'ER_DUP_ENTRY' || error.message?.includes('UNIQUE constraint')) {
                return false;
            }
            throw error;
        }
    }
    /**
     * Get all viewers for a story.
     *
     * Requirement 5.6: Return viewers list to story creator.
     */
    async getStoryViewers(storyId) {
        return this.db('story_views')
            .where('story_id', storyId)
            .orderBy('created_at', 'desc');
    }
    /**
     * Get the view count for a story.
     */
    async getStoryViewCount(storyId) {
        const result = await this.db('story_views')
            .where('story_id', storyId)
            .count('* as count')
            .first();
        return Number(result?.count || 0);
    }
    /**
     * Check if a user has already viewed a story.
     */
    async hasViewedStory(storyId, viewerId) {
        const view = await this.db('story_views')
            .where('story_id', storyId)
            .where('viewer_id', viewerId)
            .first();
        return !!view;
    }
    // ============================================================
    // Engagement Repository Methods (Requirements 6.1 - 6.15)
    // ============================================================
    /**
     * Find a like by user and likeable entity.
     * Requirement 6.1, 6.2: Idempotency check for likes.
     */
    async findLike(userId, likeableId, likeableType) {
        return this.db('likes')
            .where({ user_id: userId, likeable_id: likeableId, likeable_type: likeableType })
            .first();
    }
    /**
     * Create a like record.
     * Requirement 6.1: Create like record.
     */
    async createLike(userId, likeableId, likeableType) {
        const [id] = await this.db('likes').insert({
            user_id: userId,
            likeable_id: likeableId,
            likeable_type: likeableType,
        });
        return id;
    }
    /**
     * Remove a like record.
     * Requirement 6.3: Remove like record.
     */
    async deleteLike(userId, likeableId, likeableType) {
        return this.db('likes')
            .where({ user_id: userId, likeable_id: likeableId, likeable_type: likeableType })
            .delete();
    }
    /**
     * Increment the like_count on a post.
     */
    async incrementLikeCount(postId) {
        await this.db('posts').where('id', postId).increment('like_count', 1);
    }
    /**
     * Decrement the like_count on a post.
     */
    async decrementLikeCount(postId) {
        await this.db('posts').where('id', postId).decrement('like_count', 1);
    }
    /**
     * Create a comment record.
     * Requirement 6.5, 6.7: Create comment with optional parent.
     */
    async createComment(data) {
        const [id] = await this.db('comments').insert(data);
        return id;
    }
    /**
     * Find a comment by ID (excluding soft-deleted).
     */
    async findCommentById(commentId) {
        return this.db('comments')
            .where('id', commentId)
            .whereNull('deleted_at')
            .first();
    }
    /**
     * Increment the comment_count on a post.
     */
    async incrementCommentCount(postId) {
        await this.db('posts').where('id', postId).increment('comment_count', 1);
    }
    /**
     * Create a share record.
     * Requirement 6.9: Create share record.
     */
    async createShare(userId, postId) {
        const [id] = await this.db('shares').insert({
            user_id: userId,
            post_id: postId,
        });
        return id;
    }
    /**
     * Increment the share_count on a post.
     */
    async incrementShareCount(postId) {
        await this.db('posts').where('id', postId).increment('share_count', 1);
    }
    /**
     * Find a bookmark by user and post.
     * Requirement 6.10: Idempotency check for bookmarks.
     */
    async findBookmark(userId, postId) {
        return this.db('bookmarks')
            .where({ user_id: userId, post_id: postId })
            .first();
    }
    /**
     * Create a bookmark record.
     * Requirement 6.10: Save post to bookmarks.
     */
    async createBookmark(userId, postId) {
        const [id] = await this.db('bookmarks').insert({
            user_id: userId,
            post_id: postId,
        });
        return id;
    }
    /**
     * Remove a bookmark record.
     * Requirement 6.11: Remove post from bookmarks.
     */
    async deleteBookmark(userId, postId) {
        return this.db('bookmarks')
            .where({ user_id: userId, post_id: postId })
            .delete();
    }
}
exports.PostRepository = PostRepository;
//# sourceMappingURL=post.repository.js.map