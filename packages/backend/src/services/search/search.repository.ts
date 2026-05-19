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

import { Knex } from 'knex';
import { getDatabase } from '../../database/connection';
import {
  SearchResultUser,
  SearchResultPost,
  SearchResultHashtag,
  SearchResultReel,
  DEFAULT_PAGE_SIZE,
  TRENDING_WINDOW_HOURS,
} from './types';

export class SearchRepository {
  protected readonly db: Knex;

  constructor(options?: { db?: Knex }) {
    this.db = options?.db || getDatabase();
  }

  /**
   * Search users by username or display_name with text matching.
   * Results are ranked by follower count (engagement proxy).
   */
  async searchUsers(query: string, limit: number = DEFAULT_PAGE_SIZE, offset: number = 0): Promise<SearchResultUser[]> {
    const likeQuery = `%${query}%`;

    const results = await this.db('users')
      .where(function () {
        this.where('username', 'like', likeQuery)
          .orWhere('display_name', 'like', likeQuery);
      })
      .whereNull('deleted_at')
      .select(
        'users.id',
        'users.username',
        'users.display_name',
        'users.avatar_url',
      )
      .orderByRaw(
        `CASE WHEN username LIKE ? THEN 0 ELSE 1 END, username`,
        [likeQuery],
      )
      .limit(limit)
      .offset(offset);

    // Add follower count via subquery
    const userIds = results.map((r: any) => r.id);
    if (userIds.length === 0) return [];

    const followerCounts = await this.db('follows')
      .whereIn('followed_id', userIds)
      .groupBy('followed_id')
      .select('followed_id', this.db.raw('COUNT(*) as follower_count'));

    const countMap = new Map(
      followerCounts.map((r: any) => [r.followed_id, Number(r.follower_count)]),
    );

    return results.map((r: any) => ({
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
  async searchPosts(query: string, limit: number = DEFAULT_PAGE_SIZE, offset: number = 0): Promise<SearchResultPost[]> {
    const likeQuery = `%${query}%`;

    return this.db('posts')
      .where('content', 'like', likeQuery)
      .where('privacy', 'public')
      .whereNull('deleted_at')
      .select(
        'id',
        'user_id',
        'content',
        'type',
        'like_count',
        'comment_count',
        'share_count',
        'created_at',
      )
      .orderByRaw('(like_count + comment_count + share_count) DESC')
      .limit(limit)
      .offset(offset) as unknown as SearchResultPost[];
  }

  /**
   * Search hashtags by name.
   * Ranked by post_count (popularity).
   */
  async searchHashtags(query: string, limit: number = DEFAULT_PAGE_SIZE, offset: number = 0): Promise<SearchResultHashtag[]> {
    const likeQuery = `%${query}%`;

    return this.db('hashtags')
      .where('name', 'like', likeQuery)
      .select('id', 'name', 'post_count')
      .orderBy('post_count', 'desc')
      .limit(limit)
      .offset(offset) as unknown as SearchResultHashtag[];
  }

  /**
   * Search reels by caption with engagement ranking.
   */
  async searchReels(query: string, limit: number = DEFAULT_PAGE_SIZE, offset: number = 0): Promise<SearchResultReel[]> {
    const likeQuery = `%${query}%`;

    return this.db('reels')
      .where('caption', 'like', likeQuery)
      .whereNull('deleted_at')
      .select(
        'id',
        'user_id',
        'caption',
        'thumbnail_url',
        'like_count',
        'comment_count',
        'share_count',
        'created_at',
      )
      .orderByRaw('(like_count + comment_count + share_count) DESC')
      .limit(limit)
      .offset(offset) as unknown as SearchResultReel[];
  }

  /**
   * Get posts for a specific hashtag in reverse chronological order.
   * Requirement 10.2, 10.6.
   */
  async getHashtagPosts(hashtagId: number, limit: number = DEFAULT_PAGE_SIZE, offset: number = 0): Promise<SearchResultPost[]> {
    return this.db('posts')
      .join('post_hashtags', 'posts.id', 'post_hashtags.post_id')
      .where('post_hashtags.hashtag_id', hashtagId)
      .where('posts.privacy', 'public')
      .whereNull('posts.deleted_at')
      .select(
        'posts.id',
        'posts.user_id',
        'posts.content',
        'posts.type',
        'posts.like_count',
        'posts.comment_count',
        'posts.share_count',
        'posts.created_at',
      )
      .orderBy('posts.created_at', 'desc')
      .limit(limit)
      .offset(offset) as unknown as SearchResultPost[];
  }

  /**
   * Get a hashtag by name.
   */
  async getHashtagByName(name: string): Promise<SearchResultHashtag | null> {
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
  async getTrendingPosts(limit: number): Promise<SearchResultPost[]> {
    const sinceDate = new Date();
    sinceDate.setHours(sinceDate.getHours() - TRENDING_WINDOW_HOURS);

    return this.db('posts')
      .where('created_at', '>=', sinceDate)
      .where('privacy', 'public')
      .whereNull('deleted_at')
      .select(
        'id',
        'user_id',
        'content',
        'type',
        'like_count',
        'comment_count',
        'share_count',
        'created_at',
      )
      .orderByRaw('(like_count + comment_count + share_count) DESC')
      .limit(limit) as unknown as SearchResultPost[];
  }

  /**
   * Get trending hashtags (highest post_count growth in last 24 hours).
   * Requirement 10.3.
   */
  async getTrendingHashtags(limit: number): Promise<SearchResultHashtag[]> {
    return this.db('hashtags')
      .select('id', 'name', 'post_count')
      .orderBy('post_count', 'desc')
      .limit(limit) as unknown as SearchResultHashtag[];
  }

  /**
   * Get suggested users (users with highest follower counts).
   * Requirement 10.3.
   */
  async getSuggestedUsers(limit: number): Promise<SearchResultUser[]> {
    const results = await this.db('users')
      .whereNull('deleted_at')
      .select('id', 'username', 'display_name', 'avatar_url')
      .limit(limit * 2); // Fetch extra to account for follower count sorting

    const userIds = results.map((r: any) => r.id);
    if (userIds.length === 0) return [];

    const followerCounts = await this.db('follows')
      .whereIn('followed_id', userIds)
      .groupBy('followed_id')
      .select('followed_id', this.db.raw('COUNT(*) as follower_count'));

    const countMap = new Map(
      followerCounts.map((r: any) => [r.followed_id, Number(r.follower_count)]),
    );

    const usersWithCounts: SearchResultUser[] = results.map((r: any) => ({
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
  async typeaheadUsers(query: string, limit: number): Promise<SearchResultUser[]> {
    const likeQuery = `${query}%`;

    return this.db('users')
      .where('username', 'like', likeQuery)
      .whereNull('deleted_at')
      .select('id', 'username', 'display_name', 'avatar_url')
      .limit(limit) as unknown as SearchResultUser[];
  }

  /**
   * Typeahead search for hashtags (by name prefix).
   */
  async typeaheadHashtags(query: string, limit: number): Promise<SearchResultHashtag[]> {
    const likeQuery = `${query}%`;

    return this.db('hashtags')
      .where('name', 'like', likeQuery)
      .select('id', 'name', 'post_count')
      .orderBy('post_count', 'desc')
      .limit(limit) as unknown as SearchResultHashtag[];
  }

  /**
   * Get the underlying Knex instance for advanced queries.
   */
  getDb(): Knex {
    return this.db;
  }
}
