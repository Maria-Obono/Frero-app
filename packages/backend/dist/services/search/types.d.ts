/**
 * Search service type definitions.
 *
 * Covers Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */
export type SearchContentType = 'users' | 'posts' | 'hashtags' | 'reels';
export interface SearchFilters {
    type?: SearchContentType;
    dateRange?: {
        from: Date;
        to: Date;
    };
}
export interface SearchResultUser {
    id: number;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    follower_count?: number;
}
export interface SearchResultPost {
    id: number;
    user_id: number;
    content: string | null;
    type: string;
    like_count: number;
    comment_count: number;
    share_count: number;
    created_at: Date;
}
export interface SearchResultHashtag {
    id: number;
    name: string;
    post_count: number;
}
export interface SearchResultReel {
    id: number;
    user_id: number;
    caption: string | null;
    thumbnail_url: string | null;
    like_count: number;
    comment_count: number;
    share_count: number;
    created_at: Date;
}
export type SearchResultItem = {
    type: 'user';
    data: SearchResultUser;
} | {
    type: 'post';
    data: SearchResultPost;
} | {
    type: 'hashtag';
    data: SearchResultHashtag;
} | {
    type: 'reel';
    data: SearchResultReel;
};
export interface SearchResult {
    data: SearchResultItem[];
    cursor: string | null;
    hasMore: boolean;
    total?: number;
}
export interface TypeaheadSuggestion {
    type: SearchContentType;
    id: number;
    text: string;
    subtitle?: string;
}
export interface TrendingContent {
    posts: SearchResultPost[];
    hashtags: SearchResultHashtag[];
    suggestedUsers: SearchResultUser[];
}
export interface HashtagPageResult {
    hashtag: SearchResultHashtag;
    posts: SearchResultPost[];
    cursor: string | null;
    hasMore: boolean;
}
export declare class SearchServiceError extends Error {
    readonly statusCode: number;
    readonly details?: Record<string, unknown>;
    constructor(message: string, statusCode: number, details?: Record<string, unknown>);
}
/** Minimum search query length (Requirement 10.1) */
export declare const MIN_QUERY_LENGTH = 1;
/** Maximum search query length (Requirement 10.1) */
export declare const MAX_QUERY_LENGTH = 100;
/** Default results per page (Requirement 10.1) */
export declare const DEFAULT_PAGE_SIZE = 20;
/** Minimum typeahead query length (Requirement 10.4) */
export declare const MIN_TYPEAHEAD_LENGTH = 2;
/** Maximum typeahead suggestions (Requirement 10.4) */
export declare const MAX_TYPEAHEAD_RESULTS = 8;
/** Trending posts count for explore page (Requirement 10.3) */
export declare const TRENDING_POSTS_COUNT = 10;
/** Trending hashtags count for explore page (Requirement 10.3) */
export declare const TRENDING_HASHTAGS_COUNT = 10;
/** Suggested users count for explore page (Requirement 10.3) */
export declare const SUGGESTED_USERS_COUNT = 10;
/** Trending window in hours (Requirement 10.3) */
export declare const TRENDING_WINDOW_HOURS = 24;
/** Redis cache TTL for trending content in seconds (5 minutes) */
export declare const TRENDING_CACHE_TTL_SECONDS = 300;
//# sourceMappingURL=types.d.ts.map