import { getRedisClient } from '../config/redis';
import { RedisKeys, RedisTTL } from './redis-keys';

// ─── Session Storage ────────────────────────────────────────────────────────

/**
 * Store a refresh token session in Redis.
 */
export async function storeSession(
  userId: string,
  tokenId: string,
  tokenData: string,
  ttlSeconds: number = RedisTTL.SESSION,
): Promise<void> {
  const redis = getRedisClient();
  const key = RedisKeys.session(userId, tokenId);
  await redis.set(key, tokenData, 'EX', ttlSeconds);
}

/**
 * Retrieve a refresh token session from Redis.
 */
export async function getSession(userId: string, tokenId: string): Promise<string | null> {
  const redis = getRedisClient();
  const key = RedisKeys.session(userId, tokenId);
  return redis.get(key);
}

/**
 * Invalidate (delete) a refresh token session.
 */
export async function deleteSession(userId: string, tokenId: string): Promise<void> {
  const redis = getRedisClient();
  const key = RedisKeys.session(userId, tokenId);
  await redis.del(key);
}

/**
 * Invalidate all sessions for a user by scanning for matching keys.
 */
export async function deleteAllUserSessions(userId: string): Promise<void> {
  const redis = getRedisClient();
  const pattern = `session:${userId}:*`;
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== '0');
}

// ─── Rate Limiting ──────────────────────────────────────────────────────────

/**
 * Check and increment rate limit for an authenticated user using sliding window.
 * Returns the current request count within the window.
 */
export async function checkRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number = RedisTTL.RATE_LIMIT * 1000,
): Promise<{ allowed: boolean; current: number; remaining: number; resetAt: number }> {
  const redis = getRedisClient();
  const key = RedisKeys.rateLimit(identifier);
  const now = Date.now();
  const windowStart = now - windowMs;

  const pipeline = redis.pipeline();
  // Remove expired entries
  pipeline.zremrangebyscore(key, 0, windowStart);
  // Add current request
  pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`);
  // Count requests in window
  pipeline.zcard(key);
  // Set expiry on the key
  pipeline.pexpire(key, windowMs);

  const results = await pipeline.exec();
  const current = (results?.[2]?.[1] as number) || 0;
  const allowed = current <= maxRequests;
  const remaining = Math.max(0, maxRequests - current);
  const resetAt = now + windowMs;

  return { allowed, current, remaining, resetAt };
}

/**
 * Check and increment rate limit for an IP address using sliding window.
 */
export async function checkIpRateLimit(
  ip: string,
  maxRequests: number,
  windowMs: number = RedisTTL.RATE_LIMIT * 1000,
): Promise<{ allowed: boolean; current: number; remaining: number; resetAt: number }> {
  const redis = getRedisClient();
  const key = RedisKeys.rateLimitIp(ip);
  const now = Date.now();
  const windowStart = now - windowMs;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`);
  pipeline.zcard(key);
  pipeline.pexpire(key, windowMs);

  const results = await pipeline.exec();
  const current = (results?.[2]?.[1] as number) || 0;
  const allowed = current <= maxRequests;
  const remaining = Math.max(0, maxRequests - current);
  const resetAt = now + windowMs;

  return { allowed, current, remaining, resetAt };
}

// ─── Login Attempts ─────────────────────────────────────────────────────────

/**
 * Increment failed login attempts for a user.
 * Returns the current count after increment.
 */
export async function incrementLoginAttempts(userId: string): Promise<number> {
  const redis = getRedisClient();
  const key = RedisKeys.loginAttempts(userId);
  const count = await redis.incr(key);
  // Set TTL only on first attempt (when count becomes 1)
  if (count === 1) {
    await redis.expire(key, RedisTTL.LOGIN_ATTEMPTS);
  }
  return count;
}

/**
 * Get the current failed login attempt count for a user.
 */
export async function getLoginAttempts(userId: string): Promise<number> {
  const redis = getRedisClient();
  const key = RedisKeys.loginAttempts(userId);
  const count = await redis.get(key);
  return count ? parseInt(count, 10) : 0;
}

/**
 * Reset failed login attempts for a user (on successful login).
 */
export async function resetLoginAttempts(userId: string): Promise<void> {
  const redis = getRedisClient();
  const key = RedisKeys.loginAttempts(userId);
  await redis.del(key);
}

// ─── Caching ────────────────────────────────────────────────────────────────

/**
 * Cache feed results for a user.
 */
export async function cacheFeed(userId: string, postIds: string[]): Promise<void> {
  const redis = getRedisClient();
  const key = RedisKeys.feed(userId);
  const pipeline = redis.pipeline();
  pipeline.del(key);
  if (postIds.length > 0) {
    pipeline.rpush(key, ...postIds);
  }
  pipeline.expire(key, RedisTTL.FEED);
  await pipeline.exec();
}

/**
 * Get cached feed results for a user.
 */
export async function getCachedFeed(userId: string): Promise<string[] | null> {
  const redis = getRedisClient();
  const key = RedisKeys.feed(userId);
  const exists = await redis.exists(key);
  if (!exists) return null;
  return redis.lrange(key, 0, -1);
}

/**
 * Invalidate cached feed for a user.
 */
export async function invalidateFeed(userId: string): Promise<void> {
  const redis = getRedisClient();
  const key = RedisKeys.feed(userId);
  await redis.del(key);
}

/**
 * Cache engagement counts for a post.
 */
export async function cacheEngagement(
  postId: string,
  counts: { likes: number; comments: number; shares: number },
): Promise<void> {
  const redis = getRedisClient();
  const key = RedisKeys.engagement(postId);
  await redis.hmset(key, {
    likes: counts.likes.toString(),
    comments: counts.comments.toString(),
    shares: counts.shares.toString(),
  });
  await redis.expire(key, RedisTTL.ENGAGEMENT);
}

/**
 * Get cached engagement counts for a post.
 */
export async function getCachedEngagement(
  postId: string,
): Promise<{ likes: number; comments: number; shares: number } | null> {
  const redis = getRedisClient();
  const key = RedisKeys.engagement(postId);
  const data = await redis.hgetall(key);
  if (!data || Object.keys(data).length === 0) return null;
  return {
    likes: parseInt(data.likes || '0', 10),
    comments: parseInt(data.comments || '0', 10),
    shares: parseInt(data.shares || '0', 10),
  };
}

// ─── Online Presence ────────────────────────────────────────────────────────

/**
 * Set a user as online (heartbeat).
 */
export async function setOnline(userId: string): Promise<void> {
  const redis = getRedisClient();
  const key = RedisKeys.online(userId);
  await redis.set(key, '1', 'EX', RedisTTL.ONLINE);
}

/**
 * Check if a user is online.
 */
export async function isOnline(userId: string): Promise<boolean> {
  const redis = getRedisClient();
  const key = RedisKeys.online(userId);
  const result = await redis.exists(key);
  return result === 1;
}

/**
 * Set a user as offline (remove presence key).
 */
export async function setOffline(userId: string): Promise<void> {
  const redis = getRedisClient();
  const key = RedisKeys.online(userId);
  await redis.del(key);
}

// ─── Typing Indicators ──────────────────────────────────────────────────────

/**
 * Set typing indicator for a user in a chat.
 */
export async function setTyping(chatId: string, userId: string): Promise<void> {
  const redis = getRedisClient();
  const key = RedisKeys.typing(chatId, userId);
  await redis.set(key, '1', 'EX', RedisTTL.TYPING);
}

/**
 * Clear typing indicator for a user in a chat.
 */
export async function clearTyping(chatId: string, userId: string): Promise<void> {
  const redis = getRedisClient();
  const key = RedisKeys.typing(chatId, userId);
  await redis.del(key);
}

/**
 * Check if a user is typing in a chat.
 */
export async function isTyping(chatId: string, userId: string): Promise<boolean> {
  const redis = getRedisClient();
  const key = RedisKeys.typing(chatId, userId);
  const result = await redis.exists(key);
  return result === 1;
}

// ─── Trending ───────────────────────────────────────────────────────────────

/**
 * Update trending posts sorted set.
 */
export async function updateTrendingPosts(
  posts: Array<{ id: string; score: number }>,
): Promise<void> {
  const redis = getRedisClient();
  const key = RedisKeys.trendingPosts();
  const pipeline = redis.pipeline();
  pipeline.del(key);
  for (const post of posts) {
    pipeline.zadd(key, post.score.toString(), post.id);
  }
  pipeline.expire(key, RedisTTL.TRENDING_POSTS);
  await pipeline.exec();
}

/**
 * Get trending post IDs (highest score first).
 */
export async function getTrendingPosts(limit: number = 10): Promise<string[]> {
  const redis = getRedisClient();
  const key = RedisKeys.trendingPosts();
  return redis.zrevrange(key, 0, limit - 1);
}

/**
 * Update trending hashtags sorted set.
 */
export async function updateTrendingHashtags(
  hashtags: Array<{ id: string; score: number }>,
): Promise<void> {
  const redis = getRedisClient();
  const key = RedisKeys.trendingHashtags();
  const pipeline = redis.pipeline();
  pipeline.del(key);
  for (const hashtag of hashtags) {
    pipeline.zadd(key, hashtag.score.toString(), hashtag.id);
  }
  pipeline.expire(key, RedisTTL.TRENDING_HASHTAGS);
  await pipeline.exec();
}

/**
 * Get trending hashtag IDs (highest score first).
 */
export async function getTrendingHashtags(limit: number = 10): Promise<string[]> {
  const redis = getRedisClient();
  const key = RedisKeys.trendingHashtags();
  return redis.zrevrange(key, 0, limit - 1);
}

// ─── Recommendations ────────────────────────────────────────────────────────

/**
 * Cache AI recommendations for a user.
 */
export async function cacheRecommendations(userId: string, postIds: string[]): Promise<void> {
  const redis = getRedisClient();
  const key = RedisKeys.recommendations(userId);
  const pipeline = redis.pipeline();
  pipeline.del(key);
  if (postIds.length > 0) {
    pipeline.rpush(key, ...postIds);
  }
  pipeline.expire(key, RedisTTL.RECOMMENDATIONS);
  await pipeline.exec();
}

/**
 * Get cached AI recommendations for a user.
 */
export async function getCachedRecommendations(userId: string): Promise<string[] | null> {
  const redis = getRedisClient();
  const key = RedisKeys.recommendations(userId);
  const exists = await redis.exists(key);
  if (!exists) return null;
  return redis.lrange(key, 0, -1);
}

/**
 * Invalidate cached recommendations for a user.
 */
export async function invalidateRecommendations(userId: string): Promise<void> {
  const redis = getRedisClient();
  const key = RedisKeys.recommendations(userId);
  await redis.del(key);
}
