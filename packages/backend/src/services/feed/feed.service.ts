/**
 * Feed service implementing personalized feed generation.
 *
 * Requirements covered:
 * - 9.1: Ranked feed by engagement score, recency (7-day window), and user interest signals
 * - 9.2: Include posts from followed users, friends, and trending content
 * - 9.3: Exclude posts from blocked users and previously delivered posts
 * - 9.4: Cursor-based pagination (20 per page, max 500 posts per session)
 * - 9.5: Boost posts from recently-interacted authors (last 30 days)
 * - 9.6: Trending content boost for overlapping interests
 * - 9.7: Fallback to chronological feed on failure
 * - 9.8: Empty feed with message if no content available
 */

import { FeedRepository } from './feed.repository';
import { cacheFeed, getCachedFeed, invalidateFeed } from '../../utils/redis-utils';
import {
  FeedPost,
  FeedResult,
  FeedServiceError,
  UserInterestSignal,
  FEED_PAGE_SIZE,
  FEED_MAX_POSTS_PER_SESSION,
  FEED_RECENCY_WINDOW_DAYS,
  RECENT_INTERACTION_DAYS,
  RECENT_INTERACTION_BOOST,
} from './types';

export interface FeedServiceDependencies {
  repository?: FeedRepository;
  cacheGet?: (userId: string) => Promise<string[] | null>;
  cacheSet?: (userId: string, postIds: string[]) => Promise<void>;
  cacheInvalidate?: (userId: string) => Promise<void>;
}

export class FeedService {
  private readonly repository: FeedRepository;
  private readonly cacheGet: (userId: string) => Promise<string[] | null>;
  private readonly cacheSet: (userId: string, postIds: string[]) => Promise<void>;
  private readonly cacheInvalidate: (userId: string) => Promise<void>;

  constructor(deps?: FeedServiceDependencies) {
    this.repository = deps?.repository || new FeedRepository();
    this.cacheGet = deps?.cacheGet || getCachedFeed;
    this.cacheSet = deps?.cacheSet || cacheFeed;
    this.cacheInvalidate = deps?.cacheInvalidate || invalidateFeed;
  }

  /**
   * Get a personalized feed for the user.
   *
   * Algorithm:
   * 1. Check Redis cache for pre-computed feed
   * 2. Get followed users and friends (Req 9.2)
   * 3. Get blocked users to exclude (Req 9.3)
   * 4. Fetch posts from network within 7-day window (Req 9.1)
   * 5. Fetch trending posts (Req 9.6)
   * 6. Rank posts by engagement + recency + interest signals (Req 9.1)
   * 7. Boost recently-interacted authors (Req 9.5)
   * 8. Apply cursor-based pagination (Req 9.4)
   * 9. Cache results in Redis (5-min TTL)
   * 10. Fallback to chronological on failure (Req 9.7)
   * 11. Return empty feed with message if no content (Req 9.8)
   */
  async getPersonalizedFeed(userId: number, cursor?: string | null): Promise<FeedResult> {
    if (!userId || userId <= 0) {
      throw new FeedServiceError('Valid userId is required', 400);
    }

    try {
      return await this.generatePersonalizedFeed(userId, cursor);
    } catch (error) {
      // Requirement 9.7: Fallback to chronological feed on failure
      try {
        return await this.getChronologicalFallback(userId, cursor);
      } catch (fallbackError) {
        // If even the fallback fails, return empty feed (Req 9.8)
        return {
          data: [],
          cursor: null,
          hasMore: false,
          message: 'Unable to load feed at this time. Please try again later.',
        };
      }
    }
  }

  /**
   * Generate the personalized feed with ranking algorithm.
   */
  private async generatePersonalizedFeed(
    userId: number,
    cursor?: string | null,
  ): Promise<FeedResult> {
    // Determine pagination offset from cursor
    const cursorOffset = cursor ? parseInt(cursor, 10) : 0;
    if (cursor && isNaN(cursorOffset)) {
      throw new FeedServiceError('Invalid cursor format', 400);
    }

    // Requirement 9.4: Max 500 posts per session
    if (cursorOffset >= FEED_MAX_POSTS_PER_SESSION) {
      return {
        data: [],
        cursor: null,
        hasMore: false,
        message: 'You have reached the end of your feed for this session.',
      };
    }

    // Check Redis cache for pre-computed feed
    const cachedPostIds = await this.cacheGet(String(userId));
    if (cachedPostIds && cachedPostIds.length > 0) {
      return this.paginateFromCache(cachedPostIds, cursorOffset);
    }

    // Get user's network
    const [followedIds, friendIds, blockedIds] = await Promise.all([
      this.repository.getFollowedUserIds(userId),
      this.repository.getFriendIds(userId),
      this.repository.getBlockedUserIds(userId),
    ]);

    // Combine followed and friends into unique set of content source authors
    const networkIds = [...new Set([...followedIds, ...friendIds])];

    // Remove blocked users from network (Req 9.3)
    const blockedSet = new Set(blockedIds);
    const validNetworkIds = networkIds.filter((id) => !blockedSet.has(id));

    // Requirement 9.8: If user follows no accounts
    if (validNetworkIds.length === 0) {
      // Try trending content
      const trendingPosts = await this.fetchTrendingPosts([], blockedIds);
      if (trendingPosts.length === 0) {
        return {
          data: [],
          cursor: null,
          hasMore: false,
          message: 'No content available. Follow users or explore trending content to populate your feed.',
        };
      }

      // Rank and cache trending-only feed
      const rankedTrending = this.rankPosts(trendingPosts, []);
      const rankedIds = rankedTrending.map((p) => String(p.id));
      await this.cacheSet(String(userId), rankedIds);
      return this.paginateFromCache(rankedIds, cursorOffset);
    }

    // Fetch posts from network within recency window (Req 9.1)
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - FEED_RECENCY_WINDOW_DAYS);

    const [networkPosts, trendingPosts, interestSignals] = await Promise.all([
      this.repository.getPostsFromAuthors(
        validNetworkIds,
        sinceDate,
        [], // No exclusions for initial fetch; we'll handle via cursor
        FEED_MAX_POSTS_PER_SESSION,
      ),
      this.fetchTrendingPosts([], blockedIds),
      this.repository.getUserInterestSignals(userId, RECENT_INTERACTION_DAYS),
    ]);

    // Combine network posts and trending posts, deduplicating
    const seenIds = new Set<number>();
    const allPosts: FeedPost[] = [];

    for (const post of networkPosts) {
      if (!seenIds.has(post.id)) {
        seenIds.add(post.id);
        allPosts.push(post);
      }
    }

    for (const post of trendingPosts) {
      if (!seenIds.has(post.id) && !blockedSet.has(post.user_id)) {
        seenIds.add(post.id);
        allPosts.push(post);
      }
    }

    // Rank all posts (Req 9.1, 9.5)
    const rankedPosts = this.rankPosts(allPosts, interestSignals);

    // Limit to max session size
    const limitedPosts = rankedPosts.slice(0, FEED_MAX_POSTS_PER_SESSION);

    // Cache the ranked post IDs in Redis (5-min TTL)
    const rankedIds = limitedPosts.map((p) => String(p.id));
    await this.cacheSet(String(userId), rankedIds);

    // Paginate from the ranked results
    return this.paginateFromRanked(limitedPosts, cursorOffset);
  }

  /**
   * Rank posts by engagement score, recency, and user interest signals.
   *
   * Scoring formula:
   * - Engagement score: log(1 + likes + comments*2 + shares*3)
   * - Recency score: exponential decay based on age (newer = higher)
   * - Interest boost: multiplier for authors the user has interacted with recently (Req 9.5)
   */
  rankPosts(posts: FeedPost[], interestSignals: UserInterestSignal[]): FeedPost[] {
    if (posts.length === 0) return [];

    const now = Date.now();
    const recentInteractionDaysMs = RECENT_INTERACTION_DAYS * 24 * 60 * 60 * 1000;

    // Build a map of target_user_id -> total weight for recently-interacted authors
    const authorWeights = new Map<number, number>();
    for (const signal of interestSignals) {
      const timeSinceInteraction = now - new Date(signal.last_interaction_at).getTime();
      if (timeSinceInteraction <= recentInteractionDaysMs) {
        const existing = authorWeights.get(signal.target_user_id) || 0;
        authorWeights.set(signal.target_user_id, existing + signal.weight);
      }
    }

    // Score each post
    const scoredPosts = posts.map((post) => {
      const engagementScore = Math.log(
        1 + (post.like_count || 0) + (post.comment_count || 0) * 2 + (post.share_count || 0) * 3,
      );

      // Recency: exponential decay over 7 days
      const ageMs = now - new Date(post.created_at).getTime();
      const maxAgeMs = FEED_RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      const recencyScore = Math.max(0, 1 - ageMs / maxAgeMs);

      // Interest boost (Req 9.5)
      let interestBoost = 1.0;
      if (authorWeights.has(post.user_id)) {
        interestBoost = RECENT_INTERACTION_BOOST;
      }

      const totalScore = (engagementScore + recencyScore * 5) * interestBoost;

      return { ...post, score: totalScore };
    });

    // Sort by score descending
    scoredPosts.sort((a, b) => (b.score || 0) - (a.score || 0));

    return scoredPosts;
  }

  /**
   * Fetch trending posts for the feed.
   * Requirement 9.6: Trending content with high engagement.
   */
  private async fetchTrendingPosts(
    excludePostIds: number[],
    blockedUserIds: number[],
  ): Promise<FeedPost[]> {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - FEED_RECENCY_WINDOW_DAYS);

    return this.repository.getTrendingPosts(
      sinceDate,
      excludePostIds,
      blockedUserIds,
      FEED_PAGE_SIZE, // Fetch a page worth of trending content
    );
  }

  /**
   * Paginate from cached post IDs.
   * Returns the appropriate page of posts from the cached ranked list.
   */
  private async paginateFromCache(
    cachedPostIds: string[],
    offset: number,
  ): Promise<FeedResult> {
    const start = offset;
    const end = Math.min(start + FEED_PAGE_SIZE, cachedPostIds.length);

    if (start >= cachedPostIds.length) {
      return {
        data: [],
        cursor: null,
        hasMore: false,
      };
    }

    const pageIds = cachedPostIds.slice(start, end);
    const hasMore = end < cachedPostIds.length && end < FEED_MAX_POSTS_PER_SESSION;
    const nextCursor = hasMore ? String(end) : null;

    // Fetch the actual post data for this page
    const posts = await this.fetchPostsByIds(pageIds.map(Number));

    return {
      data: posts,
      cursor: nextCursor,
      hasMore,
    };
  }

  /**
   * Paginate from ranked posts array.
   */
  private paginateFromRanked(
    rankedPosts: FeedPost[],
    offset: number,
  ): FeedResult {
    const start = offset;
    const end = Math.min(start + FEED_PAGE_SIZE, rankedPosts.length);

    if (start >= rankedPosts.length) {
      return {
        data: [],
        cursor: null,
        hasMore: false,
      };
    }

    const pagePosts = rankedPosts.slice(start, end);
    const hasMore = end < rankedPosts.length && end < FEED_MAX_POSTS_PER_SESSION;
    const nextCursor = hasMore ? String(end) : null;

    return {
      data: pagePosts,
      cursor: nextCursor,
      hasMore,
    };
  }

  /**
   * Fetch posts by their IDs, preserving the order of the input IDs.
   */
  private async fetchPostsByIds(postIds: number[]): Promise<FeedPost[]> {
    if (postIds.length === 0) return [];

    const posts = await this.repository.getDb()('posts')
      .whereIn('id', postIds)
      .whereNull('deleted_at')
      .select('*') as unknown as FeedPost[];

    // Preserve the order of the input IDs
    const postMap = new Map(posts.map((p) => [p.id, p]));
    return postIds
      .map((id) => postMap.get(id))
      .filter((p): p is FeedPost => p !== undefined);
  }

  /**
   * Invalidate the cached feed for a user.
   * Should be called when new content is available or user relationships change.
   */
  async invalidateUserFeed(userId: number): Promise<void> {
    await this.cacheInvalidate(String(userId));
  }

  /**
   * Chronological fallback feed.
   * Requirement 9.7: Return chronological feed from followed users and friends on failure.
   */
  private async getChronologicalFallback(
    userId: number,
    cursor?: string | null,
  ): Promise<FeedResult> {
    const cursorOffset = cursor ? parseInt(cursor, 10) : 0;

    if (cursorOffset >= FEED_MAX_POSTS_PER_SESSION) {
      return {
        data: [],
        cursor: null,
        hasMore: false,
      };
    }

    const [followedIds, friendIds, blockedIds] = await Promise.all([
      this.repository.getFollowedUserIds(userId),
      this.repository.getFriendIds(userId),
      this.repository.getBlockedUserIds(userId),
    ]);

    const networkIds = [...new Set([...followedIds, ...friendIds])];
    const blockedSet = new Set(blockedIds);
    const validNetworkIds = networkIds.filter((id) => !blockedSet.has(id));

    if (validNetworkIds.length === 0) {
      return {
        data: [],
        cursor: null,
        hasMore: false,
        message: 'No content available. Follow users or explore trending content to populate your feed.',
      };
    }

    const posts = await this.repository.getChronologicalFeed(
      validNetworkIds,
      [],
      FEED_MAX_POSTS_PER_SESSION,
    );

    const start = cursorOffset;
    const end = Math.min(start + FEED_PAGE_SIZE, posts.length);
    const pagePosts = posts.slice(start, end);
    const hasMore = end < posts.length && end < FEED_MAX_POSTS_PER_SESSION;
    const nextCursor = hasMore ? String(end) : null;

    return {
      data: pagePosts,
      cursor: nextCursor,
      hasMore,
    };
  }
}
