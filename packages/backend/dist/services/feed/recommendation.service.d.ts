/**
 * AI-powered Recommendation Service.
 *
 * Requirements covered:
 * - 19.1: Provide 20-50 AI-generated content recommendations based on 90-day engagement history
 * - 19.2: Update recommendation models within a 1-hour refresh cycle
 * - 19.3: Adjust recommendations when user follows new accounts or engages with new categories
 * - 19.4: Provide 5-10 suggested users based on mutual connections and content overlap
 * - 19.5: Diversity constraint - max 20% from single creator
 * - 19.6: Fallback to trending content for users with fewer than 5 interactions
 * - 19.7: 3-second timeout fallback to trending content
 */
import { FeedRepository } from './feed.repository';
import { FeedPost } from './types';
/** Minimum number of recommendations to generate (Requirement 19.1) */
export declare const MIN_RECOMMENDATIONS = 20;
/** Maximum number of recommendations to generate (Requirement 19.1) */
export declare const MAX_RECOMMENDATIONS = 50;
/** Engagement history window in days (Requirement 19.1) */
export declare const ENGAGEMENT_HISTORY_DAYS = 90;
/** Minimum suggested users (Requirement 19.4) */
export declare const MIN_SUGGESTED_USERS = 5;
/** Maximum suggested users (Requirement 19.4) */
export declare const MAX_SUGGESTED_USERS = 10;
/** Maximum percentage of recommendations from a single creator (Requirement 19.5) */
export declare const MAX_SINGLE_CREATOR_PERCENTAGE = 0.2;
/** Minimum interactions before personalized recommendations (Requirement 19.6) */
export declare const MIN_INTERACTIONS_FOR_PERSONALIZED = 5;
/** Timeout for recommendation generation in milliseconds (Requirement 19.7) */
export declare const RECOMMENDATION_TIMEOUT_MS = 3000;
export interface SuggestedUser {
    id: number;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    mutual_friends_count: number;
    content_overlap_score: number;
}
export interface RecommendationServiceDependencies {
    repository?: FeedRepository;
    cacheGet?: (userId: string) => Promise<string[] | null>;
    cacheSet?: (userId: string, postIds: string[]) => Promise<void>;
    cacheInvalidate?: (userId: string) => Promise<void>;
    getTrendingPostIds?: (limit: number) => Promise<string[]>;
}
export declare class RecommendationService {
    private readonly repository;
    private readonly cacheGet;
    private readonly cacheSet;
    private readonly cacheInvalidate;
    private readonly getTrendingPostIds;
    constructor(deps?: RecommendationServiceDependencies);
    /**
     * Get content recommendations for the explore page.
     *
     * Requirement 19.1: Generate 20-50 content recommendations based on 90-day engagement history.
     * Requirement 19.2: 1-hour refresh cycle (via Redis cache with 1-hour TTL).
     * Requirement 19.5: Max 20% from single creator.
     * Requirement 19.6: Fallback to trending for users with < 5 interactions.
     * Requirement 19.7: 3-second timeout fallback to trending content.
     */
    getRecommendations(userId: number): Promise<FeedPost[]>;
    /**
     * Get suggested users to follow.
     *
     * Requirement 19.4: Suggest 5-10 users based on mutual connections and content overlap.
     */
    getSuggestedUsers(userId: number): Promise<SuggestedUser[]>;
    /**
     * Invalidate recommendations for a user (e.g., when they follow a new account).
     * Requirement 19.3: Adjust recommendations within the next refresh cycle.
     */
    invalidateUserRecommendations(userId: number): Promise<void>;
    /**
     * Generate personalized content recommendations.
     */
    private generateRecommendations;
    /**
     * Score recommendation candidates based on engagement signals.
     */
    private scoreRecommendations;
    /**
     * Apply diversity constraint: max 20% of recommendations from a single creator.
     * Requirement 19.5.
     */
    applyDiversityConstraint(posts: FeedPost[]): FeedPost[];
    /**
     * Generate user suggestions based on mutual connections and content overlap.
     * Requirement 19.4.
     */
    private generateUserSuggestions;
    /**
     * Find candidate users through mutual connections (friends-of-friends).
     */
    private findMutualConnectionCandidates;
    /**
     * Score user candidates based on mutual connections and content overlap.
     */
    private scoreUserCandidates;
    /**
     * Fallback to trending content (Requirement 19.6, 19.7).
     */
    private getTrendingFallback;
    /**
     * Fetch posts by their IDs, preserving order.
     */
    private fetchPostsByIds;
    /**
     * Execute a promise with a timeout.
     * Requirement 19.7: 3-second timeout fallback.
     */
    private withTimeout;
}
//# sourceMappingURL=recommendation.service.d.ts.map