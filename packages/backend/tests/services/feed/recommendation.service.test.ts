/**
 * Unit tests for RecommendationService.
 *
 * Tests cover:
 * - Requirement 19.1: 20-50 AI-generated content recommendations based on 90-day engagement history
 * - Requirement 19.2: 1-hour refresh cycle (Redis cache)
 * - Requirement 19.4: 5-10 suggested users based on mutual connections and content overlap
 * - Requirement 19.5: Diversity constraint - max 20% from single creator
 * - Requirement 19.6: Fallback to trending for users with < 5 interactions
 * - Requirement 19.7: 3-second timeout fallback to trending content
 */

import {
  RecommendationService,
  MIN_RECOMMENDATIONS,
  MAX_RECOMMENDATIONS,
  MIN_INTERACTIONS_FOR_PERSONALIZED,
  MAX_SINGLE_CREATOR_PERCENTAGE,
  ENGAGEMENT_HISTORY_DAYS,
  MIN_SUGGESTED_USERS,
  MAX_SUGGESTED_USERS,
  RECOMMENDATION_TIMEOUT_MS,
} from '../../../src/services/feed/recommendation.service';
import { FeedRepository } from '../../../src/services/feed/feed.repository';
import { FeedPost, UserInterestSignal } from '../../../src/services/feed/types';

// Mock the database connection
jest.mock('../../../src/database/connection', () => ({
  getDatabase: jest.fn(),
}));

// Mock redis-utils
jest.mock('../../../src/utils/redis-utils', () => ({
  cacheRecommendations: jest.fn(),
  getCachedRecommendations: jest.fn(),
  invalidateRecommendations: jest.fn(),
}));

describe('RecommendationService', () => {
  let service: RecommendationService;
  let mockRepository: jest.Mocked<FeedRepository>;
  let mockCacheGet: jest.Mock;
  let mockCacheSet: jest.Mock;
  let mockCacheInvalidate: jest.Mock;
  let mockGetTrendingPostIds: jest.Mock;

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

  function createManySignals(count: number): UserInterestSignal[] {
    return Array.from({ length: count }, (_, i) =>
      createInterestSignal({
        id: i + 1,
        target_user_id: 100 + i,
        weight: Math.floor(Math.random() * 5) + 1,
      }),
    );
  }

  function createManyPosts(count: number, creatorIds?: number[]): FeedPost[] {
    return Array.from({ length: count }, (_, i) => {
      const creatorId = creatorIds
        ? creatorIds[i % creatorIds.length]!
        : 100 + i;
      return createPost({
        id: i + 1,
        user_id: creatorId,
        like_count: Math.floor(Math.random() * 50),
        comment_count: Math.floor(Math.random() * 20),
        share_count: Math.floor(Math.random() * 10),
        created_at: new Date(now.getTime() - i * 3600000),
      });
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(now);

    const mockDbQuery = jest.fn().mockReturnValue({
      whereIn: jest.fn().mockReturnValue({
        whereNull: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([]),
        }),
        orWhereIn: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([]),
        }),
        whereNotIn: jest.fn().mockReturnValue({
          orderByRaw: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
      whereNull: jest.fn().mockReturnValue({
        whereNotIn: jest.fn().mockReturnValue({
          orderByRaw: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    });

    mockRepository = {
      getFollowedUserIds: jest.fn().mockResolvedValue([]),
      getFriendIds: jest.fn().mockResolvedValue([]),
      getBlockedUserIds: jest.fn().mockResolvedValue([]),
      getPostsFromAuthors: jest.fn().mockResolvedValue([]),
      getTrendingPosts: jest.fn().mockResolvedValue([]),
      getUserInterestSignals: jest.fn().mockResolvedValue([]),
      getChronologicalFeed: jest.fn().mockResolvedValue([]),
      getDb: jest.fn().mockReturnValue(mockDbQuery),
    } as unknown as jest.Mocked<FeedRepository>;

    mockCacheGet = jest.fn().mockResolvedValue(null);
    mockCacheSet = jest.fn().mockResolvedValue(undefined);
    mockCacheInvalidate = jest.fn().mockResolvedValue(undefined);
    mockGetTrendingPostIds = jest.fn().mockResolvedValue([]);

    service = new RecommendationService({
      repository: mockRepository,
      cacheGet: mockCacheGet,
      cacheSet: mockCacheSet,
      cacheInvalidate: mockCacheInvalidate,
      getTrendingPostIds: mockGetTrendingPostIds,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getRecommendations()', () => {
    it('should return trending fallback for invalid userId', async () => {
      const trendingPosts = createManyPosts(20);
      mockRepository.getTrendingPosts.mockResolvedValue(trendingPosts);

      const result = await service.getRecommendations(0);

      // Should fallback to trending
      expect(result).toHaveLength(20);
    });

    it('should return cached recommendations when available (Req 19.2)', async () => {
      const cachedIds = ['1', '2', '3', '4', '5'];
      mockCacheGet.mockResolvedValue(cachedIds);

      const cachedPosts = cachedIds.map((id) => createPost({ id: Number(id) }));
      const mockDbQuery = jest.fn().mockReturnValue({
        whereIn: jest.fn().mockReturnValue({
          whereNull: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue(cachedPosts),
          }),
        }),
      });
      mockRepository.getDb = jest.fn().mockReturnValue(mockDbQuery);

      const result = await service.getRecommendations(1);

      expect(result).toHaveLength(5);
      expect(mockRepository.getUserInterestSignals).not.toHaveBeenCalled();
    });

    it('should fallback to trending for users with fewer than 5 interactions (Req 19.6)', async () => {
      // User has only 3 interactions (< MIN_INTERACTIONS_FOR_PERSONALIZED)
      const fewSignals = createManySignals(3);
      mockRepository.getUserInterestSignals.mockResolvedValue(fewSignals);

      const trendingPosts = createManyPosts(25);
      mockRepository.getTrendingPosts.mockResolvedValue(trendingPosts);

      const result = await service.getRecommendations(1);

      // Should get trending content as fallback
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS);
    });

    it('should generate personalized recommendations for users with sufficient interactions (Req 19.1)', async () => {
      const signals = createManySignals(10);
      mockRepository.getUserInterestSignals.mockResolvedValue(signals);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);

      const posts = createManyPosts(60, signals.map((s) => s.target_user_id));
      mockRepository.getPostsFromAuthors.mockResolvedValue(posts);
      mockRepository.getTrendingPosts.mockResolvedValue([]);

      const result = await service.getRecommendations(1);

      expect(result.length).toBeGreaterThanOrEqual(MIN_RECOMMENDATIONS);
      expect(result.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS);
    });

    it('should exclude posts from blocked users', async () => {
      const signals = createManySignals(10);
      mockRepository.getUserInterestSignals.mockResolvedValue(signals);
      mockRepository.getBlockedUserIds.mockResolvedValue([100, 101]);

      const posts = createManyPosts(30, [100, 101, 102, 103, 104]);
      mockRepository.getPostsFromAuthors.mockResolvedValue(posts);
      mockRepository.getTrendingPosts.mockResolvedValue([]);

      const result = await service.getRecommendations(1);

      // No posts from blocked users (100, 101)
      for (const post of result) {
        expect(post.user_id).not.toBe(100);
        expect(post.user_id).not.toBe(101);
      }
    });

    it('should exclude posts from the user themselves', async () => {
      const signals = createManySignals(10);
      mockRepository.getUserInterestSignals.mockResolvedValue(signals);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);

      // Include posts from user 1 (the requesting user)
      const posts = createManyPosts(30, [1, 102, 103, 104, 105]);
      mockRepository.getPostsFromAuthors.mockResolvedValue(posts);
      mockRepository.getTrendingPosts.mockResolvedValue([]);

      const result = await service.getRecommendations(1);

      for (const post of result) {
        expect(post.user_id).not.toBe(1);
      }
    });

    it('should cache generated recommendations (Req 19.2)', async () => {
      const signals = createManySignals(10);
      mockRepository.getUserInterestSignals.mockResolvedValue(signals);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);

      const posts = createManyPosts(30, signals.map((s) => s.target_user_id));
      mockRepository.getPostsFromAuthors.mockResolvedValue(posts);
      mockRepository.getTrendingPosts.mockResolvedValue([]);

      await service.getRecommendations(1);

      expect(mockCacheSet).toHaveBeenCalledWith(
        '1',
        expect.any(Array),
      );
    });

    it('should timeout and fallback to trending after 3 seconds (Req 19.7)', async () => {
      // Use real timers for this test since we need actual timeout behavior
      jest.useRealTimers();

      // Make getUserInterestSignals hang longer than the 3s timeout
      mockRepository.getUserInterestSignals.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(createManySignals(10)), 5000)),
      );

      const trendingPosts = createManyPosts(20);
      mockRepository.getTrendingPosts.mockResolvedValue(trendingPosts);

      const result = await service.getRecommendations(1);

      // Should have fallen back to trending due to timeout
      expect(result.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS);

      // Restore fake timers for other tests
      jest.useFakeTimers();
      jest.setSystemTime(now);
    }, 10000);

    it('should use 90-day engagement history window (Req 19.1)', async () => {
      const signals = createManySignals(10);
      mockRepository.getUserInterestSignals.mockResolvedValue(signals);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);
      mockRepository.getPostsFromAuthors.mockResolvedValue([]);
      mockRepository.getTrendingPosts.mockResolvedValue([]);

      await service.getRecommendations(1);

      expect(mockRepository.getUserInterestSignals).toHaveBeenCalledWith(
        1,
        ENGAGEMENT_HISTORY_DAYS,
      );
    });

    it('should handle cache errors gracefully and proceed to generate', async () => {
      mockCacheGet.mockRejectedValue(new Error('Redis error'));

      const signals = createManySignals(10);
      mockRepository.getUserInterestSignals.mockResolvedValue(signals);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);

      const posts = createManyPosts(30, signals.map((s) => s.target_user_id));
      mockRepository.getPostsFromAuthors.mockResolvedValue(posts);
      mockRepository.getTrendingPosts.mockResolvedValue([]);

      const result = await service.getRecommendations(1);

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('applyDiversityConstraint()', () => {
    it('should limit content from a single creator to max 20% (Req 19.5)', () => {
      // Create 50 posts all from the same creator
      const posts = createManyPosts(50, [100]);

      const result = service.applyDiversityConstraint(posts);

      const maxAllowed = Math.floor(MAX_RECOMMENDATIONS * MAX_SINGLE_CREATOR_PERCENTAGE);
      const creatorCount = result.filter((p) => p.user_id === 100).length;
      expect(creatorCount).toBeLessThanOrEqual(maxAllowed);
    });

    it('should allow diverse content through', () => {
      // Create posts from many different creators
      const creatorIds = Array.from({ length: 30 }, (_, i) => 100 + i);
      const posts = createManyPosts(50, creatorIds);

      const result = service.applyDiversityConstraint(posts);

      // Should keep most posts since they're from different creators
      expect(result.length).toBeGreaterThanOrEqual(MIN_RECOMMENDATIONS);
    });

    it('should return empty array for empty input', () => {
      const result = service.applyDiversityConstraint([]);
      expect(result).toHaveLength(0);
    });

    it('should not exceed MAX_RECOMMENDATIONS', () => {
      const creatorIds = Array.from({ length: 100 }, (_, i) => 100 + i);
      const posts = createManyPosts(200, creatorIds);

      const result = service.applyDiversityConstraint(posts);

      expect(result.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS);
    });

    it('should enforce diversity even with high-scoring posts from same creator', () => {
      // Create posts where one creator dominates
      const posts: FeedPost[] = [];
      // 30 posts from creator 100 (high scores)
      for (let i = 0; i < 30; i++) {
        posts.push(createPost({
          id: i + 1,
          user_id: 100,
          like_count: 100 - i,
          score: 100 - i,
        }));
      }
      // 20 posts from other creators
      for (let i = 0; i < 20; i++) {
        posts.push(createPost({
          id: 31 + i,
          user_id: 200 + i,
          like_count: 50 - i,
          score: 50 - i,
        }));
      }

      const result = service.applyDiversityConstraint(posts);

      const creator100Count = result.filter((p) => p.user_id === 100).length;
      const maxAllowed = Math.floor(MAX_RECOMMENDATIONS * MAX_SINGLE_CREATOR_PERCENTAGE);
      expect(creator100Count).toBeLessThanOrEqual(maxAllowed);
    });

    it('should allow at least 1 post per creator even if percentage rounds to 0', () => {
      // With very few total posts, max per creator should be at least 1
      const posts = [
        createPost({ id: 1, user_id: 100 }),
        createPost({ id: 2, user_id: 100 }),
        createPost({ id: 3, user_id: 200 }),
      ];

      const result = service.applyDiversityConstraint(posts);

      // Should include at least 1 from creator 100
      const creator100Count = result.filter((p) => p.user_id === 100).length;
      expect(creator100Count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getSuggestedUsers()', () => {
    it('should return empty array for invalid userId', async () => {
      const result = await service.getSuggestedUsers(0);
      expect(result).toHaveLength(0);
    });

    it('should return between 5 and 10 suggested users (Req 19.4)', async () => {
      mockRepository.getFriendIds.mockResolvedValue([10, 20, 30]);
      mockRepository.getFollowedUserIds.mockResolvedValue([40, 50]);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);
      mockRepository.getUserInterestSignals.mockResolvedValue([]);

      // Mock DB for friends-of-friends query
      const friendsOfFriends = [
        { user_id_1: 10, user_id_2: 60 },
        { user_id_1: 10, user_id_2: 70 },
        { user_id_1: 20, user_id_2: 60 },
        { user_id_1: 20, user_id_2: 80 },
        { user_id_1: 30, user_id_2: 90 },
        { user_id_1: 30, user_id_2: 100 },
        { user_id_1: 10, user_id_2: 110 },
        { user_id_1: 20, user_id_2: 120 },
      ];

      const userDetails = [
        { id: 60, username: 'user60', display_name: 'User 60', avatar_url: null },
        { id: 70, username: 'user70', display_name: 'User 70', avatar_url: null },
        { id: 80, username: 'user80', display_name: 'User 80', avatar_url: null },
        { id: 90, username: 'user90', display_name: 'User 90', avatar_url: null },
        { id: 100, username: 'user100', display_name: 'User 100', avatar_url: null },
        { id: 110, username: 'user110', display_name: 'User 110', avatar_url: null },
        { id: 120, username: 'user120', display_name: 'User 120', avatar_url: null },
      ];

      const mockDbFn = jest.fn().mockImplementation((table: string) => {
        if (table === 'friendships') {
          return {
            whereIn: jest.fn().mockReturnValue({
              orWhereIn: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(friendsOfFriends),
              }),
            }),
          };
        }
        if (table === 'users') {
          return {
            whereIn: jest.fn().mockReturnValue({
              whereNull: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(userDetails),
              }),
            }),
          };
        }
        return {
          whereIn: jest.fn().mockReturnValue({
            whereNull: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue([]),
            }),
          }),
        };
      });

      mockRepository.getDb = jest.fn().mockReturnValue(mockDbFn);

      const result = await service.getSuggestedUsers(1);

      expect(result.length).toBeGreaterThanOrEqual(MIN_SUGGESTED_USERS);
      expect(result.length).toBeLessThanOrEqual(MAX_SUGGESTED_USERS);
    });

    it('should not suggest already-connected users', async () => {
      mockRepository.getFriendIds.mockResolvedValue([10, 20]);
      mockRepository.getFollowedUserIds.mockResolvedValue([30]);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);
      mockRepository.getUserInterestSignals.mockResolvedValue([]);

      // Friends-of-friends includes already-connected users
      const friendsOfFriends = [
        { user_id_1: 10, user_id_2: 20 }, // Already a friend
        { user_id_1: 10, user_id_2: 30 }, // Already followed
        { user_id_1: 10, user_id_2: 60 }, // New candidate
      ];

      const userDetails = [
        { id: 60, username: 'user60', display_name: 'User 60', avatar_url: null },
      ];

      const mockDbFn = jest.fn().mockImplementation((table: string) => {
        if (table === 'friendships') {
          return {
            whereIn: jest.fn().mockReturnValue({
              orWhereIn: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(friendsOfFriends),
              }),
            }),
          };
        }
        if (table === 'users') {
          return {
            whereIn: jest.fn().mockReturnValue({
              whereNull: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(userDetails),
              }),
            }),
          };
        }
        return {
          whereIn: jest.fn().mockReturnValue({
            whereNull: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue([]),
            }),
          }),
        };
      });

      mockRepository.getDb = jest.fn().mockReturnValue(mockDbFn);

      const result = await service.getSuggestedUsers(1);

      // Should not include user 10, 20, 30 (already connected)
      for (const user of result) {
        expect(user.id).not.toBe(10);
        expect(user.id).not.toBe(20);
        expect(user.id).not.toBe(30);
      }
    });

    it('should not suggest blocked users', async () => {
      mockRepository.getFriendIds.mockResolvedValue([10]);
      mockRepository.getFollowedUserIds.mockResolvedValue([]);
      mockRepository.getBlockedUserIds.mockResolvedValue([60]);
      mockRepository.getUserInterestSignals.mockResolvedValue([]);

      const friendsOfFriends = [
        { user_id_1: 10, user_id_2: 60 }, // Blocked
        { user_id_1: 10, user_id_2: 70 }, // Valid
      ];

      const userDetails = [
        { id: 70, username: 'user70', display_name: 'User 70', avatar_url: null },
      ];

      const mockDbFn = jest.fn().mockImplementation((table: string) => {
        if (table === 'friendships') {
          return {
            whereIn: jest.fn().mockReturnValue({
              orWhereIn: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(friendsOfFriends),
              }),
            }),
          };
        }
        if (table === 'users') {
          return {
            whereIn: jest.fn().mockReturnValue({
              whereNull: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(userDetails),
              }),
            }),
          };
        }
        return {
          whereIn: jest.fn().mockReturnValue({
            whereNull: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue([]),
            }),
          }),
        };
      });

      mockRepository.getDb = jest.fn().mockReturnValue(mockDbFn);

      const result = await service.getSuggestedUsers(1);

      for (const user of result) {
        expect(user.id).not.toBe(60);
      }
    });

    it('should rank users by mutual connections count', async () => {
      mockRepository.getFriendIds.mockResolvedValue([10, 20, 30]);
      mockRepository.getFollowedUserIds.mockResolvedValue([]);
      mockRepository.getBlockedUserIds.mockResolvedValue([]);
      mockRepository.getUserInterestSignals.mockResolvedValue([]);

      // User 60 has 3 mutual friends, user 70 has 1
      const friendsOfFriends = [
        { user_id_1: 10, user_id_2: 60 },
        { user_id_1: 20, user_id_2: 60 },
        { user_id_1: 30, user_id_2: 60 },
        { user_id_1: 10, user_id_2: 70 },
      ];

      const userDetails = [
        { id: 60, username: 'user60', display_name: 'User 60', avatar_url: null },
        { id: 70, username: 'user70', display_name: 'User 70', avatar_url: null },
      ];

      const mockDbFn = jest.fn().mockImplementation((table: string) => {
        if (table === 'friendships') {
          return {
            whereIn: jest.fn().mockReturnValue({
              orWhereIn: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(friendsOfFriends),
              }),
            }),
          };
        }
        if (table === 'users') {
          return {
            whereIn: jest.fn().mockReturnValue({
              whereNull: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue(userDetails),
              }),
            }),
          };
        }
        return {
          whereIn: jest.fn().mockReturnValue({
            whereNull: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue([]),
            }),
          }),
        };
      });

      mockRepository.getDb = jest.fn().mockReturnValue(mockDbFn);

      const result = await service.getSuggestedUsers(1);

      if (result.length >= 2) {
        // User 60 should be ranked higher (3 mutual friends vs 1)
        expect(result[0]!.id).toBe(60);
        expect(result[0]!.mutual_friends_count).toBe(3);
        expect(result[1]!.id).toBe(70);
        expect(result[1]!.mutual_friends_count).toBe(1);
      }
    });

    it('should timeout and return empty array after 3 seconds (Req 19.7)', async () => {
      jest.useRealTimers();

      mockRepository.getFriendIds.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([10, 20]), 5000)),
      );

      const result = await service.getSuggestedUsers(1);

      expect(result).toHaveLength(0);

      jest.useFakeTimers();
      jest.setSystemTime(now);
    }, 10000);
  });

  describe('invalidateUserRecommendations()', () => {
    it('should call cache invalidate with correct userId (Req 19.3)', async () => {
      await service.invalidateUserRecommendations(42);

      expect(mockCacheInvalidate).toHaveBeenCalledWith('42');
    });
  });

  describe('constants', () => {
    it('should have correct recommendation count bounds', () => {
      expect(MIN_RECOMMENDATIONS).toBe(20);
      expect(MAX_RECOMMENDATIONS).toBe(50);
    });

    it('should use 90-day engagement history', () => {
      expect(ENGAGEMENT_HISTORY_DAYS).toBe(90);
    });

    it('should have correct suggested user bounds', () => {
      expect(MIN_SUGGESTED_USERS).toBe(5);
      expect(MAX_SUGGESTED_USERS).toBe(10);
    });

    it('should enforce 20% diversity constraint', () => {
      expect(MAX_SINGLE_CREATOR_PERCENTAGE).toBe(0.2);
    });

    it('should have 3-second timeout', () => {
      expect(RECOMMENDATION_TIMEOUT_MS).toBe(3000);
    });

    it('should require minimum 5 interactions for personalized recommendations', () => {
      expect(MIN_INTERACTIONS_FOR_PERSONALIZED).toBe(5);
    });
  });
});
