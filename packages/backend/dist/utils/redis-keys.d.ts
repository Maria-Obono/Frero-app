/**
 * Redis key pattern helpers for the Frero platform.
 * All key patterns follow the design document conventions.
 */
/** TTL values in seconds */
export declare const RedisTTL: {
    /** Refresh token session - 7 days */
    readonly SESSION: number;
    /** Rate limiting window - 1 minute */
    readonly RATE_LIMIT: 60;
    /** Failed login attempts tracking - 15 minutes */
    readonly LOGIN_ATTEMPTS: number;
    /** Cached feed results - 5 minutes */
    readonly FEED: number;
    /** Cached engagement counts - 30 seconds */
    readonly ENGAGEMENT: 30;
    /** Online presence heartbeat - 90 seconds */
    readonly ONLINE: 90;
    /** Typing indicator - 5 seconds */
    readonly TYPING: 5;
    /** Trending posts - 5 minutes */
    readonly TRENDING_POSTS: number;
    /** Trending hashtags - 5 minutes */
    readonly TRENDING_HASHTAGS: number;
    /** Cached AI recommendations - 1 hour */
    readonly RECOMMENDATIONS: number;
};
/** Redis key builders */
export declare const RedisKeys: {
    /** session:{userId}:{tokenId} - Refresh token storage */
    readonly session: (userId: string, tokenId: string) => string;
    /** rate_limit:{userId} - Authenticated user rate limiting */
    readonly rateLimit: (userId: string) => string;
    /** rate_limit:ip:{ip} - IP-based rate limiting */
    readonly rateLimitIp: (ip: string) => string;
    /** login_attempts:{userId} - Failed login attempt counter */
    readonly loginAttempts: (userId: string) => string;
    /** feed:{userId} - Cached feed results */
    readonly feed: (userId: string) => string;
    /** engagement:{postId} - Cached engagement counts */
    readonly engagement: (postId: string) => string;
    /** online:{userId} - Online presence heartbeat */
    readonly online: (userId: string) => string;
    /** typing:{chatId}:{userId} - Typing indicator */
    readonly typing: (chatId: string, userId: string) => string;
    /** trending:posts - Trending post IDs sorted set */
    readonly trendingPosts: () => string;
    /** trending:hashtags - Trending hashtag IDs sorted set */
    readonly trendingHashtags: () => string;
    /** recommendations:{userId} - Cached AI recommendations */
    readonly recommendations: (userId: string) => string;
};
//# sourceMappingURL=redis-keys.d.ts.map