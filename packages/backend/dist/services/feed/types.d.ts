/**
 * Feed service type definitions.
 *
 * Covers Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8
 */
import { Post } from '../post/types';
export interface FeedPost extends Post {
    /** Computed ranking score for feed ordering */
    score?: number;
}
export interface FeedResult {
    data: FeedPost[];
    cursor: string | null;
    hasMore: boolean;
    message?: string;
}
export interface FeedOptions {
    /** Cursor for pagination (post ID) */
    cursor?: string | null;
    /** User ID requesting the feed */
    userId: number;
}
export interface UserInterestSignal {
    id: number;
    user_id: number;
    target_user_id: number;
    interaction_type: InteractionType;
    weight: number;
    last_interaction_at: Date;
    created_at: Date;
    updated_at: Date;
}
export type InteractionType = 'like' | 'comment' | 'share' | 'view' | 'message';
export interface RankedPost {
    post: FeedPost;
    score: number;
}
export declare class FeedServiceError extends Error {
    readonly statusCode: number;
    readonly details?: Record<string, unknown>;
    constructor(message: string, statusCode: number, details?: Record<string, unknown>);
}
/** Number of posts per page (Requirement 9.4) */
export declare const FEED_PAGE_SIZE = 20;
/** Maximum posts per session (Requirement 9.4) */
export declare const FEED_MAX_POSTS_PER_SESSION = 500;
/** Recency window in days (Requirement 9.1) */
export declare const FEED_RECENCY_WINDOW_DAYS = 7;
/** Recent interaction window in days for author boost (Requirement 9.5) */
export declare const RECENT_INTERACTION_DAYS = 30;
/** Boost multiplier for recently-interacted authors (Requirement 9.5) */
export declare const RECENT_INTERACTION_BOOST = 1.5;
/** Redis cache TTL for feed in seconds (5 minutes) */
export declare const FEED_CACHE_TTL_SECONDS = 300;
//# sourceMappingURL=types.d.ts.map