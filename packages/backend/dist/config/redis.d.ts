import Redis from 'ioredis';
/**
 * Creates and returns a singleton Redis client instance with connection pooling.
 * ioredis handles connection pooling internally via pipelining.
 */
export declare function getRedisClient(): Redis;
/**
 * Gracefully disconnects the Redis client.
 */
export declare function disconnectRedis(): Promise<void>;
/**
 * Returns the current Redis client or null if not initialized.
 * Useful for health checks.
 */
export declare function getRedisClientOrNull(): Redis | null;
//# sourceMappingURL=redis.d.ts.map