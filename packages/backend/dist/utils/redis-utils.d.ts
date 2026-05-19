/**
 * Store a refresh token session in Redis.
 */
export declare function storeSession(userId: string, tokenId: string, tokenData: string, ttlSeconds?: number): Promise<void>;
/**
 * Retrieve a refresh token session from Redis.
 */
export declare function getSession(userId: string, tokenId: string): Promise<string | null>;
/**
 * Invalidate (delete) a refresh token session.
 */
export declare function deleteSession(userId: string, tokenId: string): Promise<void>;
/**
 * Invalidate all sessions for a user by scanning for matching keys.
 */
export declare function deleteAllUserSessions(userId: string): Promise<void>;
/**
 * Check and increment rate limit for an authenticated user using sliding window.
 * Returns the current request count within the window.
 */
export declare function checkRateLimit(identifier: string, maxRequests: number, windowMs?: number): Promise<{
    allowed: boolean;
    current: number;
    remaining: number;
    resetAt: number;
}>;
/**
 * Check and increment rate limit for an IP address using sliding window.
 */
export declare function checkIpRateLimit(ip: string, maxRequests: number, windowMs?: number): Promise<{
    allowed: boolean;
    current: number;
    remaining: number;
    resetAt: number;
}>;
/**
 * Increment failed login attempts for a user.
 * Returns the current count after increment.
 */
export declare function incrementLoginAttempts(userId: string): Promise<number>;
/**
 * Get the current failed login attempt count for a user.
 */
export declare function getLoginAttempts(userId: string): Promise<number>;
/**
 * Reset failed login attempts for a user (on successful login).
 */
export declare function resetLoginAttempts(userId: string): Promise<void>;
/**
 * Cache feed results for a user.
 */
export declare function cacheFeed(userId: string, postIds: string[]): Promise<void>;
/**
 * Get cached feed results for a user.
 */
export declare function getCachedFeed(userId: string): Promise<string[] | null>;
/**
 * Invalidate cached feed for a user.
 */
export declare function invalidateFeed(userId: string): Promise<void>;
/**
 * Cache engagement counts for a post.
 */
export declare function cacheEngagement(postId: string, counts: {
    likes: number;
    comments: number;
    shares: number;
}): Promise<void>;
/**
 * Get cached engagement counts for a post.
 */
export declare function getCachedEngagement(postId: string): Promise<{
    likes: number;
    comments: number;
    shares: number;
} | null>;
/**
 * Set a user as online (heartbeat).
 */
export declare function setOnline(userId: string): Promise<void>;
/**
 * Check if a user is online.
 */
export declare function isOnline(userId: string): Promise<boolean>;
/**
 * Set a user as offline (remove presence key).
 */
export declare function setOffline(userId: string): Promise<void>;
/**
 * Set typing indicator for a user in a chat.
 */
export declare function setTyping(chatId: string, userId: string): Promise<void>;
/**
 * Clear typing indicator for a user in a chat.
 */
export declare function clearTyping(chatId: string, userId: string): Promise<void>;
/**
 * Check if a user is typing in a chat.
 */
export declare function isTyping(chatId: string, userId: string): Promise<boolean>;
/**
 * Update trending posts sorted set.
 */
export declare function updateTrendingPosts(posts: Array<{
    id: string;
    score: number;
}>): Promise<void>;
/**
 * Get trending post IDs (highest score first).
 */
export declare function getTrendingPosts(limit?: number): Promise<string[]>;
/**
 * Update trending hashtags sorted set.
 */
export declare function updateTrendingHashtags(hashtags: Array<{
    id: string;
    score: number;
}>): Promise<void>;
/**
 * Get trending hashtag IDs (highest score first).
 */
export declare function getTrendingHashtags(limit?: number): Promise<string[]>;
/**
 * Cache AI recommendations for a user.
 */
export declare function cacheRecommendations(userId: string, postIds: string[]): Promise<void>;
/**
 * Get cached AI recommendations for a user.
 */
export declare function getCachedRecommendations(userId: string): Promise<string[] | null>;
/**
 * Invalidate cached recommendations for a user.
 */
export declare function invalidateRecommendations(userId: string): Promise<void>;
//# sourceMappingURL=redis-utils.d.ts.map