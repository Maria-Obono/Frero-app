/**
 * Unit tests for FeedService.
 *
 * Tests cover:
 * - Requirement 9.1: Ranked feed by engagement score, recency, and user interest signals
 * - Requirement 9.2: Include posts from followed users, friends, and trending content
 * - Requirement 9.3: Exclude posts from blocked users and previously delivered posts
 * - Requirement 9.4: Cursor-based pagination (20 per page, max 500 per session)
 * - Requirement 9.5: Boost posts from recently-interacted authors (last 30 days)
 * - Requirement 9.7: Fallback to chronological feed on failure
 * - Requirement 9.8: Empty feed with message if no content available
 */

import { FeedService } from '../../../src/services/feed/feed.service';
import { FeedRepository } from '../../../src/services/feed/feed.repository';
import {
  FeedPost,
  FeedServiceError,
  UserInterestSignal,
  FEED_PAGE_SIZE,
  FEED_MAX_POSTS_PER_SESSION,
  RECENT_INTERACTION_BOOST,
} from '../../../src/services/feed/types';

// Mock the database connection
jest.mock('../../../src/database/connection', () => ({
  getDatabase: jest.fn(),
}));

// Mock redis-utils
jest.mock('../../../src/utils/redis-utils', () => ({
  cacheFeed: jest.fn(),
  getCachedFeed: jest.fn(),
  invalidateFeed: jest.fn(),
}));

describe('FeedService', () => {
  let service: FeedService;
  let mockRepository: jest.Mocked<FeedRepository>;
  let mockCacheGet: jest.Mock;
  let mockCacheSet: jest.Mock;
  let mockCacheInvalidate: jest.Mock;

  const now = new Date('2024-01-15T12:00:00Z');

  function createPost(overrides: Partial<FeedPost> = {}): FeedPost {
    return {
      id: 1,
      user_id: 10,
      type: 'text' as any,
      content: 'Test post',
      privacy: 'public' as any,
      like_count: 5,
      comment_count: 2,
      share_count: 1,
      deleted_at: null,
      created_at: new Date('2024-01-14T12:00:00Z'),
      updated_at: new Date('2024-01-14T12:00:00Z'),
      ...overrides,
    };
  }

  function createInterestSignal(overrides: Partial<UserInterestSignal> = {}): UserInterestSignal {
    return {
      id: 1,
      user_id: 1,
      target_user_id: 10,
      interaction_type: 'like',
      weight: 3,
      last_interaction_at: new Date('2024-01-10T12:00:00Z'),
      created_at: new Date('2024-01-01T00:00:00Z'),
      updated_at: new Date('2024-01-10T12:00:00Z'),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(now);

    mockRepository = {
      getFollowedUserIds: jest.fn().mockResolvedValue([]),
      getFriendIds: jest.fn().mockResolvedValue([]),
      getBlockedUserIds: jest.fn().mockResolvedValue([]),
      getPostsFromAuthors: jest.fn().mockResolvedValue([]),
      getTrendingPosts: jest.fn().mockResolvedValue([]),
      getUserInterestSignals: jest.fn().mockResolvedValue([]),
      getChronologicalFeed: jest.fn().mockResolvedValue([]),
      getDb: jest.fn().mockReturnValue(jest.fn()),
    } as unknown as jest.Mocked<FeedRepository>;

    mockCacheGet = jest.fn().mockResolvedValue(null);
    mockCacheSet = jest.fn().mockResolvedValue(undefined);
    mockCacheInvalidate = jest.fn().mockResolvedValue(undefined);

    service = new FeedService({
      repository: mockRepository,
      cacheGet: mockCacheGet,
      cacheSet: mockCacheSet,
      cacheInvalidate: mockCacheInvalidate,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getPersonalizedFeed()', () => {
    it('should throw error when userId is invalid', async () => {
      await expect(service.getPersonalizedFeed(0)).rejects.toThrow(FeedServiceError);
      await expect(service.getPersonalizedFeed(-1)).rejects.toThrow(FeedServiceError);
    });

    it('should return empty feed with message when user has no network and no trending (Req 9.8)', async () => {
      mockRepository.getFollowedUserIds.mockResolvedValue([]);
      mockRepository.getFriendIds.mockResolvedValue([]);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);
      mockRepository.getTrendingPosts.mockResolvedValue([]);

      const result = await service.getPersonalizedFeed(1);

      expect(result.data).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
      expect(result.message).toBeDefined();
      expect(result.message).toContain('No content available');
    });

    it('should include posts from followed users (Req 9.2)', async () => {
      const posts = [createPost({ id: 1, user_id: 10 }), createPost({ id: 2, user_id: 20 })];

      mockRepository.getFollowedUserIds.mockResolvedValue([10, 20]);
      mockRepository.getFriendIds.mockResolvedValue([]);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);
      mockRepository.getPostsFromAuthors.mockResolvedValue(posts);
      mockRepository.getTrendingPosts.mockResolvedValue([]);
      mockRepository.getUserInterestSignals.mockResolvedValue([]);

      const result = await service.getPersonalizedFeed(1);

      expect(result.data).toHaveLength(2);
      expect(mockRepository.getFollowedUserIds).toHaveBeenCalledWith(1);
    });

    it('should include posts from friends (Req 9.2)', async () => {
      const posts = [createPost({ id: 1, user_id: 30 })];

      mockRepository.getFollowedUserIds.mockResolvedValue([]);
      mockRepository.getFriendIds.mockResolvedValue([30]);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);
      mockRepository.getPostsFromAuthors.mockResolvedValue(posts);
      mockRepository.getTrendingPosts.mockResolvedValue([]);
      mockRepository.getUserInterestSignals.mockResolvedValue([]);

      const result = await service.getPersonalizedFeed(1);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.user_id).toBe(30);
    });

    it('should exclude posts from blocked users (Req 9.3)', async () => {
      mockRepository.getFollowedUserIds.mockResolvedValue([10, 20, 30]);
      mockRepository.getFriendIds.mockResolvedValue([]);
      mockRepository.getBlockedUserIds.mockResolvedValue([20]);
      mockRepository.getPostsFromAuthors.mockResolvedValue([
        createPost({ id: 1, user_id: 10 }),
        createPost({ id: 3, user_id: 30 }),
      ]);
      mockRepository.getTrendingPosts.mockResolvedValue([]);
      mockRepository.getUserInterestSignals.mockResolvedValue([]);

      await service.getPersonalizedFeed(1);

      // The blocked user (20) should be filtered from the network IDs
      expect(mockRepository.getPostsFromAuthors).toHaveBeenCalledWith(
        expect.not.arrayContaining([20]),
        expect.any(Date),
        expect.any(Array),
        expect.any(Number),
      );
    });

    it('should include trending content in the feed (Req 9.2, 9.6)', async () => {
      const networkPost = createPost({ id: 1, user_id: 10 });
      const trendingPost = createPost({
        id: 2,
        user_id: 99,
        like_count: 100,
        comment_count: 50,
        share_count: 30,
      });

      mockRepository.getFollowedUserIds.mockResolvedValue([10]);
      mockRepository.getFriendIds.mockResolvedValue([]);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);
      mockRepository.getPostsFromAuthors.mockResolvedValue([networkPost]);
      mockRepository.getTrendingPosts.mockResolvedValue([trendingPost]);
      mockRepository.getUserInterestSignals.mockResolvedValue([]);

      const result = await service.getPersonalizedFeed(1);

      expect(result.data).toHaveLength(2);
      // Trending post should be ranked higher due to engagement
      expect(result.data[0]!.id).toBe(2);
    });

    it('should return paginated results with 20 per page (Req 9.4)', async () => {
      const posts = Array.from({ length: 30 }, (_, i) =>
        createPost({ id: i + 1, user_id: 10, like_count: 30 - i }),
      );

      mockRepository.getFollowedUserIds.mockResolvedValue([10]);
      mockRepository.getFriendIds.mockResolvedValue([]);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);
      mockRepository.getPostsFromAuthors.mockResolvedValue(posts);
      mockRepository.getTrendingPosts.mockResolvedValue([]);
      mockRepository.getUserInterestSignals.mockResolvedValue([]);

      const result = await service.getPersonalizedFeed(1);

      expect(result.data).toHaveLength(FEED_PAGE_SIZE);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).not.toBeNull();
    });

    it('should enforce max 500 posts per session (Req 9.4)', async () => {
      const result = await service.getPersonalizedFeed(1, String(FEED_MAX_POSTS_PER_SESSION));

      expect(result.data).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.message).toContain('end of your feed');
    });

    it('should use cursor for pagination', async () => {
      const posts = Array.from({ length: 25 }, (_, i) =>
        createPost({ id: i + 1, user_id: 10, like_count: 25 - i }),
      );

      // First call: cache the feed
      mockRepository.getFollowedUserIds.mockResolvedValue([10]);
      mockRepository.getFriendIds.mockResolvedValue([]);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);
      mockRepository.getPostsFromAuthors.mockResolvedValue(posts);
      mockRepository.getTrendingPosts.mockResolvedValue([]);
      mockRepository.getUserInterestSignals.mockResolvedValue([]);

      const firstPage = await service.getPersonalizedFeed(1);
      expect(firstPage.data).toHaveLength(20);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.cursor).toBe('20');

      // Second call: use cached feed with cursor
      const cachedIds = posts.map((p) => String(p.id));
      mockCacheGet.mockResolvedValue(cachedIds);

      // Mock the DB call for fetching posts by IDs
      const mockDbQuery = jest.fn().mockReturnValue({
        whereIn: jest.fn().mockReturnValue({
          whereNull: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue(posts.slice(20, 25)),
          }),
        }),
      });
      mockRepository.getDb = jest.fn().mockReturnValue(mockDbQuery);

      const secondPage = await service.getPersonalizedFeed(1, '20');
      expect(secondPage.data).toHaveLength(5);
      expect(secondPage.hasMore).toBe(false);
    });

    it('should cache feed results in Redis', async () => {
      const posts = [createPost({ id: 1, user_id: 10 })];

      mockRepository.getFollowedUserIds.mockResolvedValue([10]);
      mockRepository.getFriendIds.mockResolvedValue([]);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);
      mockRepository.getPostsFromAuthors.mockResolvedValue(posts);
      mockRepository.getTrendingPosts.mockResolvedValue([]);
      mockRepository.getUserInterestSignals.mockResolvedValue([]);

      await service.getPersonalizedFeed(1);

      expect(mockCacheSet).toHaveBeenCalledWith('1', ['1']);
    });

    it('should use cached feed when available', async () => {
      const cachedIds = ['5', '3', '1'];
      mockCacheGet.mockResolvedValue(cachedIds);

      const cachedPosts = [
        createPost({ id: 5 }),
        createPost({ id: 3 }),
        createPost({ id: 1 }),
      ];

      const mockDbQuery = jest.fn().mockReturnValue({
        whereIn: jest.fn().mockReturnValue({
          whereNull: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue(cachedPosts),
          }),
        }),
      });
      mockRepository.getDb = jest.fn().mockReturnValue(mockDbQuery);

      const result = await service.getPersonalizedFeed(1);

      expect(result.data).toHaveLength(3);
      // Should not call repository methods for network/posts
      expect(mockRepository.getFollowedUserIds).not.toHaveBeenCalled();
    });

    it('should fallback to chronological feed on failure (Req 9.7)', async () => {
      const chronoPosts = [
        createPost({ id: 3, created_at: new Date('2024-01-15T10:00:00Z') }),
        createPost({ id: 2, created_at: new Date('2024-01-14T10:00:00Z') }),
        createPost({ id: 1, created_at: new Date('2024-01-13T10:00:00Z') }),
      ];

      // Make the personalized feed generation fail
      mockCacheGet.mockRejectedValue(new Error('Redis connection failed'));
      mockRepository.getFollowedUserIds.mockResolvedValue([10]);
      mockRepository.getFriendIds.mockResolvedValue([]);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);
      mockRepository.getChronologicalFeed.mockResolvedValue(chronoPosts);

      const result = await service.getPersonalizedFeed(1);

      expect(result.data).toHaveLength(3);
      expect(mockRepository.getChronologicalFeed).toHaveBeenCalled();
    });

    it('should return empty feed when both personalized and fallback fail (Req 9.7, 9.8)', async () => {
      mockCacheGet.mockRejectedValue(new Error('Redis failed'));
      mockRepository.getFollowedUserIds.mockRejectedValue(new Error('DB failed'));

      const result = await service.getPersonalizedFeed(1);

      expect(result.data).toHaveLength(0);
      expect(result.message).toBeDefined();
      expect(result.message).toContain('Unable to load feed');
    });

    it('should deduplicate posts from network and trending', async () => {
      const sharedPost = createPost({ id: 1, user_id: 10, like_count: 50 });

      mockRepository.getFollowedUserIds.mockResolvedValue([10]);
      mockRepository.getFriendIds.mockResolvedValue([]);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);
      mockRepository.getPostsFromAuthors.mockResolvedValue([sharedPost]);
      mockRepository.getTrendingPosts.mockResolvedValue([sharedPost]); // Same post appears in trending
      mockRepository.getUserInterestSignals.mockResolvedValue([]);

      const result = await service.getPersonalizedFeed(1);

      expect(result.data).toHaveLength(1);
    });
  });

  describe('rankPosts()', () => {
    it('should rank posts with higher engagement higher (Req 9.1)', () => {
      const lowEngagement = createPost({ id: 1, like_count: 1, comment_count: 0, share_count: 0 });
      const highEngagement = createPost({ id: 2, like_count: 50, comment_count: 20, share_count: 10 });

      const ranked = service.rankPosts([lowEngagement, highEngagement], []);

      expect(ranked[0]!.id).toBe(2);
      expect(ranked[1]!.id).toBe(1);
    });

    it('should rank newer posts higher when engagement is similar (Req 9.1)', () => {
      const olderPost = createPost({
        id: 1,
        like_count: 5,
        created_at: new Date('2024-01-10T12:00:00Z'),
      });
      const newerPost = createPost({
        id: 2,
        like_count: 5,
        created_at: new Date('2024-01-15T11:00:00Z'),
      });

      const ranked = service.rankPosts([olderPost, newerPost], []);

      expect(ranked[0]!.id).toBe(2);
    });

    it('should boost posts from recently-interacted authors (Req 9.5)', () => {
      const regularPost = createPost({
        id: 1,
        user_id: 10,
        like_count: 10,
        comment_count: 5,
        share_count: 2,
        created_at: new Date('2024-01-14T12:00:00Z'),
      });
      const boostedPost = createPost({
        id: 2,
        user_id: 20,
        like_count: 10,
        comment_count: 5,
        share_count: 2,
        created_at: new Date('2024-01-14T12:00:00Z'),
      });

      const signals: UserInterestSignal[] = [
        createInterestSignal({
          target_user_id: 20,
          weight: 5,
          last_interaction_at: new Date('2024-01-12T12:00:00Z'),
        }),
      ];

      const ranked = service.rankPosts([regularPost, boostedPost], signals);

      // The boosted post (user 20) should rank higher
      expect(ranked[0]!.id).toBe(2);
      expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score!);
    });

    it('should not boost posts from authors with old interactions (> 30 days)', () => {
      const post1 = createPost({
        id: 1,
        user_id: 10,
        like_count: 10,
        created_at: new Date('2024-01-14T12:00:00Z'),
      });
      const post2 = createPost({
        id: 2,
        user_id: 20,
        like_count: 10,
        created_at: new Date('2024-01-14T12:00:00Z'),
      });

      const signals: UserInterestSignal[] = [
        createInterestSignal({
          target_user_id: 20,
          weight: 5,
          // More than 30 days ago
          last_interaction_at: new Date('2023-12-01T12:00:00Z'),
        }),
      ];

      const ranked = service.rankPosts([post1, post2], signals);

      // Both should have similar scores (no boost applied)
      expect(ranked[0]!.score).toBeCloseTo(ranked[1]!.score!, 5);
    });

    it('should return empty array for empty input', () => {
      const ranked = service.rankPosts([], []);
      expect(ranked).toHaveLength(0);
    });

    it('should assign scores to all posts', () => {
      const posts = [
        createPost({ id: 1, like_count: 5 }),
        createPost({ id: 2, like_count: 10 }),
        createPost({ id: 3, like_count: 15 }),
      ];

      const ranked = service.rankPosts(posts, []);

      for (const post of ranked) {
        expect(post.score).toBeDefined();
        expect(post.score).toBeGreaterThan(0);
      }
    });

    it('should apply RECENT_INTERACTION_BOOST multiplier correctly', () => {
      const post = createPost({
        id: 1,
        user_id: 10,
        like_count: 10,
        comment_count: 5,
        share_count: 2,
        created_at: new Date('2024-01-14T12:00:00Z'),
      });

      const withoutBoost = service.rankPosts([post], []);
      const withBoost = service.rankPosts(
        [post],
        [createInterestSignal({ target_user_id: 10, last_interaction_at: new Date('2024-01-12T12:00:00Z') })],
      );

      expect(withBoost[0]!.score).toBeCloseTo(
        withoutBoost[0]!.score! * RECENT_INTERACTION_BOOST,
        5,
      );
    });
  });

  describe('pagination edge cases', () => {
    it('should handle cursor at exact page boundary', async () => {
      const posts = Array.from({ length: 40 }, (_, i) =>
        createPost({ id: i + 1, user_id: 10, like_count: 40 - i }),
      );

      mockRepository.getFollowedUserIds.mockResolvedValue([10]);
      mockRepository.getFriendIds.mockResolvedValue([]);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);
      mockRepository.getPostsFromAuthors.mockResolvedValue(posts);
      mockRepository.getTrendingPosts.mockResolvedValue([]);
      mockRepository.getUserInterestSignals.mockResolvedValue([]);

      const result = await service.getPersonalizedFeed(1);

      expect(result.data).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('20');
    });

    it('should handle invalid cursor gracefully by falling back', async () => {
      mockRepository.getFollowedUserIds.mockResolvedValue([]);
      mockRepository.getFriendIds.mockResolvedValue([]);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);
      mockRepository.getChronologicalFeed.mockResolvedValue([]);

      // Invalid cursor triggers fallback rather than throwing to the caller
      const result = await service.getPersonalizedFeed(1, 'invalid');
      expect(result.data).toHaveLength(0);
    });

    it('should return empty page when cursor exceeds available posts', async () => {
      const cachedIds = ['1', '2', '3'];
      mockCacheGet.mockResolvedValue(cachedIds);

      const result = await service.getPersonalizedFeed(1, '10');

      expect(result.data).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('network deduplication', () => {
    it('should deduplicate users who are both followed and friends', async () => {
      // User 10 is both followed and a friend
      mockRepository.getFollowedUserIds.mockResolvedValue([10, 20]);
      mockRepository.getFriendIds.mockResolvedValue([10, 30]);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);
      mockRepository.getPostsFromAuthors.mockResolvedValue([]);
      mockRepository.getTrendingPosts.mockResolvedValue([]);
      mockRepository.getUserInterestSignals.mockResolvedValue([]);

      await service.getPersonalizedFeed(1);

      // Should pass deduplicated list [10, 20, 30] (not [10, 20, 10, 30])
      const calledWith = mockRepository.getPostsFromAuthors.mock.calls[0]![0];
      expect(calledWith).toHaveLength(3);
      expect(new Set(calledWith).size).toBe(3);
    });
  });
});
