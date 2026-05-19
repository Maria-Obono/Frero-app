"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecommendationService = exports.RECOMMENDATION_TIMEOUT_MS = exports.MIN_INTERACTIONS_FOR_PERSONALIZED = exports.MAX_SINGLE_CREATOR_PERCENTAGE = exports.MAX_SUGGESTED_USERS = exports.MIN_SUGGESTED_USERS = exports.ENGAGEMENT_HISTORY_DAYS = exports.MAX_RECOMMENDATIONS = exports.MIN_RECOMMENDATIONS = void 0;
const feed_repository_1 = require("./feed.repository");
const redis_utils_1 = require("../../utils/redis-utils");
// ─── Constants ──────────────────────────────────────────────────────────────
/** Minimum number of recommendations to generate (Requirement 19.1) */
exports.MIN_RECOMMENDATIONS = 20;
/** Maximum number of recommendations to generate (Requirement 19.1) */
exports.MAX_RECOMMENDATIONS = 50;
/** Engagement history window in days (Requirement 19.1) */
exports.ENGAGEMENT_HISTORY_DAYS = 90;
/** Minimum suggested users (Requirement 19.4) */
exports.MIN_SUGGESTED_USERS = 5;
/** Maximum suggested users (Requirement 19.4) */
exports.MAX_SUGGESTED_USERS = 10;
/** Maximum percentage of recommendations from a single creator (Requirement 19.5) */
exports.MAX_SINGLE_CREATOR_PERCENTAGE = 0.2;
/** Minimum interactions before personalized recommendations (Requirement 19.6) */
exports.MIN_INTERACTIONS_FOR_PERSONALIZED = 5;
/** Timeout for recommendation generation in milliseconds (Requirement 19.7) */
exports.RECOMMENDATION_TIMEOUT_MS = 3000;
// ─── Service ────────────────────────────────────────────────────────────────
class RecommendationService {
    repository;
    cacheGet;
    cacheSet;
    cacheInvalidate;
    getTrendingPostIds;
    constructor(deps) {
        this.repository = deps?.repository || new feed_repository_1.FeedRepository();
        this.cacheGet = deps?.cacheGet || redis_utils_1.getCachedRecommendations;
        this.cacheSet = deps?.cacheSet || redis_utils_1.cacheRecommendations;
        this.cacheInvalidate = deps?.cacheInvalidate || redis_utils_1.invalidateRecommendations;
        this.getTrendingPostIds = deps?.getTrendingPostIds || (async () => []);
    }
    /**
     * Get content recommendations for the explore page.
     *
     * Requirement 19.1: Generate 20-50 content recommendations based on 90-day engagement history.
     * Requirement 19.2: 1-hour refresh cycle (via Redis cache with 1-hour TTL).
     * Requirement 19.5: Max 20% from single creator.
     * Requirement 19.6: Fallback to trending for users with < 5 interactions.
     * Requirement 19.7: 3-second timeout fallback to trending content.
     */
    async getRecommendations(userId) {
        if (!userId || userId <= 0) {
            return this.getTrendingFallback();
        }
        // Check cache first (Requirement 19.2: 1-hour refresh cycle)
        try {
            const cached = await this.cacheGet(String(userId));
            if (cached && cached.length > 0) {
                const posts = await this.fetchPostsByIds(cached.map(Number));
                return posts;
            }
        }
        catch {
            // Cache miss or error, proceed to generate
        }
        // Apply 3-second timeout (Requirement 19.7)
        try {
            const recommendations = await this.withTimeout(this.generateRecommendations(userId), exports.RECOMMENDATION_TIMEOUT_MS);
            return recommendations;
        }
        catch {
            // Timeout or error: fallback to trending (Requirement 19.7)
            return this.getTrendingFallback();
        }
    }
    /**
     * Get suggested users to follow.
     *
     * Requirement 19.4: Suggest 5-10 users based on mutual connections and content overlap.
     */
    async getSuggestedUsers(userId) {
        if (!userId || userId <= 0) {
            return [];
        }
        try {
            const suggestions = await this.withTimeout(this.generateUserSuggestions(userId), exports.RECOMMENDATION_TIMEOUT_MS);
            return suggestions;
        }
        catch {
            return [];
        }
    }
    /**
     * Invalidate recommendations for a user (e.g., when they follow a new account).
     * Requirement 19.3: Adjust recommendations within the next refresh cycle.
     */
    async invalidateUserRecommendations(userId) {
        await this.cacheInvalidate(String(userId));
    }
    /**
     * Generate personalized content recommendations.
     */
    async generateRecommendations(userId) {
        // Get user's engagement history from last 90 days (Requirement 19.1)
        const interestSignals = await this.repository.getUserInterestSignals(userId, exports.ENGAGEMENT_HISTORY_DAYS);
        // Requirement 19.6: Fallback for users with fewer than 5 interactions
        if (interestSignals.length < exports.MIN_INTERACTIONS_FOR_PERSONALIZED) {
            return this.getTrendingFallback();
        }
        // Get blocked users to exclude
        const blockedIds = await this.repository.getBlockedUserIds(userId);
        const blockedSet = new Set(blockedIds);
        // Get authors the user has interacted with
        const interactedAuthorIds = [
            ...new Set(interestSignals.map((s) => s.target_user_id)),
        ];
        // Get content from interacted authors and similar authors
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - exports.ENGAGEMENT_HISTORY_DAYS);
        // Fetch candidate posts from authors the user has engaged with
        const candidatePosts = await this.repository.getPostsFromAuthors(interactedAuthorIds.filter((id) => !blockedSet.has(id)), sinceDate, [], exports.MAX_RECOMMENDATIONS * 3);
        // Also fetch trending posts to mix in
        const trendingPosts = await this.repository.getTrendingPosts(sinceDate, [], blockedIds, exports.MAX_RECOMMENDATIONS);
        // Combine and deduplicate
        const seenIds = new Set();
        const allCandidates = [];
        for (const post of candidatePosts) {
            if (!seenIds.has(post.id) && !blockedSet.has(post.user_id) && post.user_id !== userId) {
                seenIds.add(post.id);
                allCandidates.push(post);
            }
        }
        for (const post of trendingPosts) {
            if (!seenIds.has(post.id) && !blockedSet.has(post.user_id) && post.user_id !== userId) {
                seenIds.add(post.id);
                allCandidates.push(post);
            }
        }
        // Score and rank candidates
        const scored = this.scoreRecommendations(allCandidates, interestSignals);
        // Apply diversity constraint (Requirement 19.5)
        const diverse = this.applyDiversityConstraint(scored);
        // Clamp to 20-50 range (Requirement 19.1)
        const finalCount = Math.max(exports.MIN_RECOMMENDATIONS, Math.min(exports.MAX_RECOMMENDATIONS, diverse.length));
        const recommendations = diverse.slice(0, finalCount);
        // Cache results (Requirement 19.2: 1-hour TTL handled by Redis utility)
        if (recommendations.length > 0) {
            const postIds = recommendations.map((p) => String(p.id));
            await this.cacheSet(String(userId), postIds);
        }
        return recommendations;
    }
    /**
     * Score recommendation candidates based on engagement signals.
     */
    scoreRecommendations(posts, signals) {
        if (posts.length === 0)
            return [];
        const now = Date.now();
        // Build author weight map from interest signals
        const authorWeights = new Map();
        for (const signal of signals) {
            const existing = authorWeights.get(signal.target_user_id) || 0;
            authorWeights.set(signal.target_user_id, existing + signal.weight);
        }
        const scored = posts.map((post) => {
            // Engagement score
            const engagementScore = Math.log(1 +
                (post.like_count || 0) +
                (post.comment_count || 0) * 2 +
                (post.share_count || 0) * 3);
            // Recency score (decay over 90 days)
            const ageMs = now - new Date(post.created_at).getTime();
            const maxAgeMs = exports.ENGAGEMENT_HISTORY_DAYS * 24 * 60 * 60 * 1000;
            const recencyScore = Math.max(0, 1 - ageMs / maxAgeMs);
            // Author affinity score
            const authorWeight = authorWeights.get(post.user_id) || 0;
            const affinityBoost = authorWeight > 0 ? 1 + Math.log(1 + authorWeight) : 1;
            const totalScore = (engagementScore + recencyScore * 3) * affinityBoost;
            return { ...post, score: totalScore };
        });
        scored.sort((a, b) => (b.score || 0) - (a.score || 0));
        return scored;
    }
    /**
     * Apply diversity constraint: max 20% of recommendations from a single creator.
     * Requirement 19.5.
     */
    applyDiversityConstraint(posts) {
        if (posts.length === 0)
            return [];
        const targetCount = Math.min(posts.length, exports.MAX_RECOMMENDATIONS);
        const maxPerCreator = Math.max(1, Math.floor(targetCount * exports.MAX_SINGLE_CREATOR_PERCENTAGE));
        const creatorCounts = new Map();
        const result = [];
        for (const post of posts) {
            const currentCount = creatorCounts.get(post.user_id) || 0;
            if (currentCount < maxPerCreator) {
                result.push(post);
                creatorCounts.set(post.user_id, currentCount + 1);
            }
            if (result.length >= exports.MAX_RECOMMENDATIONS) {
                break;
            }
        }
        return result;
    }
    /**
     * Generate user suggestions based on mutual connections and content overlap.
     * Requirement 19.4.
     */
    async generateUserSuggestions(userId) {
        const db = this.repository.getDb();
        // Get user's friends and followed users
        const [friendIds, followedIds, blockedIds] = await Promise.all([
            this.repository.getFriendIds(userId),
            this.repository.getFollowedUserIds(userId),
            this.repository.getBlockedUserIds(userId),
        ]);
        const existingConnections = new Set([...friendIds, ...followedIds, userId]);
        const blockedSet = new Set(blockedIds);
        // Find users who are friends-of-friends (mutual connections)
        const mutualCandidates = await this.findMutualConnectionCandidates(db, friendIds, existingConnections, blockedSet);
        // Get user's interest signals for content overlap scoring
        const userSignals = await this.repository.getUserInterestSignals(userId, exports.ENGAGEMENT_HISTORY_DAYS);
        // Score candidates
        const scored = this.scoreUserCandidates(mutualCandidates, userSignals);
        // Return 5-10 suggestions (Requirement 19.4)
        const count = Math.max(exports.MIN_SUGGESTED_USERS, Math.min(exports.MAX_SUGGESTED_USERS, scored.length));
        return scored.slice(0, count);
    }
    /**
     * Find candidate users through mutual connections (friends-of-friends).
     */
    async findMutualConnectionCandidates(db, friendIds, existingConnections, blockedSet) {
        if (friendIds.length === 0) {
            // If no friends, suggest popular users
            const popularUsers = await db('users')
                .whereNull('deleted_at')
                .whereNotIn('id', [...existingConnections, ...blockedSet])
                .orderByRaw('(SELECT COUNT(*) FROM follows WHERE followed_id = users.id) DESC')
                .limit(exports.MAX_SUGGESTED_USERS * 2)
                .select('id', 'username', 'display_name', 'avatar_url');
            return popularUsers.map((u) => ({
                id: u.id,
                username: u.username,
                display_name: u.display_name,
                avatar_url: u.avatar_url,
                mutual_friends_count: 0,
                content_overlap_score: 0,
            }));
        }
        // Find friends-of-friends with mutual count
        const candidates = await db('friendships')
            .whereIn('user_id_1', friendIds)
            .orWhereIn('user_id_2', friendIds)
            .select('user_id_1', 'user_id_2');
        // Count mutual friends for each candidate
        const mutualCounts = new Map();
        for (const row of candidates) {
            const candidateId = friendIds.includes(row.user_id_1) ? row.user_id_2 : row.user_id_1;
            if (!existingConnections.has(candidateId) && !blockedSet.has(candidateId)) {
                mutualCounts.set(candidateId, (mutualCounts.get(candidateId) || 0) + 1);
            }
        }
        if (mutualCounts.size === 0) {
            return [];
        }
        // Fetch user details for top candidates
        const topCandidateIds = [...mutualCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, exports.MAX_SUGGESTED_USERS * 2)
            .map(([id]) => id);
        const users = await db('users')
            .whereIn('id', topCandidateIds)
            .whereNull('deleted_at')
            .select('id', 'username', 'display_name', 'avatar_url');
        return users.map((u) => ({
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            avatar_url: u.avatar_url,
            mutual_friends_count: mutualCounts.get(u.id) || 0,
            content_overlap_score: 0,
        }));
    }
    /**
     * Score user candidates based on mutual connections and content overlap.
     */
    scoreUserCandidates(candidates, userSignals) {
        if (candidates.length === 0)
            return [];
        // Build set of authors the user has interacted with
        const interactedAuthors = new Set(userSignals.map((s) => s.target_user_id));
        const scored = candidates.map((candidate) => {
            // Content overlap: does this candidate create content the user engages with?
            const contentOverlap = interactedAuthors.has(candidate.id) ? 1 : 0;
            return {
                ...candidate,
                content_overlap_score: contentOverlap,
                // Combined score for sorting
                _score: candidate.mutual_friends_count * 2 + contentOverlap,
            };
        });
        scored.sort((a, b) => b._score - a._score);
        // Remove internal scoring field
        return scored.map(({ ...rest }) => {
            const { _score, ...user } = rest;
            return user;
        });
    }
    /**
     * Fallback to trending content (Requirement 19.6, 19.7).
     */
    async getTrendingFallback() {
        try {
            // Try to get trending post IDs from Redis
            const trendingIds = await this.getTrendingPostIds(exports.MAX_RECOMMENDATIONS);
            if (trendingIds.length > 0) {
                const posts = await this.fetchPostsByIds(trendingIds.map(Number));
                return posts.slice(0, exports.MAX_RECOMMENDATIONS);
            }
            // If no cached trending, fetch from DB
            const sinceDate = new Date();
            sinceDate.setDate(sinceDate.getDate() - 7); // Last 7 days for trending
            const trendingPosts = await this.repository.getTrendingPosts(sinceDate, [], [], exports.MAX_RECOMMENDATIONS);
            return trendingPosts;
        }
        catch {
            return [];
        }
    }
    /**
     * Fetch posts by their IDs, preserving order.
     */
    async fetchPostsByIds(postIds) {
        if (postIds.length === 0)
            return [];
        const db = this.repository.getDb();
        const posts = (await db('posts')
            .whereIn('id', postIds)
            .whereNull('deleted_at')
            .select('*'));
        // Preserve input order
        const postMap = new Map(posts.map((p) => [p.id, p]));
        return postIds
            .map((id) => postMap.get(id))
            .filter((p) => p !== undefined);
    }
    /**
     * Execute a promise with a timeout.
     * Requirement 19.7: 3-second timeout fallback.
     */
    withTimeout(promise, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Operation timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            promise
                .then((result) => {
                clearTimeout(timer);
                resolve(result);
            })
                .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }
}
exports.RecommendationService = RecommendationService;
//# sourceMappingURL=recommendation.service.js.map