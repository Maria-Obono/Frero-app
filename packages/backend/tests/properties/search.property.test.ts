import * as fc from 'fast-check';
import { SearchService } from '../../src/services/search/search.service';
import {
  SearchContentType,
  SearchResultUser,
  SearchResultPost,
  SearchResultHashtag,
  SearchResultReel,
} from '../../src/services/search/types';

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * Create a mock SearchRepository that returns results of all content types
 * regardless of the query, simulating a database with mixed content.
 */
function createMockRepository(options: {
  users?: SearchResultUser[];
  posts?: SearchResultPost[];
  hashtags?: SearchResultHashtag[];
  reels?: SearchResultReel[];
}) {
  return {
    searchUsers: jest.fn(async (_query: string, limit: number, _offset: number) => {
      return (options.users ?? []).slice(0, limit);
    }),
    searchPosts: jest.fn(async (_query: string, limit: number, _offset: number) => {
      return (options.posts ?? []).slice(0, limit);
    }),
    searchHashtags: jest.fn(async (_query: string, limit: number, _offset: number) => {
      return (options.hashtags ?? []).slice(0, limit);
    }),
    searchReels: jest.fn(async (_query: string, limit: number, _offset: number) => {
      return (options.reels ?? []).slice(0, limit);
    }),
    getHashtagByName: jest.fn(async () => null),
    getHashtagPosts: jest.fn(async () => []),
    getTrendingPosts: jest.fn(async () => []),
    getTrendingHashtags: jest.fn(async () => []),
    getSuggestedUsers: jest.fn(async () => []),
    typeaheadUsers: jest.fn(async () => []),
    typeaheadHashtags: jest.fn(async () => []),
    getDb: jest.fn(() => jest.fn()),
  };
}

/**
 * Generate sample users for mock data.
 */
function generateUsers(count: number): SearchResultUser[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    username: `user_${i + 1}`,
    display_name: `User ${i + 1}`,
    avatar_url: null,
    follower_count: Math.floor(Math.random() * 1000),
  }));
}

/**
 * Generate sample posts for mock data.
 */
function generatePosts(count: number): SearchResultPost[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 100,
    user_id: i + 1,
    content: `Post content ${i + 1}`,
    type: 'text',
    like_count: Math.floor(Math.random() * 100),
    comment_count: Math.floor(Math.random() * 50),
    share_count: Math.floor(Math.random() * 20),
    created_at: new Date(),
  }));
}

/**
 * Generate sample hashtags for mock data.
 */
function generateHashtags(count: number): SearchResultHashtag[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 200,
    name: `hashtag${i + 1}`,
    post_count: Math.floor(Math.random() * 5000),
  }));
}

/**
 * Generate sample reels for mock data.
 */
function generateReels(count: number): SearchResultReel[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 300,
    user_id: i + 1,
    caption: `Reel caption ${i + 1}`,
    thumbnail_url: null,
    like_count: Math.floor(Math.random() * 200),
    comment_count: Math.floor(Math.random() * 80),
    share_count: Math.floor(Math.random() * 40),
    created_at: new Date(),
  }));
}

// ============================================================================
// fast-check Arbitraries
// ============================================================================

/**
 * Generate a valid search query string (1-100 characters).
 */
const searchQueryArb = fc.string({ minLength: 1, maxLength: 100 }).filter(
  (s) => s.trim().length >= 1,
);

/**
 * Generate a content type filter value.
 */
const contentTypeArb = fc.constantFrom<SearchContentType>('users', 'posts', 'hashtags', 'reels');

// ============================================================================
// Property 31: Search content type filter
// ============================================================================

describe('Feature: frero-social-platform, Property 31: Search content type filter', () => {
  /**
   * **Validates: Requirements 10.5**
   *
   * IF a user applies a content type filter (users, posts, hashtags, or reels),
   * THEN THE Search_Service SHALL return only results matching the selected content type.
   */

  it('should return ONLY results matching the selected content type filter', async () => {
    await fc.assert(
      fc.asyncProperty(
        searchQueryArb,
        contentTypeArb,
        async (query, contentType) => {
          // Create a repository that has results of ALL types
          const mockRepo = createMockRepository({
            users: generateUsers(5),
            posts: generatePosts(5),
            hashtags: generateHashtags(5),
            reels: generateReels(5),
          });

          const service = new SearchService({
            repository: mockRepo as any,
            getTrendingPostIds: async () => [],
            getTrendingHashtagIds: async () => [],
            updateTrendingPostIds: async () => {},
            updateTrendingHashtagIds: async () => {},
          });

          const result = await service.search(query, { type: contentType });

          // Map content type filter to expected result item type
          const expectedType: string = {
            users: 'user',
            posts: 'post',
            hashtags: 'hashtag',
            reels: 'reel',
          }[contentType];

          // Assert: ALL returned results match the selected content type
          for (const item of result.data) {
            expect(item.type).toBe(expectedType);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return NO results of other content types when a filter is applied', async () => {
    await fc.assert(
      fc.asyncProperty(
        searchQueryArb,
        contentTypeArb,
        async (query, contentType) => {
          // Create a repository that has results of ALL types
          const mockRepo = createMockRepository({
            users: generateUsers(5),
            posts: generatePosts(5),
            hashtags: generateHashtags(5),
            reels: generateReels(5),
          });

          const service = new SearchService({
            repository: mockRepo as any,
            getTrendingPostIds: async () => [],
            getTrendingHashtagIds: async () => [],
            updateTrendingPostIds: async () => {},
            updateTrendingHashtagIds: async () => {},
          });

          const result = await service.search(query, { type: contentType });

          // Define all possible types
          const allTypes = ['user', 'post', 'hashtag', 'reel'];
          const expectedType = {
            users: 'user',
            posts: 'post',
            hashtags: 'hashtag',
            reels: 'reel',
          }[contentType];

          // Assert: no results of other types are present
          const otherTypes = allTypes.filter((t) => t !== expectedType);
          for (const item of result.data) {
            expect(otherTypes).not.toContain(item.type);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should only call the repository method for the filtered content type', async () => {
    await fc.assert(
      fc.asyncProperty(
        searchQueryArb,
        contentTypeArb,
        async (query, contentType) => {
          const mockRepo = createMockRepository({
            users: generateUsers(3),
            posts: generatePosts(3),
            hashtags: generateHashtags(3),
            reels: generateReels(3),
          });

          const service = new SearchService({
            repository: mockRepo as any,
            getTrendingPostIds: async () => [],
            getTrendingHashtagIds: async () => [],
            updateTrendingPostIds: async () => {},
            updateTrendingHashtagIds: async () => {},
          });

          // Reset mock call counts
          mockRepo.searchUsers.mockClear();
          mockRepo.searchPosts.mockClear();
          mockRepo.searchHashtags.mockClear();
          mockRepo.searchReels.mockClear();

          await service.search(query, { type: contentType });

          // Assert: only the relevant repository method was called
          switch (contentType) {
            case 'users':
              expect(mockRepo.searchUsers).toHaveBeenCalled();
              expect(mockRepo.searchPosts).not.toHaveBeenCalled();
              expect(mockRepo.searchHashtags).not.toHaveBeenCalled();
              expect(mockRepo.searchReels).not.toHaveBeenCalled();
              break;
            case 'posts':
              expect(mockRepo.searchUsers).not.toHaveBeenCalled();
              expect(mockRepo.searchPosts).toHaveBeenCalled();
              expect(mockRepo.searchHashtags).not.toHaveBeenCalled();
              expect(mockRepo.searchReels).not.toHaveBeenCalled();
              break;
            case 'hashtags':
              expect(mockRepo.searchUsers).not.toHaveBeenCalled();
              expect(mockRepo.searchPosts).not.toHaveBeenCalled();
              expect(mockRepo.searchHashtags).toHaveBeenCalled();
              expect(mockRepo.searchReels).not.toHaveBeenCalled();
              break;
            case 'reels':
              expect(mockRepo.searchUsers).not.toHaveBeenCalled();
              expect(mockRepo.searchPosts).not.toHaveBeenCalled();
              expect(mockRepo.searchHashtags).not.toHaveBeenCalled();
              expect(mockRepo.searchReels).toHaveBeenCalled();
              break;
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return results with correct data structure for each content type', async () => {
    await fc.assert(
      fc.asyncProperty(
        searchQueryArb,
        contentTypeArb,
        async (query, contentType) => {
          const mockRepo = createMockRepository({
            users: generateUsers(5),
            posts: generatePosts(5),
            hashtags: generateHashtags(5),
            reels: generateReels(5),
          });

          const service = new SearchService({
            repository: mockRepo as any,
            getTrendingPostIds: async () => [],
            getTrendingHashtagIds: async () => [],
            updateTrendingPostIds: async () => {},
            updateTrendingHashtagIds: async () => {},
          });

          const result = await service.search(query, { type: contentType });

          // Assert: each result has the correct data structure for its type
          for (const item of result.data) {
            switch (item.type) {
              case 'user':
                expect(item.data).toHaveProperty('id');
                expect(item.data).toHaveProperty('username');
                break;
              case 'post':
                expect(item.data).toHaveProperty('id');
                expect(item.data).toHaveProperty('user_id');
                expect(item.data).toHaveProperty('content');
                break;
              case 'hashtag':
                expect(item.data).toHaveProperty('id');
                expect(item.data).toHaveProperty('name');
                expect(item.data).toHaveProperty('post_count');
                break;
              case 'reel':
                expect(item.data).toHaveProperty('id');
                expect(item.data).toHaveProperty('user_id');
                expect(item.data).toHaveProperty('caption');
                break;
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
