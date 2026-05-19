"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryStore = void 0;
exports.rateLimiter = rateLimiter;
exports.getIdentifier = getIdentifier;
const config_1 = require("../config");
// In-memory store as fallback when Redis is not available
const memoryStore = new Map();
exports.memoryStore = memoryStore;
function cleanupExpiredEntries() {
    const now = Date.now();
    for (const [key, entry] of memoryStore) {
        if (now >= entry.resetAt) {
            memoryStore.delete(key);
        }
    }
}
// Periodic cleanup every 60 seconds
setInterval(cleanupExpiredEntries, 60000).unref();
function getIdentifier(req) {
    // Check if user is authenticated (set by auth middleware)
    const userId = req.userId;
    if (userId) {
        return { key: `rate_limit:user:${userId}`, isAuthenticated: true };
    }
    // Fall back to IP-based limiting
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return { key: `rate_limit:ip:${ip}`, isAuthenticated: false };
}
function rateLimiter(req, res, next) {
    const { key, isAuthenticated } = getIdentifier(req);
    const maxRequests = isAuthenticated
        ? config_1.config.rateLimit.authenticatedMaxRequests
        : config_1.config.rateLimit.unauthenticatedMaxRequests;
    const windowMs = config_1.config.rateLimit.windowMs;
    const now = Date.now();
    let entry = memoryStore.get(key);
    // If no entry or window has expired, create a new one
    if (!entry || now >= entry.resetAt) {
        entry = { count: 1, resetAt: now + windowMs };
        memoryStore.set(key, entry);
        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', (maxRequests - 1).toString());
        res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000).toString());
        next();
        return;
    }
    entry.count++;
    const remaining = Math.max(0, maxRequests - entry.count);
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000).toString());
    if (entry.count > maxRequests) {
        res.setHeader('Retry-After', retryAfterSeconds.toString());
        res.status(429).json({
            status: 429,
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: retryAfterSeconds,
            requestId: req.requestId || 'unknown',
        });
        return;
    }
    next();
}
//# sourceMappingURL=rateLimiter.js.map