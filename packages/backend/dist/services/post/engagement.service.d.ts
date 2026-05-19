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
import { PostRepository } from './post.repository';
import { Comment, CreateCommentDTO, EngagementCounts } from './types';
/** Interface for notification triggering (decoupled from NotificationService) */
export interface IEngagementNotificationTrigger {
    notifyLike(postId: number, postOwnerId: number, likerId: number): Promise<void>;
    notifyComment(postId: number, postOwnerId: number, commenterId: number, commentId: number): Promise<void>;
    notifyReply(parentCommentId: number, parentCommentAuthorId: number, replierId: number, replyId: number): Promise<void>;
    notifyShare(postId: number, postOwnerId: number, sharerId: number): Promise<void>;
}
/** Interface for Redis cache operations */
export interface IRedisCache {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, mode?: string, ttl?: number): Promise<unknown>;
    setex(key: string, ttl: number, value: string): Promise<unknown>;
    del(key: string): Promise<number>;
}
export interface EngagementServiceOptions {
    repository?: PostRepository;
    redisCache?: IRedisCache | null;
    notificationTrigger?: IEngagementNotificationTrigger | null;
}
export declare class EngagementService {
    private readonly repository;
    private readonly redisCache;
    private readonly notificationTrigger;
    constructor(options?: EngagementServiceOptions);
    /**
     * Like a post.
     *
     * Requirement 6.1: Create like record and notify post owner within 30 seconds.
     * Requirement 6.2: Reject if already liked (idempotency guard).
     * Requirement 6.12: Reject if post doesn't exist or is deleted.
     * Requirement 6.15: Suppress notification if user is the post owner.
     */
    likePost(postId: number, userId: number): Promise<void>;
    /**
     * Unlike a post.
     *
     * Requirement 6.3: Remove like record.
     * Requirement 6.4: Reject if not liked.
     * Requirement 6.12: Reject if post doesn't exist or is deleted.
     */
    unlikePost(postId: number, userId: number): Promise<void>;
    /**
     * Comment on a post.
     *
     * Requirement 6.5: Create comment (1-2000 chars) and notify post owner.
     * Requirement 6.6: Reject invalid comment length.
     * Requirement 6.12: Reject if post doesn't exist or is deleted.
     * Requirement 6.15: Suppress notification if user is the post owner.
     */
    commentOnPost(postId: number, userId: number, data: CreateCommentDTO): Promise<Comment>;
    /**
     * Reply to a comment.
     *
     * Requirement 6.7: Create nested reply up to max depth 3.
     * Requirement 6.8: Reject if max depth exceeded.
     * Requirement 6.12: Reject if post doesn't exist or is deleted.
     * Requirement 6.15: Suppress notification if user is the parent comment author.
     */
    replyToComment(commentId: number, userId: number, data: CreateCommentDTO): Promise<Comment>;
    /**
     * Share a post.
     *
     * Requirement 6.9: Create share record, increment share count, notify post owner.
     * Requirement 6.12: Reject if post doesn't exist or is deleted.
     * Requirement 6.15: Suppress notification if user is the post owner.
     */
    sharePost(postId: number, userId: number): Promise<void>;
    /**
     * Bookmark a post.
     *
     * Requirement 6.10: Save post to bookmarks, reject if already bookmarked.
     * Requirement 6.12: Reject if post doesn't exist or is deleted.
     */
    bookmarkPost(postId: number, userId: number): Promise<void>;
    /**
     * Remove a bookmark.
     *
     * Requirement 6.11: Remove post from bookmarks.
     */
    removeBookmark(postId: number, userId: number): Promise<void>;
    /**
     * Get engagement counts for a post with Redis caching.
     *
     * Requirement 6.13: Return engagement counts (likes, comments, shares).
     * Requirement 6.14: 5-second eventual consistency via Redis cache.
     */
    getEngagementCounts(postId: number): Promise<EngagementCounts>;
    /**
     * Validate comment content length.
     *
     * Requirement 6.6: Reject empty or >2000 char comments.
     */
    private validateCommentContent;
    /**
     * Get a post or throw if not found/deleted.
     *
     * Requirement 6.12: Reject actions on non-existent/deleted posts.
     */
    private getPostOrThrow;
    /**
     * Invalidate the engagement counts cache for a post.
     */
    private invalidateEngagementCache;
}
//# sourceMappingURL=engagement.service.d.ts.map