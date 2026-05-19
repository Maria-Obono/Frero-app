/**
 * Search service implementing search and discovery functionality.
 *
 * Requirements covered:
 * - 10.1: Text search with engagement ranking (1-100 chars, 20 results/page)
 * - 10.2: Hashtag search in reverse chronological order, paginated
 * - 10.3: Explore page with trending posts, hashtags, and suggested users
 * - 10.4: Typeahead suggestions (2+ chars, 8 results, within 200ms)
 * - 10.5: Content type filtering (users, posts, hashtags, reels)
 * - 10.6: Hashtag page with post count and recent posts
 * - 10.7: Empty state with suggestions when no results found
 */

import { SearchRepository } from './search.repository';
import { getTrendingPosts, getTrendingHashtags, updateTrendingPosts, updateTrendingHashtags } from '../../utils/redis-utils';
import {
  SearchFilters,
  SearchResult,
  SearchResultItem,
  TypeaheadSuggestion,
  TrendingContent,
  HashtagPageResult,
  SearchServiceError,
  SearchContentType,
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
  DEFAULT_PAGE_SIZE,
  MIN_TYPEAHEAD_LENGTH,
  MAX_TYPEAHEAD_RESULTS,
  TRENDING_POSTS_COUNT,
  TRENDING_HASHTAGS_COUNT,
  SUGGESTED_USERS_COUNT,
} from './types';

export interface SearchServiceDependencies {
  repository?: SearchRepository;
  getTrendingPostIds?: (limit: number) => Promise<string[]>;
  getTrendingHashtagIds?: (limit: number) => Promise<string[]>;
  updateTrendingPostIds?: (posts: Array<{ id: string; score: number }>) => Promise<void>;
  updateTrendingHashtagIds?: (hashtags: Array<{ id: string; score: number }>) => Promise<void>;
}

export class SearchService {
  private readonly repository: SearchRepository;
  private readonly getTrendingPostIds: (limit: number) => Promise<string[]>;
  private readonly getTrendingHashtagIds: (limit: number) => Promise<string[]>;
  private readonly updateTrendingPostIds: (posts: Array<{ id: string; score: number }>) => Promise<void>;
  private readonly updateTrendingHashtagIds: (hashtags: Array<{ id: string; score: number }>) => Promise<void>;

  constructor(deps?: SearchServiceDependencies) {
    this.repository = deps?.repository || new SearchRepository();
    this.getTrendingPostIds = deps?.getTrendingPostIds || getTrendingPosts;
    this.getTrendingHashtagIds = deps?.getTrendingHashtagIds || getTrendingHashtags;
    this.updateTrendingPostIds = deps?.updateTrendingPostIds || updateTrendingPosts;
    this.updateTrendingHashtagIds = deps?.updateTrendingHashtagIds || updateTrendingHashtags;
  }

  /**
   * Search across users, posts, hashtags, and reels with text match + engagement ranking.
   *
   * Requirement 10.1: 1-100 char queries, 20 results/page
   * Requirement 10.5: Content type filtering
   * Requirement 10.7: Empty state with suggestions
   */
  async search(
    query: string,
    filters?: SearchFilters,
    cursor?: string | null,
    limit: number = DEFAULT_PAGE_SIZE,
  ): Promise<SearchResult> {
    // Validate query length (Requirement 10.1)
    if (!query || query.length < MIN_QUERY_LENGTH) {
      throw new SearchServiceError(
        `Search query must be at least ${MIN_QUERY_LENGTH} character(s)`,
        400,
      );
    }

    if (query.length > MAX_QUERY_LENGTH) {
      throw new SearchServiceError(
        `Search query must not exceed ${MAX_QUERY_LENGTH} characters`,
        400,
      );
    }

    // Clamp limit to valid range
    const pageSize = Math.min(Math.max(1, limit), DEFAULT_PAGE_SIZE);
    const offset = cursor ? parseInt(cursor, 10) : 0;

    if (cursor && isNaN(offset)) {
      throw new SearchServiceError('Invalid cursor format', 400);
    }

    const trimmedQuery = query.trim();
    const contentType = filters?.type;

    // Requirement 10.5: If a content type filter is applied, return only that type
    if (contentType) {
      return this.searchByType(trimmedQuery, contentType, pageSize, offset);
    }

    // Search across all content types and merge results
    return this.searchAll(trimmedQuery, pageSize, offset);
  }

  /**
   * Search filtered by a specific content type.
   * Requirement 10.5.
   */
  private async searchByType(
    query: string,
    type: SearchContentType,
    limit: number,
    offset: number,
  ): Promise<SearchResult> {
    let items: SearchResultItem[] = [];

    switch (type) {
      case 'users': {
        const users = await this.repository.searchUsers(query, limit + 1, offset);
        const hasMore = users.length > limit;
        const pageUsers = users.slice(0, limit);
        items = pageUsers.map((u) => ({ type: 'user' as const, data: u }));
        return {
          data: items,
          cursor: hasMore ? String(offset + limit) : null,
          hasMore,
        };
      }
      case 'posts': {
        const posts = await this.repository.searchPosts(query, limit + 1, offset);
        const hasMore = posts.length > limit;
        const pagePosts = posts.slice(0, limit);
        items = pagePosts.map((p) => ({ type: 'post' as const, data: p }));
        return {
          data: items,
          cursor: hasMore ? String(offset + limit) : null,
          hasMore,
        };
      }
      case 'hashtags': {
        const hashtags = await this.repository.searchHashtags(query, limit + 1, offset);
        const hasMore = hashtags.length > limit;
        const pageHashtags = hashtags.slice(0, limit);
        items = pageHashtags.map((h) => ({ type: 'hashtag' as const, data: h }));
        return {
          data: items,
          cursor: hasMore ? String(offset + limit) : null,
          hasMore,
        };
      }
      case 'reels': {
        const reels = await this.repository.searchReels(query, limit + 1, offset);
        const hasMore = reels.length > limit;
        const pageReels = reels.slice(0, limit);
        items = pageReels.map((r) => ({ type: 'reel' as const, data: r }));
        return {
          data: items,
          cursor: hasMore ? String(offset + limit) : null,
          hasMore,
        };
      }
      default:
        throw new SearchServiceError(`Invalid content type filter: ${type}`, 400);
    }
  }

  /**
   * Search across all content types and merge results ranked by engagement.
   * Distributes results across types for a balanced result set.
   */
  private async searchAll(query: string, limit: number, offset: number): Promise<SearchResult> {
    // Fetch from all types in parallel
    const perTypeLimit = Math.ceil(limit / 2); // Fetch more per type to allow ranking

    const [users, posts, hashtags, reels] = await Promise.all([
      this.repository.searchUsers(query, perTypeLimit, offset),
      this.repository.searchPosts(query, perTypeLimit, offset),
      this.repository.searchHashtags(query, perTypeLimit, offset),
      this.repository.searchReels(query, perTypeLimit, offset),
    ]);

    // Merge all results into a single ranked list
    const allItems: SearchResultItem[] = [
      ...users.map((u) => ({ type: 'user' as const, data: u })),
      ...posts.map((p) => ({ type: 'post' as const, data: p })),
      ...hashtags.map((h) => ({ type: 'hashtag' as const, data: h })),
      ...reels.map((r) => ({ type: 'reel' as const, data: r })),
    ];

    // Sort by engagement score (higher is better)
    allItems.sort((a, b) => this.getEngagementScore(b) - this.getEngagementScore(a));

    // Paginate the merged results
    const pageItems = allItems.slice(0, limit);
    const hasMore = allItems.length > limit;

    // Requirement 10.7: Empty state
    if (pageItems.length === 0) {
      return {
        data: [],
        cursor: null,
        hasMore: false,
      };
    }

    return {
      data: pageItems,
      cursor: hasMore ? String(offset + limit) : null,
      hasMore,
    };
  }

  /**
   * Get engagement score for a search result item for ranking purposes.
   */
  private getEngagementScore(item: SearchResultItem): number {
    switch (item.type) {
      case 'user':
        return item.data.follower_count || 0;
      case 'post':
        return item.data.like_count + item.data.comment_count + item.data.share_count;
      case 'hashtag':
        return item.data.post_count;
      case 'reel':
        return item.data.like_count + item.data.comment_count + item.data.share_count;
      default:
        return 0;
    }
  }

  /**
   * Typeahead suggestions for search.
   *
   * Requirement 10.4: 2+ chars, 8 results, within 200ms target.
   */
  async typeahead(query: string): Promise<TypeaheadSuggestion[]> {
    if (!query || query.length < MIN_TYPEAHEAD_LENGTH) {
      return [];
    }

    const trimmedQuery = query.trim().toLowerCase();
    if (trimmedQuery.length < MIN_TYPEAHEAD_LENGTH) {
      return [];
    }

    // Fetch users and hashtags in parallel for fast response
    const perTypeLimit = Math.ceil(MAX_TYPEAHEAD_RESULTS / 2);

    const [users, hashtags] = await Promise.all([
      this.repository.typeaheadUsers(trimmedQuery, perTypeLimit),
      this.repository.typeaheadHashtags(trimmedQuery, perTypeLimit),
    ]);

    const suggestions: TypeaheadSuggestion[] = [];

    // Add user suggestions
    for (const user of users) {
      suggestions.push({
        type: 'users',
        id: user.id,
        text: user.username,
        subtitle: user.display_name || undefined,
      });
    }

    // Add hashtag suggestions
    for (const hashtag of hashtags) {
      suggestions.push({
        type: 'hashtags',
        id: hashtag.id,
        text: `#${hashtag.name}`,
        subtitle: `${hashtag.post_count} posts`,
      });
    }

    // Return up to MAX_TYPEAHEAD_RESULTS
    return suggestions.slice(0, MAX_TYPEAHEAD_RESULTS);
  }

  /**
   * Get trending content for the explore page.
   *
   * Requirement 10.3: 10 trending posts, 10 trending hashtags, 10 suggested users.
   * Uses Redis cache with 5-min TTL.
   */
  async getTrending(): Promise<TrendingContent> {
    // Try to get from Redis cache first
    const [cachedPostIds, cachedHashtagIds] = await Promise.all([
      this.getTrendingPostIds(TRENDING_POSTS_COUNT),
      this.getTrendingHashtagIds(TRENDING_HASHTAGS_COUNT),
    ]);

    let posts;
    let hashtags;

    if (cachedPostIds.length > 0) {
      // Fetch post details from DB using cached IDs
      posts = await this.fetchPostsByIds(cachedPostIds.map(Number));
    } else {
      // Compute trending posts from DB and cache them
      posts = await this.repository.getTrendingPosts(TRENDING_POSTS_COUNT);
      if (posts.length > 0) {
        const postScores = posts.map((p, i) => ({
          id: String(p.id),
          score: posts.length - i, // Higher score for higher ranked
        }));
        await this.updateTrendingPostIds(postScores);
      }
    }

    if (cachedHashtagIds.length > 0) {
      // Fetch hashtag details from DB using cached IDs
      hashtags = await this.fetchHashtagsByIds(cachedHashtagIds.map(Number));
    } else {
      // Compute trending hashtags from DB and cache them
      hashtags = await this.repository.getTrendingHashtags(TRENDING_HASHTAGS_COUNT);
      if (hashtags.length > 0) {
        const hashtagScores = hashtags.map((h, i) => ({
          id: String(h.id),
          score: hashtags.length - i,
        }));
        await this.updateTrendingHashtagIds(hashtagScores);
      }
    }

    // Always fetch suggested users fresh (they're personalized)
    const suggestedUsers = await this.repository.getSuggestedUsers(SUGGESTED_USERS_COUNT);

    return {
      posts: posts || [],
      hashtags: hashtags || [],
      suggestedUsers,
    };
  }

  /**
   * Get posts for a specific hashtag page.
   *
   * Requirement 10.2: Reverse chronological order, paginated.
   * Requirement 10.6: Display total post count and recent posts.
   */
  async getHashtagPosts(hashtag: string, cursor?: string | null): Promise<HashtagPageResult> {
    if (!hashtag || hashtag.trim().length === 0) {
      throw new SearchServiceError('Hashtag name is required', 400);
    }

    const normalizedHashtag = hashtag.trim().toLowerCase().replace(/^#/, '');

    // Get the hashtag record
    const hashtagRecord = await this.repository.getHashtagByName(normalizedHashtag);

    if (!hashtagRecord) {
      throw new SearchServiceError(
        `Hashtag #${normalizedHashtag} not found`,
        404,
      );
    }

    const offset = cursor ? parseInt(cursor, 10) : 0;
    if (cursor && isNaN(offset)) {
      throw new SearchServiceError('Invalid cursor format', 400);
    }

    // Fetch posts for this hashtag (Requirement 10.2: reverse chronological)
    const posts = await this.repository.getHashtagPosts(
      hashtagRecord.id,
      DEFAULT_PAGE_SIZE + 1,
      offset,
    );

    const hasMore = posts.length > DEFAULT_PAGE_SIZE;
    const pagePosts = posts.slice(0, DEFAULT_PAGE_SIZE);

    return {
      hashtag: hashtagRecord,
      posts: pagePosts,
      cursor: hasMore ? String(offset + DEFAULT_PAGE_SIZE) : null,
      hasMore,
    };
  }

  /**
   * Fetch posts by their IDs, preserving order.
   */
  private async fetchPostsByIds(postIds: number[]): Promise<any[]> {
    if (postIds.length === 0) return [];

    const posts = await this.repository.getDb()('posts')
      .whereIn('id', postIds)
      .whereNull('deleted_at')
      .where('privacy', 'public')
      .select(
        'id',
        'user_id',
        'content',
        'type',
        'like_count',
        'comment_count',
        'share_count',
        'created_at',
      );

    // Preserve order of input IDs
    const postMap = new Map(posts.map((p: any) => [p.id, p]));
    return postIds
      .map((id) => postMap.get(id))
      .filter((p): p is any => p !== undefined);
  }

  /**
   * Fetch hashtags by their IDs, preserving order.
   */
  private async fetchHashtagsByIds(hashtagIds: number[]): Promise<any[]> {
    if (hashtagIds.length === 0) return [];

    const hashtags = await this.repository.getDb()('hashtags')
      .whereIn('id', hashtagIds)
      .select('id', 'name', 'post_count');

    // Preserve order of input IDs
    const hashtagMap = new Map(hashtags.map((h: any) => [h.id, h]));
    return hashtagIds
      .map((id) => hashtagMap.get(id))
      .filter((h): h is any => h !== undefined);
  }
}
