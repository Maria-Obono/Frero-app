/**
 * Post repository handling database operations for posts, post_media,
 * hashtags, post_hashtags, reels, stories, and story_views tables.
 *
 * Requirements covered: 4.1, 4.4, 4.5, 5.1, 5.2, 5.4, 5.5, 5.6
 */
import { Knex } from 'knex';
import { BaseRepository } from '../../database/base-repository';
import { Post, PostMedia, MediaType, Reel, Story, StoryView, StoryMediaType, Like, LikeableType, Comment, Bookmark } from './types';
export declare class PostRepository extends BaseRepository<Post> {
    constructor(options?: {
        db?: Knex;
    });
    /**
     * Insert a post media record.
     */
    createPostMedia(data: {
        post_id: number;
        url: string;
        type: MediaType;
        order_index: number;
        width?: number | null;
        height?: number | null;
        duration_seconds?: number | null;
    }): Promise<number>;
    /**
     * Get all media for a post, ordered by order_index.
     */
    getPostMedia(postId: number): Promise<PostMedia[]>;
    /**
     * Find or create a hashtag by name. Returns the hashtag ID.
     */
    findOrCreateHashtag(name: string, trx?: Knex.Transaction): Promise<number>;
    /**
     * Link a post to a hashtag.
     */
    createPostHashtag(postId: number, hashtagId: number, trx?: Knex.Transaction): Promise<void>;
    /**
     * Get hashtags for a post.
     */
    getPostHashtags(postId: number): Promise<string[]>;
    /**
     * Get the underlying Knex transaction support.
     */
    transaction<T>(callback: (trx: Knex.Transaction) => Promise<T>): Promise<T>;
    /**
     * Create a reel record.
     */
    createReel(data: {
        user_id: number;
        video_url: string;
        thumbnail_url: string | null;
        duration_seconds: number;
        caption: string | null;
    }): Promise<number>;
    /**
     * Find a reel by ID (excluding soft-deleted).
     */
    findReelById(id: number): Promise<Reel | undefined>;
    /**
     * Create a story record.
     */
    createStory(data: {
        user_id: number;
        media_url: string;
        media_type: StoryMediaType;
        expires_at: Date;
    }): Promise<number>;
    /**
     * Find a story by ID (excluding soft-deleted).
     */
    findStoryById(id: number): Promise<Story | undefined>;
    /**
     * Get active (non-expired) stories for a user.
     * Active stories have expires_at > now and are not soft-deleted.
     *
     * Requirement 5.5: Exclude expired stories from active queries.
     */
    getActiveStories(userId: number, now?: Date): Promise<Story[]>;
    /**
     * Get active stories from multiple users (e.g., followed users).
     *
     * Requirement 5.5: Only return non-expired, non-deleted stories.
     */
    getActiveStoriesForUsers(userIds: number[], now?: Date): Promise<Story[]>;
    /**
     * Record a story view. Uses INSERT IGNORE to prevent duplicates
     * (unique constraint on story_id + viewer_id).
     *
     * Requirement 5.6: Record view and prevent duplicate views.
     */
    recordStoryView(storyId: number, viewerId: number): Promise<boolean>;
    /**
     * Get all viewers for a story.
     *
     * Requirement 5.6: Return viewers list to story creator.
     */
    getStoryViewers(storyId: number): Promise<StoryView[]>;
    /**
     * Get the view count for a story.
     */
    getStoryViewCount(storyId: number): Promise<number>;
    /**
     * Check if a user has already viewed a story.
     */
    hasViewedStory(storyId: number, viewerId: number): Promise<boolean>;
    /**
     * Find a like by user and likeable entity.
     * Requirement 6.1, 6.2: Idempotency check for likes.
     */
    findLike(userId: number, likeableId: number, likeableType: LikeableType): Promise<Like | undefined>;
    /**
     * Create a like record.
     * Requirement 6.1: Create like record.
     */
    createLike(userId: number, likeableId: number, likeableType: LikeableType): Promise<number>;
    /**
     * Remove a like record.
     * Requirement 6.3: Remove like record.
     */
    deleteLike(userId: number, likeableId: number, likeableType: LikeableType): Promise<number>;
    /**
     * Increment the like_count on a post.
     */
    incrementLikeCount(postId: number): Promise<void>;
    /**
     * Decrement the like_count on a post.
     */
    decrementLikeCount(postId: number): Promise<void>;
    /**
     * Create a comment record.
     * Requirement 6.5, 6.7: Create comment with optional parent.
     */
    createComment(data: {
        post_id: number;
        user_id: number;
        parent_comment_id: number | null;
        content: string;
        depth: number;
    }): Promise<number>;
    /**
     * Find a comment by ID (excluding soft-deleted).
     */
    findCommentById(commentId: number): Promise<Comment | undefined>;
    /**
     * Increment the comment_count on a post.
     */
    incrementCommentCount(postId: number): Promise<void>;
    /**
     * Create a share record.
     * Requirement 6.9: Create share record.
     */
    createShare(userId: number, postId: number): Promise<number>;
    /**
     * Increment the share_count on a post.
     */
    incrementShareCount(postId: number): Promise<void>;
    /**
     * Find a bookmark by user and post.
     * Requirement 6.10: Idempotency check for bookmarks.
     */
    findBookmark(userId: number, postId: number): Promise<Bookmark | undefined>;
    /**
     * Create a bookmark record.
     * Requirement 6.10: Save post to bookmarks.
     */
    createBookmark(userId: number, postId: number): Promise<number>;
    /**
     * Remove a bookmark record.
     * Requirement 6.11: Remove post from bookmarks.
     */
    deleteBookmark(userId: number, postId: number): Promise<number>;
}
//# sourceMappingURL=post.repository.d.ts.map