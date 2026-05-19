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
import { SearchResultUser, SearchResultPost, SearchResultHashtag, SearchResultReel } from './types';
export declare class SearchRepository {
    protected readonly db: Knex;
    constructor(options?: {
        db?: Knex;
    });
    /**
     * Search users by username or display_name with text matching.
     * Results are ranked by follower count (engagement proxy).
     */
    searchUsers(query: string, limit?: number, offset?: number): Promise<SearchResultUser[]>;
    /**
     * Search posts by content text with engagement ranking.
     * Ranked by combination of text match and engagement metrics.
     */
    searchPosts(query: string, limit?: number, offset?: number): Promise<SearchResultPost[]>;
    /**
     * Search hashtags by name.
     * Ranked by post_count (popularity).
     */
    searchHashtags(query: string, limit?: number, offset?: number): Promise<SearchResultHashtag[]>;
    /**
     * Search reels by caption with engagement ranking.
     */
    searchReels(query: string, limit?: number, offset?: number): Promise<SearchResultReel[]>;
    /**
     * Get posts for a specific hashtag in reverse chronological order.
     * Requirement 10.2, 10.6.
     */
    getHashtagPosts(hashtagId: number, limit?: number, offset?: number): Promise<SearchResultPost[]>;
    /**
     * Get a hashtag by name.
     */
    getHashtagByName(name: string): Promise<SearchResultHashtag | null>;
    /**
     * Get trending posts (highest engagement growth in last 24 hours).
     * Requirement 10.3.
     */
    getTrendingPosts(limit: number): Promise<SearchResultPost[]>;
    /**
     * Get trending hashtags (highest post_count growth in last 24 hours).
     * Requirement 10.3.
     */
    getTrendingHashtags(limit: number): Promise<SearchResultHashtag[]>;
    /**
     * Get suggested users (users with highest follower counts).
     * Requirement 10.3.
     */
    getSuggestedUsers(limit: number): Promise<SearchResultUser[]>;
    /**
     * Typeahead search for users (by username prefix).
     */
    typeaheadUsers(query: string, limit: number): Promise<SearchResultUser[]>;
    /**
     * Typeahead search for hashtags (by name prefix).
     */
    typeaheadHashtags(query: string, limit: number): Promise<SearchResultHashtag[]>;
    /**
     * Get the underlying Knex instance for advanced queries.
     */
    getDb(): Knex;
}
//# sourceMappingURL=search.repository.d.ts.map