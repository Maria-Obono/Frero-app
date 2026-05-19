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
import { FeedPost, FeedResult, UserInterestSignal } from './types';
export interface FeedServiceDependencies {
    repository?: FeedRepository;
    cacheGet?: (userId: string) => Promise<string[] | null>;
    cacheSet?: (userId: string, postIds: string[]) => Promise<void>;
    cacheInvalidate?: (userId: string) => Promise<void>;
}
export declare class FeedService {
    private readonly repository;
    private readonly cacheGet;
    private readonly cacheSet;
    private readonly cacheInvalidate;
    constructor(deps?: FeedServiceDependencies);
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
    getPersonalizedFeed(userId: number, cursor?: string | null): Promise<FeedResult>;
    /**
     * Generate the personalized feed with ranking algorithm.
     */
    private generatePersonalizedFeed;
    /**
     * Rank posts by engagement score, recency, and user interest signals.
     *
     * Scoring formula:
     * - Engagement score: log(1 + likes + comments*2 + shares*3)
     * - Recency score: exponential decay based on age (newer = higher)
     * - Interest boost: multiplier for authors the user has interacted with recently (Req 9.5)
     */
    rankPosts(posts: FeedPost[], interestSignals: UserInterestSignal[]): FeedPost[];
    /**
     * Fetch trending posts for the feed.
     * Requirement 9.6: Trending content with high engagement.
     */
    private fetchTrendingPosts;
    /**
     * Paginate from cached post IDs.
     * Returns the appropriate page of posts from the cached ranked list.
     */
    private paginateFromCache;
    /**
     * Paginate from ranked posts array.
     */
    private paginateFromRanked;
    /**
     * Fetch posts by their IDs, preserving the order of the input IDs.
     */
    private fetchPostsByIds;
    /**
     * Invalidate the cached feed for a user.
     * Should be called when new content is available or user relationships change.
     */
    invalidateUserFeed(userId: number): Promise<void>;
    /**
     * Chronological fallback feed.
     * Requirement 9.7: Return chronological feed from followed users and friends on failure.
     */
    private getChronologicalFallback;
}
//# sourceMappingURL=feed.service.d.ts.map