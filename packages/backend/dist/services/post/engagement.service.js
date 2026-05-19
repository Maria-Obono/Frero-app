"use strict";
/**
 * Engagement service handling likes, comments, shares, and bookmarks.
 *
 * Requirements covered:
 * - 6.1: Like a post with notification to post owner
 * - 6.2: Reject duplicate likes (idempotency)
 * - 6.3: Unlike a post
 * - 6.4: Reject unlike when no existing like
 * - 6.5: Comment on a post (1-2000 chars) with notification
 * - 6.6: Reject invalid comment length
 * - 6.7: Reply to comment with nesting (max depth 3)
 * - 6.8: Reject reply beyond max depth
 * - 6.9: Share a post with count increment and notification
 * - 6.10: Bookmark a post (reject if already bookmarked)
 * - 6.11: Remove a bookmark
 * - 6.12: Reject actions on non-existent/deleted posts
 * - 6.13: Return engagement counts with post retrieval
 * - 6.14: Engagement counts with 5-second eventual consistency (Redis caching)
 * - 6.15: Suppress self-engagement notifications
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngagementService = void 0;
const post_repository_1 = require("./post.repository");
const types_1 = require("./types");
class EngagementService {
    repository;
    redisCache;
    notificationTrigger;
    constructor(options) {
        this.repository = options?.repository || new post_repository_1.PostRepository();
        this.redisCache = options?.redisCache || null;
        this.notificationTrigger = options?.notificationTrigger || null;
    }
    /**
     * Like a post.
     *
     * Requirement 6.1: Create like record and notify post owner within 30 seconds.
     * Requirement 6.2: Reject if already liked (idempotency guard).
     * Requirement 6.12: Reject if post doesn't exist or is deleted.
     * Requirement 6.15: Suppress notification if user is the post owner.
     */
    async likePost(postId, userId) {
        // Check post exists and is not deleted
        const post = await this.getPostOrThrow(postId);
        // Check if already liked (idempotency guard)
        const existingLike = await this.repository.findLike(userId, postId, types_1.LikeableType.POST);
        if (existingLike) {
            throw new types_1.PostServiceError('Post is already liked', 409, { postId, userId });
        }
        // Create like record
        await this.repository.createLike(userId, postId, types_1.LikeableType.POST);
        // Increment like count on post
        await this.repository.incrementLikeCount(postId);
        // Invalidate engagement cache
        await this.invalidateEngagementCache(postId);
        // Notify post owner (suppress self-engagement - Requirement 6.15)
        if (this.notificationTrigger && post.user_id !== userId) {
            try {
                await this.notificationTrigger.notifyLike(postId, post.user_id, userId);
            }
            catch {
                // Don't fail the like action if notification fails
            }
        }
    }
    /**
     * Unlike a post.
     *
     * Requirement 6.3: Remove like record.
     * Requirement 6.4: Reject if not liked.
     * Requirement 6.12: Reject if post doesn't exist or is deleted.
     */
    async unlikePost(postId, userId) {
        // Check post exists and is not deleted
        await this.getPostOrThrow(postId);
        // Check if like exists
        const existingLike = await this.repository.findLike(userId, postId, types_1.LikeableType.POST);
        if (!existingLike) {
            throw new types_1.PostServiceError('No existing like found for this post', 404, { postId, userId });
        }
        // Remove like record
        await this.repository.deleteLike(userId, postId, types_1.LikeableType.POST);
        // Decrement like count on post
        await this.repository.decrementLikeCount(postId);
        // Invalidate engagement cache
        await this.invalidateEngagementCache(postId);
    }
    /**
     * Comment on a post.
     *
     * Requirement 6.5: Create comment (1-2000 chars) and notify post owner.
     * Requirement 6.6: Reject invalid comment length.
     * Requirement 6.12: Reject if post doesn't exist or is deleted.
     * Requirement 6.15: Suppress notification if user is the post owner.
     */
    async commentOnPost(postId, userId, data) {
        // Check post exists and is not deleted
        const post = await this.getPostOrThrow(postId);
        // Validate comment content length
        this.validateCommentContent(data.content);
        // Create comment at depth 0 (top-level)
        const commentId = await this.repository.createComment({
            post_id: postId,
            user_id: userId,
            parent_comment_id: null,
            content: data.content,
            depth: 0,
        });
        // Increment comment count on post
        await this.repository.incrementCommentCount(postId);
        // Invalidate engagement cache
        await this.invalidateEngagementCache(postId);
        // Notify post owner (suppress self-engagement - Requirement 6.15)
        if (this.notificationTrigger && post.user_id !== userId) {
            try {
                await this.notificationTrigger.notifyComment(postId, post.user_id, userId, commentId);
            }
            catch {
                // Don't fail the comment action if notification fails
            }
        }
        const comment = await this.repository.findCommentById(commentId);
        return comment;
    }
    /**
     * Reply to a comment.
     *
     * Requirement 6.7: Create nested reply up to max depth 3.
     * Requirement 6.8: Reject if max depth exceeded.
     * Requirement 6.12: Reject if post doesn't exist or is deleted.
     * Requirement 6.15: Suppress notification if user is the parent comment author.
     */
    async replyToComment(commentId, userId, data) {
        // Validate comment content length
        this.validateCommentContent(data.content);
        // Find parent comment
        const parentComment = await this.repository.findCommentById(commentId);
        if (!parentComment) {
            throw new types_1.PostServiceError('Parent comment not found', 404, { commentId });
        }
        // Check post exists and is not deleted
        await this.getPostOrThrow(parentComment.post_id);
        // Check depth limit (Requirement 6.8)
        const newDepth = parentComment.depth + 1;
        if (newDepth > types_1.MAX_COMMENT_DEPTH) {
            throw new types_1.PostServiceError(`Maximum comment nesting depth of ${types_1.MAX_COMMENT_DEPTH} has been reached`, 400, { maxDepth: types_1.MAX_COMMENT_DEPTH, attemptedDepth: newDepth });
        }
        // Create reply
        const replyId = await this.repository.createComment({
            post_id: parentComment.post_id,
            user_id: userId,
            parent_comment_id: commentId,
            content: data.content,
            depth: newDepth,
        });
        // Increment comment count on post
        await this.repository.incrementCommentCount(parentComment.post_id);
        // Invalidate engagement cache
        await this.invalidateEngagementCache(parentComment.post_id);
        // Notify parent comment author (suppress self-engagement - Requirement 6.15)
        if (this.notificationTrigger && parentComment.user_id !== userId) {
            try {
                await this.notificationTrigger.notifyReply(commentId, parentComment.user_id, userId, replyId);
            }
            catch {
                // Don't fail the reply action if notification fails
            }
        }
        const reply = await this.repository.findCommentById(replyId);
        return reply;
    }
    /**
     * Share a post.
     *
     * Requirement 6.9: Create share record, increment share count, notify post owner.
     * Requirement 6.12: Reject if post doesn't exist or is deleted.
     * Requirement 6.15: Suppress notification if user is the post owner.
     */
    async sharePost(postId, userId) {
        // Check post exists and is not deleted
        const post = await this.getPostOrThrow(postId);
        // Create share record
        await this.repository.createShare(userId, postId);
        // Increment share count on post
        await this.repository.incrementShareCount(postId);
        // Invalidate engagement cache
        await this.invalidateEngagementCache(postId);
        // Notify post owner (suppress self-engagement - Requirement 6.15)
        if (this.notificationTrigger && post.user_id !== userId) {
            try {
                await this.notificationTrigger.notifyShare(postId, post.user_id, userId);
            }
            catch {
                // Don't fail the share action if notification fails
            }
        }
    }
    /**
     * Bookmark a post.
     *
     * Requirement 6.10: Save post to bookmarks, reject if already bookmarked.
     * Requirement 6.12: Reject if post doesn't exist or is deleted.
     */
    async bookmarkPost(postId, userId) {
        // Check post exists and is not deleted
        await this.getPostOrThrow(postId);
        // Check if already bookmarked
        const existingBookmark = await this.repository.findBookmark(userId, postId);
        if (existingBookmark) {
            throw new types_1.PostServiceError('Post is already bookmarked', 409, { postId, userId });
        }
        // Create bookmark record
        await this.repository.createBookmark(userId, postId);
    }
    /**
     * Remove a bookmark.
     *
     * Requirement 6.11: Remove post from bookmarks.
     */
    async removeBookmark(postId, userId) {
        // Check if bookmark exists
        const existingBookmark = await this.repository.findBookmark(userId, postId);
        if (!existingBookmark) {
            throw new types_1.PostServiceError('Bookmark not found', 404, { postId, userId });
        }
        // Remove bookmark record
        await this.repository.deleteBookmark(userId, postId);
    }
    /**
     * Get engagement counts for a post with Redis caching.
     *
     * Requirement 6.13: Return engagement counts (likes, comments, shares).
     * Requirement 6.14: 5-second eventual consistency via Redis cache.
     */
    async getEngagementCounts(postId) {
        // Try Redis cache first
        if (this.redisCache) {
            const cached = await this.redisCache.get(`engagement:${postId}`);
            if (cached) {
                return JSON.parse(cached);
            }
        }
        // Fetch from database
        const post = await this.repository.findById(postId);
        if (!post) {
            throw new types_1.PostServiceError('Post not found', 404, { postId });
        }
        const counts = {
            likes: post.like_count,
            comments: post.comment_count,
            shares: post.share_count,
        };
        // Cache in Redis with 5-second TTL
        if (this.redisCache) {
            try {
                await this.redisCache.setex(`engagement:${postId}`, types_1.ENGAGEMENT_CACHE_TTL, JSON.stringify(counts));
            }
            catch {
                // Don't fail if cache write fails
            }
        }
        return counts;
    }
    /**
     * Validate comment content length.
     *
     * Requirement 6.6: Reject empty or >2000 char comments.
     */
    validateCommentContent(content) {
        if (!content || content.length < types_1.MIN_COMMENT_LENGTH) {
            throw new types_1.PostServiceError('Comment must be at least 1 character', 400, { field: 'content', min: types_1.MIN_COMMENT_LENGTH, max: types_1.MAX_COMMENT_LENGTH });
        }
        if (content.length > types_1.MAX_COMMENT_LENGTH) {
            throw new types_1.PostServiceError(`Comment must not exceed ${types_1.MAX_COMMENT_LENGTH} characters`, 400, { field: 'content', length: content.length, max: types_1.MAX_COMMENT_LENGTH });
        }
    }
    /**
     * Get a post or throw if not found/deleted.
     *
     * Requirement 6.12: Reject actions on non-existent/deleted posts.
     */
    async getPostOrThrow(postId) {
        const post = await this.repository.findById(postId);
        if (!post) {
            throw new types_1.PostServiceError('Post not found or has been deleted', 404, { postId });
        }
        return post;
    }
    /**
     * Invalidate the engagement counts cache for a post.
     */
    async invalidateEngagementCache(postId) {
        if (this.redisCache) {
            try {
                await this.redisCache.del(`engagement:${postId}`);
            }
            catch {
                // Don't fail if cache invalidation fails
            }
        }
    }
}
exports.EngagementService = EngagementService;
//# sourceMappingURL=engagement.service.js.map