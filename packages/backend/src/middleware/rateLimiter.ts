import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store as fallback when Redis is not available
const memoryStore = new Map<string, RateLimitEntry>();

function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (now >= entry.resetAt) {
      memoryStore.delete(key);
    }
  }
}

// Periodic cleanup every 60 seconds
setInterval(cleanupExpiredEntries, 60000).unref();

function getIdentifier(req: Request): { key: string; isAuthenticated: boolean } {
  // Check if user is authenticated (set by auth middleware)
  const userId = (req as Request & { userId?: string }).userId;
  if (userId) {
    return { key: `rate_limit:user:${userId}`, isAuthenticated: true };
  }

  // Fall back to IP-based limiting
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return { key: `rate_limit:ip:${ip}`, isAuthenticated: false };
}

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const { key, isAuthenticated } = getIdentifier(req);
  const maxRequests = isAuthenticated
    ? config.rateLimit.authenticatedMaxRequests
    : config.rateLimit.unauthenticatedMaxRequests;
  const windowMs = config.rateLimit.windowMs;
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
      requestId: (req as Request & { requestId?: string }).requestId || 'unknown',
    });
    return;
  }

  next();
}

// Export for testing
export { memoryStore, getIdentifier };
