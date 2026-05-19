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
import { SearchFilters, SearchResult, TypeaheadSuggestion, TrendingContent, HashtagPageResult } from './types';
export interface SearchServiceDependencies {
    repository?: SearchRepository;
    getTrendingPostIds?: (limit: number) => Promise<string[]>;
    getTrendingHashtagIds?: (limit: number) => Promise<string[]>;
    updateTrendingPostIds?: (posts: Array<{
        id: string;
        score: number;
    }>) => Promise<void>;
    updateTrendingHashtagIds?: (hashtags: Array<{
        id: string;
        score: number;
    }>) => Promise<void>;
}
export declare class SearchService {
    private readonly repository;
    private readonly getTrendingPostIds;
    private readonly getTrendingHashtagIds;
    private readonly updateTrendingPostIds;
    private readonly updateTrendingHashtagIds;
    constructor(deps?: SearchServiceDependencies);
    /**
     * Search across users, posts, hashtags, and reels with text match + engagement ranking.
     *
     * Requirement 10.1: 1-100 char queries, 20 results/page
     * Requirement 10.5: Content type filtering
     * Requirement 10.7: Empty state with suggestions
     */
    search(query: string, filters?: SearchFilters, cursor?: string | null, limit?: number): Promise<SearchResult>;
    /**
     * Search filtered by a specific content type.
     * Requirement 10.5.
     */
    private searchByType;
    /**
     * Search across all content types and merge results ranked by engagement.
     * Distributes results across types for a balanced result set.
     */
    private searchAll;
    /**
     * Get engagement score for a search result item for ranking purposes.
     */
    private getEngagementScore;
    /**
     * Typeahead suggestions for search.
     *
     * Requirement 10.4: 2+ chars, 8 results, within 200ms target.
     */
    typeahead(query: string): Promise<TypeaheadSuggestion[]>;
    /**
     * Get trending content for the explore page.
     *
     * Requirement 10.3: 10 trending posts, 10 trending hashtags, 10 suggested users.
     * Uses Redis cache with 5-min TTL.
     */
    getTrending(): Promise<TrendingContent>;
    /**
     * Get posts for a specific hashtag page.
     *
     * Requirement 10.2: Reverse chronological order, paginated.
     * Requirement 10.6: Display total post count and recent posts.
     */
    getHashtagPosts(hashtag: string, cursor?: string | null): Promise<HashtagPageResult>;
    /**
     * Fetch posts by their IDs, preserving order.
     */
    private fetchPostsByIds;
    /**
     * Fetch hashtags by their IDs, preserving order.
     */
    private fetchHashtagsByIds;
}
//# sourceMappingURL=search.service.d.ts.map