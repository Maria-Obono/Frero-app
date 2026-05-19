"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeSession = storeSession;
exports.getSession = getSession;
exports.deleteSession = deleteSession;
exports.deleteAllUserSessions = deleteAllUserSessions;
exports.checkRateLimit = checkRateLimit;
exports.checkIpRateLimit = checkIpRateLimit;
exports.incrementLoginAttempts = incrementLoginAttempts;
exports.getLoginAttempts = getLoginAttempts;
exports.resetLoginAttempts = resetLoginAttempts;
exports.cacheFeed = cacheFeed;
exports.getCachedFeed = getCachedFeed;
exports.invalidateFeed = invalidateFeed;
exports.cacheEngagement = cacheEngagement;
exports.getCachedEngagement = getCachedEngagement;
exports.setOnline = setOnline;
exports.isOnline = isOnline;
exports.setOffline = setOffline;
exports.setTyping = setTyping;
exports.clearTyping = clearTyping;
exports.isTyping = isTyping;
exports.updateTrendingPosts = updateTrendingPosts;
exports.getTrendingPosts = getTrendingPosts;
exports.updateTrendingHashtags = updateTrendingHashtags;
exports.getTrendingHashtags = getTrendingHashtags;
exports.cacheRecommendations = cacheRecommendations;
exports.getCachedRecommendations = getCachedRecommendations;
exports.invalidateRecommendations = invalidateRecommendations;
const redis_1 = require("../config/redis");
const redis_keys_1 = require("./redis-keys");
// ─── Session Storage ────────────────────────────────────────────────────────
/**
 * Store a refresh token session in Redis.
 */
async function storeSession(userId, tokenId, tokenData, ttlSeconds = redis_keys_1.RedisTTL.SESSION) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.session(userId, tokenId);
    await redis.set(key, tokenData, 'EX', ttlSeconds);
}
/**
 * Retrieve a refresh token session from Redis.
 */
async function getSession(userId, tokenId) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.session(userId, tokenId);
    return redis.get(key);
}
/**
 * Invalidate (delete) a refresh token session.
 */
async function deleteSession(userId, tokenId) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.session(userId, tokenId);
    await redis.del(key);
}
/**
 * Invalidate all sessions for a user by scanning for matching keys.
 */
async function deleteAllUserSessions(userId) {
    const redis = (0, redis_1.getRedisClient)();
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
async function checkRateLimit(identifier, maxRequests, windowMs = redis_keys_1.RedisTTL.RATE_LIMIT * 1000) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.rateLimit(identifier);
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
    const current = results?.[2]?.[1] || 0;
    const allowed = current <= maxRequests;
    const remaining = Math.max(0, maxRequests - current);
    const resetAt = now + windowMs;
    return { allowed, current, remaining, resetAt };
}
/**
 * Check and increment rate limit for an IP address using sliding window.
 */
async function checkIpRateLimit(ip, maxRequests, windowMs = redis_keys_1.RedisTTL.RATE_LIMIT * 1000) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.rateLimitIp(ip);
    const now = Date.now();
    const windowStart = now - windowMs;
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`);
    pipeline.zcard(key);
    pipeline.pexpire(key, windowMs);
    const results = await pipeline.exec();
    const current = results?.[2]?.[1] || 0;
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
async function incrementLoginAttempts(userId) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.loginAttempts(userId);
    const count = await redis.incr(key);
    // Set TTL only on first attempt (when count becomes 1)
    if (count === 1) {
        await redis.expire(key, redis_keys_1.RedisTTL.LOGIN_ATTEMPTS);
    }
    return count;
}
/**
 * Get the current failed login attempt count for a user.
 */
async function getLoginAttempts(userId) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.loginAttempts(userId);
    const count = await redis.get(key);
    return count ? parseInt(count, 10) : 0;
}
/**
 * Reset failed login attempts for a user (on successful login).
 */
async function resetLoginAttempts(userId) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.loginAttempts(userId);
    await redis.del(key);
}
// ─── Caching ────────────────────────────────────────────────────────────────
/**
 * Cache feed results for a user.
 */
async function cacheFeed(userId, postIds) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.feed(userId);
    const pipeline = redis.pipeline();
    pipeline.del(key);
    if (postIds.length > 0) {
        pipeline.rpush(key, ...postIds);
    }
    pipeline.expire(key, redis_keys_1.RedisTTL.FEED);
    await pipeline.exec();
}
/**
 * Get cached feed results for a user.
 */
async function getCachedFeed(userId) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.feed(userId);
    const exists = await redis.exists(key);
    if (!exists)
        return null;
    return redis.lrange(key, 0, -1);
}
/**
 * Invalidate cached feed for a user.
 */
async function invalidateFeed(userId) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.feed(userId);
    await redis.del(key);
}
/**
 * Cache engagement counts for a post.
 */
async function cacheEngagement(postId, counts) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.engagement(postId);
    await redis.hmset(key, {
        likes: counts.likes.toString(),
        comments: counts.comments.toString(),
        shares: counts.shares.toString(),
    });
    await redis.expire(key, redis_keys_1.RedisTTL.ENGAGEMENT);
}
/**
 * Get cached engagement counts for a post.
 */
async function getCachedEngagement(postId) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.engagement(postId);
    const data = await redis.hgetall(key);
    if (!data || Object.keys(data).length === 0)
        return null;
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
async function setOnline(userId) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.online(userId);
    await redis.set(key, '1', 'EX', redis_keys_1.RedisTTL.ONLINE);
}
/**
 * Check if a user is online.
 */
async function isOnline(userId) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.online(userId);
    const result = await redis.exists(key);
    return result === 1;
}
/**
 * Set a user as offline (remove presence key).
 */
async function setOffline(userId) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.online(userId);
    await redis.del(key);
}
// ─── Typing Indicators ──────────────────────────────────────────────────────
/**
 * Set typing indicator for a user in a chat.
 */
async function setTyping(chatId, userId) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.typing(chatId, userId);
    await redis.set(key, '1', 'EX', redis_keys_1.RedisTTL.TYPING);
}
/**
 * Clear typing indicator for a user in a chat.
 */
async function clearTyping(chatId, userId) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.typing(chatId, userId);
    await redis.del(key);
}
/**
 * Check if a user is typing in a chat.
 */
async function isTyping(chatId, userId) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.typing(chatId, userId);
    const result = await redis.exists(key);
    return result === 1;
}
// ─── Trending ───────────────────────────────────────────────────────────────
/**
 * Update trending posts sorted set.
 */
async function updateTrendingPosts(posts) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.trendingPosts();
    const pipeline = redis.pipeline();
    pipeline.del(key);
    for (const post of posts) {
        pipeline.zadd(key, post.score.toString(), post.id);
    }
    pipeline.expire(key, redis_keys_1.RedisTTL.TRENDING_POSTS);
    await pipeline.exec();
}
/**
 * Get trending post IDs (highest score first).
 */
async function getTrendingPosts(limit = 10) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.trendingPosts();
    return redis.zrevrange(key, 0, limit - 1);
}
/**
 * Update trending hashtags sorted set.
 */
async function updateTrendingHashtags(hashtags) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.trendingHashtags();
    const pipeline = redis.pipeline();
    pipeline.del(key);
    for (const hashtag of hashtags) {
        pipeline.zadd(key, hashtag.score.toString(), hashtag.id);
    }
    pipeline.expire(key, redis_keys_1.RedisTTL.TRENDING_HASHTAGS);
    await pipeline.exec();
}
/**
 * Get trending hashtag IDs (highest score first).
 */
async function getTrendingHashtags(limit = 10) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.trendingHashtags();
    return redis.zrevrange(key, 0, limit - 1);
}
// ─── Recommendations ────────────────────────────────────────────────────────
/**
 * Cache AI recommendations for a user.
 */
async function cacheRecommendations(userId, postIds) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.recommendations(userId);
    const pipeline = redis.pipeline();
    pipeline.del(key);
    if (postIds.length > 0) {
        pipeline.rpush(key, ...postIds);
    }
    pipeline.expire(key, redis_keys_1.RedisTTL.RECOMMENDATIONS);
    await pipeline.exec();
}
/**
 * Get cached AI recommendations for a user.
 */
async function getCachedRecommendations(userId) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.recommendations(userId);
    const exists = await redis.exists(key);
    if (!exists)
        return null;
    return redis.lrange(key, 0, -1);
}
/**
 * Invalidate cached recommendations for a user.
 */
async function invalidateRecommendations(userId) {
    const redis = (0, redis_1.getRedisClient)();
    const key = redis_keys_1.RedisKeys.recommendations(userId);
    await redis.del(key);
}
//# sourceMappingURL=redis-utils.js.map