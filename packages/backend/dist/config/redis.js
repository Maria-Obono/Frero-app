"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisClient = getRedisClient;
exports.disconnectRedis = disconnectRedis;
exports.getRedisClientOrNull = getRedisClientOrNull;
const ioredis_1 = __importDefault(require("ioredis"));
const index_1 = require("./index");
const logger_1 = require("../utils/logger");
let redisClient = null;
/**
 * Creates and returns a singleton Redis client instance with connection pooling.
 * ioredis handles connection pooling internally via pipelining.
 */
function getRedisClient() {
    if (redisClient) {
        return redisClient;
    }
    redisClient = new ioredis_1.default({
        host: index_1.config.redis.host,
        port: index_1.config.redis.port,
        password: index_1.config.redis.password || undefined,
        db: index_1.config.redis.db,
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
            const delay = Math.min(times * 200, 5000);
            return delay;
        },
        enableReadyCheck: true,
        lazyConnect: false,
    });
    redisClient.on('connect', () => {
        logger_1.logger.info('Redis client connected');
    });
    redisClient.on('ready', () => {
        logger_1.logger.info('Redis client ready');
    });
    redisClient.on('error', (err) => {
        logger_1.logger.error('Redis client error', { error: err.message });
    });
    redisClient.on('close', () => {
        logger_1.logger.warn('Redis client connection closed');
    });
    return redisClient;
}
/**
 * Gracefully disconnects the Redis client.
 */
async function disconnectRedis() {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        logger_1.logger.info('Redis client disconnected');
    }
}
/**
 * Returns the current Redis client or null if not initialized.
 * Useful for health checks.
 */
function getRedisClientOrNull() {
    return redisClient;
}
//# sourceMappingURL=redis.js.map