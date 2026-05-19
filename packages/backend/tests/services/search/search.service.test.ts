/**
 * Unit tests for SearchService.
 *
 * Tests cover:
 * - Requirement 10.1: Text search with engagement ranking (1-100 chars, 20 results/page)
 * - Requirement 10.2: Hashtag search in reverse chronological order, paginated
 * - Requirement 10.3: Explore page with trending posts, hashtags, and suggested users
 * - Requirement 10.4: Typeahead suggestions (2+ chars, 8 results)
 * - Requirement 10.5: Content type filtering (users, posts, hashtags, reels)
 * - Requirement 10.6: Hashtag page with post count and recent posts
 * - Requirement 10.7: Empty state when no results found
 */

import { SearchService } from '../../../src/services/search/search.service';
import { SearchRepository } from '../../../src/services/search/search.repository';
import {
  SearchServiceError,
  SearchResultUser,
  SearchResultPost,
  SearchResultHashtag,
  SearchResultReel,
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
  DEFAULT_PAGE_SIZE,
  MAX_TYPEAHEAD_RESULTS,
  TRENDING_POSTS_COUNT,
  TRENDING_HASHTAGS_COUNT,
  SUGGESTED_USERS_COUNT,
} from '../../../src/services/search/types';

// Mock the database connection
jest.mock('../../../src/database/connection', () => ({
  getDatabase: jest.fn(),
}));

// Mock redis-utils
jest.mock('../../../src/utils/redis-utils', () => ({
  getTrendingPosts: jest.fn(),
  getTrendingHashtags: jest.fn(),
  updateTrendingPosts: jest.fn(),
  updateTrendingHashtags: jest.fn(),
}));

describe('SearchService', () => {
  let service: SearchService;
  let mockRepository: jest.Mocked<SearchRepository>;
  let mockGetTrendingPostIds: jest.Mock;
  let mockGetTrendingHashtagIds: jest.Mock;
  let mockUpdateTrendingPostIds: jest.Mock;
  let mockUpdateTrendingHashtagIds: jest.Mock;

  function createUser(overrides: Partial<SearchResultUser> = {}): SearchResultUser {
    return {
      id: 1,
      username: 'testuser',
      display_name: 'Test User',
      avatar_url: null,
      follower_count: 10,
      ...overrides,
    };
  }

  function createPost(overrides: Partial<SearchResultPost> = {}): SearchResultPost {
    return {
      id: 1,
      user_id: 10,
      content: 'Test post content',
      type: 'text',
      like_count: 5,
      comment_count: 2,
      share_count: 1,
      created_at: new Date('2024-01-14T12:00:00Z'),
      ...overrides,
    };
  }

  function createHashtag(overrides: Partial<SearchResultHashtag> = {}): SearchResultHashtag {
    return {
      id: 1,
      name: 'trending',
      post_count: 100,
      ...overrides,
    };
  }

  function createReel(overrides: Partial<SearchResultReel> = {}): SearchResultReel {
    return {
      id: 1,
      user_id: 10,
      caption: 'Test reel',
      thumbnail_url: null,
      like_count: 20,
      comment_count: 5,
      share_count: 3,
      created_at: new Date('2024-01-14T12:00:00Z'),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();

    mockRepository = {
      searchUsers: jest.fn().mockResolvedValue([]),
      searchPosts: jest.fn().mockResolvedValue([]),
      searchHashtags: jest.fn().mockResolvedValue([]),
      searchReels: jest.fn().mockResolvedValue([]),
      getHashtagPosts: jest.fn().mockResolvedValue([]),
      getHashtagByName: jest.fn().mockResolvedValue(null),
      getTrendingPosts: jest.fn().mockResolvedValue([]),
      getTrendingHashtags: jest.fn().mockResolvedValue([]),
      getSuggestedUsers: jest.fn().mockResolvedValue([]),
      typeaheadUsers: jest.fn().mockResolvedValue([]),
      typeaheadHashtags: jest.fn().mockResolvedValue([]),
      getDb: jest.fn().mockReturnValue(jest.fn()),
    } as unknown as jest.Mocked<SearchRepository>;

    mockGetTrendingPostIds = jest.fn().mockResolvedValue([]);
    mockGetTrendingHashtagIds = jest.fn().mockResolvedValue([]);
    mockUpdateTrendingPostIds = jest.fn().mockResolvedValue(undefined);
    mockUpdateTrendingHashtagIds = jest.fn().mockResolvedValue(undefined);

    service = new SearchService({
      repository: mockRepository,
      getTrendingPostIds: mockGetTrendingPostIds,
      getTrendingHashtagIds: mockGetTrendingHashtagIds,
      updateTrendingPostIds: mockUpdateTrendingPostIds,
      updateTrendingHashtagIds: mockUpdateTrendingHashtagIds,
    });
  });

  // ─── search() ───────────────────────────────────────────────────────────────

  describe('search()', () => {
    describe('query validation (Req 10.1)', () => {
      it('should reject empty query', async () => {
        await expect(service.search('')).rejects.toThrow(SearchServiceError);
        await expect(service.search('')).rejects.toThrow(
          `Search query must be at least ${MIN_QUERY_LENGTH} character(s)`,
        );
      });

      it('should reject query exceeding 100 characters', async () => {
        const longQuery = 'a'.repeat(101);
        await expect(service.search(longQuery)).rejects.toThrow(SearchServiceError);
        await expect(service.search(longQuery)).rejects.toThrow(
          `Search query must not exceed ${MAX_QUERY_LENGTH} characters`,
        );
      });

      it('should accept query of exactly 1 character', async () => {
        mockRepository.searchUsers.mockResolvedValue([createUser()]);
        const result = await service.search('a');
        expect(result).toBeDefined();
        expect(result.data).toBeDefined();
      });

      it('should accept query of exactly 100 characters', async () => {
        const query = 'a'.repeat(100);
        const result = await service.search(query);
        expect(result).toBeDefined();
      });

      it('should reject invalid cursor format', async () => {
        await expect(service.search('test', undefined, 'invalid')).rejects.toThrow(
          'Invalid cursor format',
        );
      });
    });

    describe('search across all types (Req 10.1)', () => {
      it('should return results from all content types', async () => {
        mockRepository.searchUsers.mockResolvedValue([createUser({ id: 1 })]);
        mockRepository.searchPosts.mockResolvedValue([createPost({ id: 2 })]);
        mockRepository.searchHashtags.mockResolvedValue([createHashtag({ id: 3 })]);
        mockRepository.searchReels.mockResolvedValue([createReel({ id: 4 })]);

        const result = await service.search('test');

        expect(result.data.length).toBe(4);
        const types = result.data.map((item) => item.type);
        expect(types).toContain('user');
        expect(types).toContain('post');
        expect(types).toContain('hashtag');
        expect(types).toContain('reel');
      });

      it('should rank results by engagement score', async () => {
        mockRepository.searchUsers.mockResolvedValue([
          createUser({ id: 1, follower_count: 5 }),
        ]);
        mockRepository.searchPosts.mockResolvedValue([
          createPost({ id: 2, like_count: 100, comment_count: 50, share_count: 30 }),
        ]);
        mockRepository.searchHashtags.mockResolvedValue([
          createHashtag({ id: 3, post_count: 10 }),
        ]);
        mockRepository.searchReels.mockResolvedValue([]);

        const result = await service.search('test');

        // Post with 180 total engagement should rank first
        expect(result.data[0]!.type).toBe('post');
      });

      it('should return max 20 results per page', async () => {
        const manyUsers = Array.from({ length: 15 }, (_, i) =>
          createUser({ id: i + 1, username: `user${i}` }),
        );
        const manyPosts = Array.from({ length: 15 }, (_, i) =>
          createPost({ id: i + 100, content: `post ${i}` }),
        );

        mockRepository.searchUsers.mockResolvedValue(manyUsers);
        mockRepository.searchPosts.mockResolvedValue(manyPosts);
        mockRepository.searchHashtags.mockResolvedValue([]);
        mockRepository.searchReels.mockResolvedValue([]);

        const result = await service.search('test');

        expect(result.data.length).toBeLessThanOrEqual(DEFAULT_PAGE_SIZE);
      });

      it('should return hasMore=true when more results available', async () => {
        const manyPosts = Array.from({ length: 12 }, (_, i) =>
          createPost({ id: i + 1 }),
        );
        const manyUsers = Array.from({ length: 12 }, (_, i) =>
          createUser({ id: i + 100 }),
        );

        mockRepository.searchUsers.mockResolvedValue(manyUsers);
        mockRepository.searchPosts.mockResolvedValue(manyPosts);
        mockRepository.searchHashtags.mockResolvedValue([]);
        mockRepository.searchReels.mockResolvedValue([]);

        const result = await service.search('test');

        expect(result.hasMore).toBe(true);
        expect(result.cursor).not.toBeNull();
      });

      it('should return empty result with no cursor when no results found (Req 10.7)', async () => {
        const result = await service.search('nonexistent');

        expect(result.data).toHaveLength(0);
        expect(result.cursor).toBeNull();
        expect(result.hasMore).toBe(false);
      });
    });

    describe('content type filtering (Req 10.5)', () => {
      it('should return only users when type filter is "users"', async () => {
        mockRepository.searchUsers.mockResolvedValue([
          createUser({ id: 1 }),
          createUser({ id: 2 }),
        ]);

        const result = await service.search('test', { type: 'users' });

        expect(result.data.every((item) => item.type === 'user')).toBe(true);
        expect(mockRepository.searchPosts).not.toHaveBeenCalled();
        expect(mockRepository.searchHashtags).not.toHaveBeenCalled();
        expect(mockRepository.searchReels).not.toHaveBeenCalled();
      });

      it('should return only posts when type filter is "posts"', async () => {
        mockRepository.searchPosts.mockResolvedValue([
          createPost({ id: 1 }),
          createPost({ id: 2 }),
        ]);

        const result = await service.search('test', { type: 'posts' });

        expect(result.data.every((item) => item.type === 'post')).toBe(true);
        expect(mockRepository.searchUsers).not.toHaveBeenCalled();
      });

      it('should return only hashtags when type filter is "hashtags"', async () => {
        mockRepository.searchHashtags.mockResolvedValue([
          createHashtag({ id: 1 }),
          createHashtag({ id: 2 }),
        ]);

        const result = await service.search('test', { type: 'hashtags' });

        expect(result.data.every((item) => item.type === 'hashtag')).toBe(true);
        expect(mockRepository.searchUsers).not.toHaveBeenCalled();
        expect(mockRepository.searchPosts).not.toHaveBeenCalled();
      });

      it('should return only reels when type filter is "reels"', async () => {
        mockRepository.searchReels.mockResolvedValue([
          createReel({ id: 1 }),
          createReel({ id: 2 }),
        ]);

        const result = await service.search('test', { type: 'reels' });

        expect(result.data.every((item) => item.type === 'reel')).toBe(true);
        expect(mockRepository.searchUsers).not.toHaveBeenCalled();
        expect(mockRepository.searchPosts).not.toHaveBeenCalled();
      });

      it('should paginate filtered results correctly', async () => {
        // Return 21 results to trigger hasMore
        const manyPosts = Array.from({ length: 21 }, (_, i) =>
          createPost({ id: i + 1 }),
        );
        mockRepository.searchPosts.mockResolvedValue(manyPosts);

        const result = await service.search('test', { type: 'posts' });

        expect(result.data).toHaveLength(DEFAULT_PAGE_SIZE);
        expect(result.hasMore).toBe(true);
        expect(result.cursor).toBe(String(DEFAULT_PAGE_SIZE));
      });
    });

    describe('pagination', () => {
      it('should use cursor for offset-based pagination', async () => {
        mockRepository.searchPosts.mockResolvedValue([createPost({ id: 21 })]);

        await service.search('test', { type: 'posts' }, '20');

        expect(mockRepository.searchPosts).toHaveBeenCalledWith(
          'test',
          DEFAULT_PAGE_SIZE + 1,
          20,
        );
      });

      it('should pass offset 0 when no cursor provided', async () => {
        await service.search('test', { type: 'posts' });

        expect(mockRepository.searchPosts).toHaveBeenCalledWith(
          'test',
          DEFAULT_PAGE_SIZE + 1,
          0,
        );
      });
    });
  });

  // ─── typeahead() ────────────────────────────────────────────────────────────

  describe('typeahead()', () => {
    it('should return empty array for query shorter than 2 characters (Req 10.4)', async () => {
      const result = await service.typeahead('a');
      expect(result).toHaveLength(0);
      expect(mockRepository.typeaheadUsers).not.toHaveBeenCalled();
    });

    it('should return empty array for empty query', async () => {
      const result = await service.typeahead('');
      expect(result).toHaveLength(0);
    });

    it('should return suggestions for 2+ character query (Req 10.4)', async () => {
      mockRepository.typeaheadUsers.mockResolvedValue([
        createUser({ id: 1, username: 'john' }),
      ]);
      mockRepository.typeaheadHashtags.mockResolvedValue([
        createHashtag({ id: 1, name: 'javascript' }),
      ]);

      const result = await service.typeahead('jo');

      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(MAX_TYPEAHEAD_RESULTS);
    });

    it('should return max 8 suggestions (Req 10.4)', async () => {
      const manyUsers = Array.from({ length: 6 }, (_, i) =>
        createUser({ id: i + 1, username: `user${i}` }),
      );
      const manyHashtags = Array.from({ length: 6 }, (_, i) =>
        createHashtag({ id: i + 1, name: `hash${i}` }),
      );

      mockRepository.typeaheadUsers.mockResolvedValue(manyUsers);
      mockRepository.typeaheadHashtags.mockResolvedValue(manyHashtags);

      const result = await service.typeahead('us');

      expect(result.length).toBeLessThanOrEqual(MAX_TYPEAHEAD_RESULTS);
    });

    it('should include user suggestions with username as text', async () => {
      mockRepository.typeaheadUsers.mockResolvedValue([
        createUser({ id: 1, username: 'johndoe', display_name: 'John Doe' }),
      ]);
      mockRepository.typeaheadHashtags.mockResolvedValue([]);

      const result = await service.typeahead('jo');

      expect(result[0]).toEqual({
        type: 'users',
        id: 1,
        text: 'johndoe',
        subtitle: 'John Doe',
      });
    });

    it('should include hashtag suggestions with # prefix', async () => {
      mockRepository.typeaheadUsers.mockResolvedValue([]);
      mockRepository.typeaheadHashtags.mockResolvedValue([
        createHashtag({ id: 5, name: 'javascript', post_count: 500 }),
      ]);

      const result = await service.typeahead('ja');

      expect(result[0]).toEqual({
        type: 'hashtags',
        id: 5,
        text: '#javascript',
        subtitle: '500 posts',
      });
    });

    it('should trim and lowercase the query', async () => {
      mockRepository.typeaheadUsers.mockResolvedValue([]);
      mockRepository.typeaheadHashtags.mockResolvedValue([]);

      await service.typeahead('  Test  ');

      expect(mockRepository.typeaheadUsers).toHaveBeenCalledWith('test', expect.any(Number));
      expect(mockRepository.typeaheadHashtags).toHaveBeenCalledWith('test', expect.any(Number));
    });
  });

  // ─── getTrending() ──────────────────────────────────────────────────────────

  describe('getTrending()', () => {
    it('should return trending posts, hashtags, and suggested users (Req 10.3)', async () => {
      const trendingPosts = [createPost({ id: 1 }), createPost({ id: 2 })];
      const trendingHashtags = [createHashtag({ id: 1 }), createHashtag({ id: 2 })];
      const suggestedUsers = [createUser({ id: 1 }), createUser({ id: 2 })];

      mockRepository.getTrendingPosts.mockResolvedValue(trendingPosts);
      mockRepository.getTrendingHashtags.mockResolvedValue(trendingHashtags);
      mockRepository.getSuggestedUsers.mockResolvedValue(suggestedUsers);

      const result = await service.getTrending();

      expect(result.posts).toHaveLength(2);
      expect(result.hashtags).toHaveLength(2);
      expect(result.suggestedUsers).toHaveLength(2);
    });

    it('should use Redis cache for trending posts when available', async () => {
      mockGetTrendingPostIds.mockResolvedValue(['1', '2', '3']);

      const cachedPosts = [
        createPost({ id: 1 }),
        createPost({ id: 2 }),
        createPost({ id: 3 }),
      ];

      // Mock the DB query for fetching posts by IDs
      const mockWhereIn = jest.fn().mockReturnValue({
        whereNull: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue(cachedPosts),
          }),
        }),
      });
      const mockDbFn = jest.fn().mockReturnValue({ whereIn: mockWhereIn });
      mockRepository.getDb = jest.fn().mockReturnValue(mockDbFn);
      mockRepository.getSuggestedUsers.mockResolvedValue([]);
      mockGetTrendingHashtagIds.mockResolvedValue([]);
      mockRepository.getTrendingHashtags.mockResolvedValue([]);

      const result = await service.getTrending();

      expect(result.posts).toHaveLength(3);
      // Should NOT call repository.getTrendingPosts since cache was used
      expect(mockRepository.getTrendingPosts).not.toHaveBeenCalled();
    });

    it('should cache trending posts in Redis when not cached', async () => {
      const trendingPosts = [
        createPost({ id: 1, like_count: 100 }),
        createPost({ id: 2, like_count: 50 }),
      ];

      mockGetTrendingPostIds.mockResolvedValue([]);
      mockGetTrendingHashtagIds.mockResolvedValue([]);
      mockRepository.getTrendingPosts.mockResolvedValue(trendingPosts);
      mockRepository.getTrendingHashtags.mockResolvedValue([]);
      mockRepository.getSuggestedUsers.mockResolvedValue([]);

      await service.getTrending();

      expect(mockUpdateTrendingPostIds).toHaveBeenCalledWith([
        { id: '1', score: 2 },
        { id: '2', score: 1 },
      ]);
    });

    it('should cache trending hashtags in Redis when not cached', async () => {
      const trendingHashtags = [
        createHashtag({ id: 10, name: 'trending1', post_count: 500 }),
        createHashtag({ id: 20, name: 'trending2', post_count: 300 }),
      ];

      mockGetTrendingPostIds.mockResolvedValue([]);
      mockGetTrendingHashtagIds.mockResolvedValue([]);
      mockRepository.getTrendingPosts.mockResolvedValue([]);
      mockRepository.getTrendingHashtags.mockResolvedValue(trendingHashtags);
      mockRepository.getSuggestedUsers.mockResolvedValue([]);

      await service.getTrending();

      expect(mockUpdateTrendingHashtagIds).toHaveBeenCalledWith([
        { id: '10', score: 2 },
        { id: '20', score: 1 },
      ]);
    });

    it('should return empty arrays when no trending content exists', async () => {
      mockGetTrendingPostIds.mockResolvedValue([]);
      mockGetTrendingHashtagIds.mockResolvedValue([]);
      mockRepository.getTrendingPosts.mockResolvedValue([]);
      mockRepository.getTrendingHashtags.mockResolvedValue([]);
      mockRepository.getSuggestedUsers.mockResolvedValue([]);

      const result = await service.getTrending();

      expect(result.posts).toHaveLength(0);
      expect(result.hashtags).toHaveLength(0);
      expect(result.suggestedUsers).toHaveLength(0);
    });

    it('should request correct limits for trending content', async () => {
      mockGetTrendingPostIds.mockResolvedValue([]);
      mockGetTrendingHashtagIds.mockResolvedValue([]);
      mockRepository.getTrendingPosts.mockResolvedValue([]);
      mockRepository.getTrendingHashtags.mockResolvedValue([]);
      mockRepository.getSuggestedUsers.mockResolvedValue([]);

      await service.getTrending();

      expect(mockGetTrendingPostIds).toHaveBeenCalledWith(TRENDING_POSTS_COUNT);
      expect(mockGetTrendingHashtagIds).toHaveBeenCalledWith(TRENDING_HASHTAGS_COUNT);
      expect(mockRepository.getSuggestedUsers).toHaveBeenCalledWith(SUGGESTED_USERS_COUNT);
    });
  });

  // ─── getHashtagPosts() ──────────────────────────────────────────────────────

  describe('getHashtagPosts()', () => {
    it('should throw error for empty hashtag name', async () => {
      await expect(service.getHashtagPosts('')).rejects.toThrow(SearchServiceError);
      await expect(service.getHashtagPosts('')).rejects.toThrow('Hashtag name is required');
    });

    it('should throw 404 when hashtag not found', async () => {
      mockRepository.getHashtagByName.mockResolvedValue(null);

      await expect(service.getHashtagPosts('nonexistent')).rejects.toThrow(SearchServiceError);
      try {
        await service.getHashtagPosts('nonexistent');
      } catch (error) {
        expect((error as SearchServiceError).statusCode).toBe(404);
      }
    });

    it('should return hashtag info with posts (Req 10.6)', async () => {
      const hashtag = createHashtag({ id: 5, name: 'javascript', post_count: 150 });
      const posts = [createPost({ id: 1 }), createPost({ id: 2 })];

      mockRepository.getHashtagByName.mockResolvedValue(hashtag);
      mockRepository.getHashtagPosts.mockResolvedValue(posts);

      const result = await service.getHashtagPosts('javascript');

      expect(result.hashtag).toEqual(hashtag);
      expect(result.hashtag.post_count).toBe(150);
      expect(result.posts).toHaveLength(2);
    });

    it('should return posts in reverse chronological order (Req 10.2)', async () => {
      const hashtag = createHashtag({ id: 5, name: 'test' });
      const posts = [
        createPost({ id: 3, created_at: new Date('2024-01-15T12:00:00Z') }),
        createPost({ id: 2, created_at: new Date('2024-01-14T12:00:00Z') }),
        createPost({ id: 1, created_at: new Date('2024-01-13T12:00:00Z') }),
      ];

      mockRepository.getHashtagByName.mockResolvedValue(hashtag);
      mockRepository.getHashtagPosts.mockResolvedValue(posts);

      const result = await service.getHashtagPosts('test');

      // Repository is responsible for ordering, we just verify it passes through
      expect(result.posts[0]!.id).toBe(3);
      expect(result.posts[2]!.id).toBe(1);
    });

    it('should paginate at 20 posts per page (Req 10.2)', async () => {
      const hashtag = createHashtag({ id: 5, name: 'popular' });
      // Return 21 posts to trigger hasMore
      const posts = Array.from({ length: 21 }, (_, i) =>
        createPost({ id: i + 1 }),
      );

      mockRepository.getHashtagByName.mockResolvedValue(hashtag);
      mockRepository.getHashtagPosts.mockResolvedValue(posts);

      const result = await service.getHashtagPosts('popular');

      expect(result.posts).toHaveLength(DEFAULT_PAGE_SIZE);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe(String(DEFAULT_PAGE_SIZE));
    });

    it('should use cursor for pagination', async () => {
      const hashtag = createHashtag({ id: 5, name: 'test' });
      mockRepository.getHashtagByName.mockResolvedValue(hashtag);
      mockRepository.getHashtagPosts.mockResolvedValue([createPost({ id: 21 })]);

      await service.getHashtagPosts('test', '20');

      expect(mockRepository.getHashtagPosts).toHaveBeenCalledWith(
        5,
        DEFAULT_PAGE_SIZE + 1,
        20,
      );
    });

    it('should normalize hashtag name (lowercase, strip #)', async () => {
      const hashtag = createHashtag({ id: 5, name: 'javascript' });
      mockRepository.getHashtagByName.mockResolvedValue(hashtag);
      mockRepository.getHashtagPosts.mockResolvedValue([]);

      await service.getHashtagPosts('#JavaScript');

      expect(mockRepository.getHashtagByName).toHaveBeenCalledWith('javascript');
    });

    it('should reject invalid cursor format', async () => {
      const hashtag = createHashtag({ id: 5, name: 'test' });
      mockRepository.getHashtagByName.mockResolvedValue(hashtag);

      await expect(service.getHashtagPosts('test', 'invalid')).rejects.toThrow(
        'Invalid cursor format',
      );
    });

    it('should return hasMore=false when fewer than page size results', async () => {
      const hashtag = createHashtag({ id: 5, name: 'test' });
      const posts = [createPost({ id: 1 }), createPost({ id: 2 })];

      mockRepository.getHashtagByName.mockResolvedValue(hashtag);
      mockRepository.getHashtagPosts.mockResolvedValue(posts);

      const result = await service.getHashtagPosts('test');

      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });
  });
});
