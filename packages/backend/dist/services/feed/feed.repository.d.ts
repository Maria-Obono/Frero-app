/**
 * Feed repository handling database operations for feed generation.
 *
 * Provides data access for:
 * - posts table (feed content)
 * - follows table (followed users)
 * - friendships table (friends)
 * - blocks table (blocked users)
 * - user_interest_signals table (ranking signals)
 *
 * Requirements covered: 9.1, 9.2, 9.3, 9.4, 9.5
 */
import { Knex } from 'knex';
import { FeedPost, UserInterestSignal } from './types';
export declare class FeedRepository {
    protected readonly db: Knex;
    constructor(options?: {
        db?: Knex;
    });
    /**
     * Get IDs of users that the given user follows.
     * Requirement 9.2: Include posts from followed users.
     */
    getFollowedUserIds(userId: number): Promise<number[]>;
    /**
     * Get IDs of users that are friends with the given user.
     * Requirement 9.2: Include posts from friends.
     */
    getFriendIds(userId: number): Promise<number[]>;
    /**
     * Get IDs of users blocked by or blocking the given user.
     * Requirement 9.3: Exclude posts from blocked users.
     */
    getBlockedUserIds(userId: number): Promise<number[]>;
    /**
     * Get posts from specified authors within the recency window.
     * Excludes soft-deleted posts and respects privacy settings.
     *
     * Requirement 9.1: Posts no older than 7 days.
     * Requirement 9.2: Posts from followed users and friends.
     * Requirement 9.3: Exclude previously delivered posts.
     */
    getPostsFromAuthors(authorIds: number[], sinceDate: Date, excludePostIds: number[], limit: number): Promise<FeedPost[]>;
    /**
     * Get trending posts (high engagement relative to age).
     * Requirement 9.6: Trending content with engagement rate > 3x average.
     */
    getTrendingPosts(sinceDate: Date, excludePostIds: number[], excludeAuthorIds: number[], limit: number): Promise<FeedPost[]>;
    /**
     * Get user interest signals for ranking.
     * Requirement 9.5: Boost posts from recently-interacted authors.
     */
    getUserInterestSignals(userId: number, sinceDays: number): Promise<UserInterestSignal[]>;
    /**
     * Get posts in chronological order (fallback feed).
     * Requirement 9.7: Fallback to chronological feed on failure.
     */
    getChronologicalFeed(authorIds: number[], excludePostIds: number[], limit: number): Promise<FeedPost[]>;
    /**
     * Get the underlying Knex instance for advanced queries.
     */
    getDb(): Knex;
}
//# sourceMappingURL=feed.repository.d.ts.map