/**
 * Redis key pattern helpers for the Frero platform.
 * All key patterns follow the design document conventions.
 */

/** TTL values in seconds */
export const RedisTTL = {
  /** Refresh token session - 7 days */
  SESSION: 7 * 24 * 60 * 60,
  /** Rate limiting window - 1 minute */
  RATE_LIMIT: 60,
  /** Failed login attempts tracking - 15 minutes */
  LOGIN_ATTEMPTS: 15 * 60,
  /** Cached feed results - 5 minutes */
  FEED: 5 * 60,
  /** Cached engagement counts - 30 seconds */
  ENGAGEMENT: 30,
  /** Online presence heartbeat - 90 seconds */
  ONLINE: 90,
  /** Typing indicator - 5 seconds */
  TYPING: 5,
  /** Trending posts - 5 minutes */
  TRENDING_POSTS: 5 * 60,
  /** Trending hashtags - 5 minutes */
  TRENDING_HASHTAGS: 5 * 60,
  /** Cached AI recommendations - 1 hour */
  RECOMMENDATIONS: 60 * 60,
} as const;

/** Redis key builders */
export const RedisKeys = {
  /** session:{userId}:{tokenId} - Refresh token storage */
  session(userId: string, tokenId: string): string {
    return `session:${userId}:${tokenId}`;
  },

  /** rate_limit:{userId} - Authenticated user rate limiting */
  rateLimit(userId: string): string {
    return `rate_limit:${userId}`;
  },

  /** rate_limit:ip:{ip} - IP-based rate limiting */
  rateLimitIp(ip: string): string {
    return `rate_limit:ip:${ip}`;
  },

  /** login_attempts:{userId} - Failed login attempt counter */
  loginAttempts(userId: string): string {
    return `login_attempts:${userId}`;
  },

  /** feed:{userId} - Cached feed results */
  feed(userId: string): string {
    return `feed:${userId}`;
  },

  /** engagement:{postId} - Cached engagement counts */
  engagement(postId: string): string {
    return `engagement:${postId}`;
  },

  /** online:{userId} - Online presence heartbeat */
  online(userId: string): string {
    return `online:${userId}`;
  },

  /** typing:{chatId}:{userId} - Typing indicator */
  typing(chatId: string, userId: string): string {
    return `typing:${chatId}:${userId}`;
  },

  /** trending:posts - Trending post IDs sorted set */
  trendingPosts(): string {
    return 'trending:posts';
  },

  /** trending:hashtags - Trending hashtag IDs sorted set */
  trendingHashtags(): string {
    return 'trending:hashtags';
  },

  /** recommendations:{userId} - Cached AI recommendations */
  recommendations(userId: string): string {
    return `recommendations:${userId}`;
  },
} as const;
