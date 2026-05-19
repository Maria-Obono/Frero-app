/**
 * Post repository handling database operations for posts, post_media,
 * hashtags, post_hashtags, reels, stories, and story_views tables.
 *
 * Requirements covered: 4.1, 4.4, 4.5, 5.1, 5.2, 5.4, 5.5, 5.6
 */

import { Knex } from 'knex';
import { BaseRepository } from '../../database/base-repository';
import { Post, PostMedia, Hashtag, MediaType, Reel, Story, StoryView, StoryMediaType, Like, LikeableType, Comment, Bookmark } from './types';

export class PostRepository extends BaseRepository<Post> {
  constructor(options?: { db?: Knex }) {
    super('posts', { db: options?.db });
  }

  /**
   * Insert a post media record.
   */
  async createPostMedia(data: {
    post_id: number;
    url: string;
    type: MediaType;
    order_index: number;
    width?: number | null;
    height?: number | null;
    duration_seconds?: number | null;
  }): Promise<number> {
    const [id] = await this.db('post_media').insert(data);
    return id as number;
  }

  /**
   * Get all media for a post, ordered by order_index.
   */
  async getPostMedia(postId: number): Promise<PostMedia[]> {
    return this.db('post_media')
      .where('post_id', postId)
      .orderBy('order_index', 'asc') as unknown as PostMedia[];
  }

  /**
   * Find or create a hashtag by name. Returns the hashtag ID.
   */
  async findOrCreateHashtag(name: string, trx?: Knex.Transaction): Promise<number> {
    const queryBuilder = trx || this.db;

    const existing = await queryBuilder('hashtags')
      .where('name', name)
      .first() as Hashtag | undefined;

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
    return id as number;
  }

  /**
   * Link a post to a hashtag.
   */
  async createPostHashtag(postId: number, hashtagId: number, trx?: Knex.Transaction): Promise<void> {
    const queryBuilder = trx || this.db;
    await queryBuilder('post_hashtags').insert({
      post_id: postId,
      hashtag_id: hashtagId,
    });
  }

  /**
   * Get hashtags for a post.
   */
  async getPostHashtags(postId: number): Promise<string[]> {
    const results = await this.db('post_hashtags')
      .join('hashtags', 'post_hashtags.hashtag_id', 'hashtags.id')
      .where('post_hashtags.post_id', postId)
      .select('hashtags.name');
    return results.map((r: { name: string }) => r.name);
  }

  /**
   * Get the underlying Knex transaction support.
   */
  async transaction<T>(callback: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(callback);
  }

  // ============================================================
  // Reel Repository Methods (Requirements 5.1, 5.2, 5.3)
  // ============================================================

  /**
   * Create a reel record.
   */
  async createReel(data: {
    user_id: number;
    video_url: string;
    thumbnail_url: string | null;
    duration_seconds: number;
    caption: string | null;
  }): Promise<number> {
    const [id] = await this.db('reels').insert(data);
    return id as number;
  }

  /**
   * Find a reel by ID (excluding soft-deleted).
   */
  async findReelById(id: number): Promise<Reel | undefined> {
    return this.db('reels')
      .where('id', id)
      .whereNull('deleted_at')
      .first() as unknown as Reel | undefined;
  }

  // ============================================================
  // Story Repository Methods (Requirements 5.4, 5.5, 5.6)
  // ============================================================

  /**
   * Create a story record.
   */
  async createStory(data: {
    user_id: number;
    media_url: string;
    media_type: StoryMediaType;
    expires_at: Date;
  }): Promise<number> {
    const [id] = await this.db('stories').insert(data);
    return id as number;
  }

  /**
   * Find a story by ID (excluding soft-deleted).
   */
  async findStoryById(id: number): Promise<Story | undefined> {
    return this.db('stories')
      .where('id', id)
      .whereNull('deleted_at')
      .first() as unknown as Story | undefined;
  }

  /**
   * Get active (non-expired) stories for a user.
   * Active stories have expires_at > now and are not soft-deleted.
   *
   * Requirement 5.5: Exclude expired stories from active queries.
   */
  async getActiveStories(userId: number, now?: Date): Promise<Story[]> {
    const currentTime = now || new Date();
    return this.db('stories')
      .where('user_id', userId)
      .where('expires_at', '>', currentTime)
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc') as unknown as Story[];
  }

  /**
   * Get active stories from multiple users (e.g., followed users).
   *
   * Requirement 5.5: Only return non-expired, non-deleted stories.
   */
  async getActiveStoriesForUsers(userIds: number[], now?: Date): Promise<Story[]> {
    if (userIds.length === 0) return [];
    const currentTime = now || new Date();
    return this.db('stories')
      .whereIn('user_id', userIds)
      .where('expires_at', '>', currentTime)
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc') as unknown as Story[];
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
  async recordStoryView(storyId: number, viewerId: number): Promise<boolean> {
    try {
      await this.db('story_views').insert({
        story_id: storyId,
        viewer_id: viewerId,
      });
      return true;
    } catch (error: any) {
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
  async getStoryViewers(storyId: number): Promise<StoryView[]> {
    return this.db('story_views')
      .where('story_id', storyId)
      .orderBy('created_at', 'desc') as unknown as StoryView[];
  }

  /**
   * Get the view count for a story.
   */
  async getStoryViewCount(storyId: number): Promise<number> {
    const result = await this.db('story_views')
      .where('story_id', storyId)
      .count('* as count')
      .first();
    return Number(result?.count || 0);
  }

  /**
   * Check if a user has already viewed a story.
   */
  async hasViewedStory(storyId: number, viewerId: number): Promise<boolean> {
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
  async findLike(userId: number, likeableId: number, likeableType: LikeableType): Promise<Like | undefined> {
    return this.db('likes')
      .where({ user_id: userId, likeable_id: likeableId, likeable_type: likeableType })
      .first() as Promise<Like | undefined>;
  }

  /**
   * Create a like record.
   * Requirement 6.1: Create like record.
   */
  async createLike(userId: number, likeableId: number, likeableType: LikeableType): Promise<number> {
    const [id] = await this.db('likes').insert({
      user_id: userId,
      likeable_id: likeableId,
      likeable_type: likeableType,
    });
    return id as number;
  }

  /**
   * Remove a like record.
   * Requirement 6.3: Remove like record.
   */
  async deleteLike(userId: number, likeableId: number, likeableType: LikeableType): Promise<number> {
    return this.db('likes')
      .where({ user_id: userId, likeable_id: likeableId, likeable_type: likeableType })
      .delete();
  }

  /**
   * Increment the like_count on a post.
   */
  async incrementLikeCount(postId: number): Promise<void> {
    await this.db('posts').where('id', postId).increment('like_count', 1);
  }

  /**
   * Decrement the like_count on a post.
   */
  async decrementLikeCount(postId: number): Promise<void> {
    await this.db('posts').where('id', postId).decrement('like_count', 1);
  }

  /**
   * Create a comment record.
   * Requirement 6.5, 6.7: Create comment with optional parent.
   */
  async createComment(data: {
    post_id: number;
    user_id: number;
    parent_comment_id: number | null;
    content: string;
    depth: number;
  }): Promise<number> {
    const [id] = await this.db('comments').insert(data);
    return id as number;
  }

  /**
   * Find a comment by ID (excluding soft-deleted).
   */
  async findCommentById(commentId: number): Promise<Comment | undefined> {
    return this.db('comments')
      .where('id', commentId)
      .whereNull('deleted_at')
      .first() as Promise<Comment | undefined>;
  }

  /**
   * Increment the comment_count on a post.
   */
  async incrementCommentCount(postId: number): Promise<void> {
    await this.db('posts').where('id', postId).increment('comment_count', 1);
  }

  /**
   * Create a share record.
   * Requirement 6.9: Create share record.
   */
  async createShare(userId: number, postId: number): Promise<number> {
    const [id] = await this.db('shares').insert({
      user_id: userId,
      post_id: postId,
    });
    return id as number;
  }

  /**
   * Increment the share_count on a post.
   */
  async incrementShareCount(postId: number): Promise<void> {
    await this.db('posts').where('id', postId).increment('share_count', 1);
  }

  /**
   * Find a bookmark by user and post.
   * Requirement 6.10: Idempotency check for bookmarks.
   */
  async findBookmark(userId: number, postId: number): Promise<Bookmark | undefined> {
    return this.db('bookmarks')
      .where({ user_id: userId, post_id: postId })
      .first() as Promise<Bookmark | undefined>;
  }

  /**
   * Create a bookmark record.
   * Requirement 6.10: Save post to bookmarks.
   */
  async createBookmark(userId: number, postId: number): Promise<number> {
    const [id] = await this.db('bookmarks').insert({
      user_id: userId,
      post_id: postId,
    });
    return id as number;
  }

  /**
   * Remove a bookmark record.
   * Requirement 6.11: Remove post from bookmarks.
   */
  async deleteBookmark(userId: number, postId: number): Promise<number> {
    return this.db('bookmarks')
      .where({ user_id: userId, post_id: postId })
      .delete();
  }
}
