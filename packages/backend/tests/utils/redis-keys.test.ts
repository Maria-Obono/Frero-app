import { RedisKeys, RedisTTL } from '../../src/utils/redis-keys';

describe('RedisKeys', () => {
  describe('session', () => {
    it('should generate correct session key pattern', () => {
      expect(RedisKeys.session('user123', 'token456')).toBe('session:user123:token456');
    });

    it('should handle different userId and tokenId values', () => {
      expect(RedisKeys.session('abc', 'def')).toBe('session:abc:def');
    });
  });

  describe('rateLimit', () => {
    it('should generate correct rate limit key for user', () => {
      expect(RedisKeys.rateLimit('user123')).toBe('rate_limit:user123');
    });
  });

  describe('rateLimitIp', () => {
    it('should generate correct rate limit key for IP', () => {
      expect(RedisKeys.rateLimitIp('192.168.1.1')).toBe('rate_limit:ip:192.168.1.1');
    });

    it('should handle IPv6 addresses', () => {
      expect(RedisKeys.rateLimitIp('::1')).toBe('rate_limit:ip:::1');
    });
  });

  describe('loginAttempts', () => {
    it('should generate correct login attempts key', () => {
      expect(RedisKeys.loginAttempts('user123')).toBe('login_attempts:user123');
    });
  });

  describe('feed', () => {
    it('should generate correct feed key', () => {
      expect(RedisKeys.feed('user123')).toBe('feed:user123');
    });
  });

  describe('engagement', () => {
    it('should generate correct engagement key', () => {
      expect(RedisKeys.engagement('post789')).toBe('engagement:post789');
    });
  });

  describe('online', () => {
    it('should generate correct online presence key', () => {
      expect(RedisKeys.online('user123')).toBe('online:user123');
    });
  });

  describe('typing', () => {
    it('should generate correct typing indicator key', () => {
      expect(RedisKeys.typing('chat1', 'user2')).toBe('typing:chat1:user2');
    });
  });

  describe('trendingPosts', () => {
    it('should return the trending posts key', () => {
      expect(RedisKeys.trendingPosts()).toBe('trending:posts');
    });
  });

  describe('trendingHashtags', () => {
    it('should return the trending hashtags key', () => {
      expect(RedisKeys.trendingHashtags()).toBe('trending:hashtags');
    });
  });

  describe('recommendations', () => {
    it('should generate correct recommendations key', () => {
      expect(RedisKeys.recommendations('user123')).toBe('recommendations:user123');
    });
  });
});

describe('RedisTTL', () => {
  it('should have correct TTL for sessions (7 days in seconds)', () => {
    expect(RedisTTL.SESSION).toBe(604800);
  });

  it('should have correct TTL for rate limiting (60 seconds)', () => {
    expect(RedisTTL.RATE_LIMIT).toBe(60);
  });

  it('should have correct TTL for login attempts (15 minutes in seconds)', () => {
    expect(RedisTTL.LOGIN_ATTEMPTS).toBe(900);
  });

  it('should have correct TTL for feed cache (5 minutes in seconds)', () => {
    expect(RedisTTL.FEED).toBe(300);
  });

  it('should have correct TTL for engagement cache (30 seconds)', () => {
    expect(RedisTTL.ENGAGEMENT).toBe(30);
  });

  it('should have correct TTL for online presence (90 seconds)', () => {
    expect(RedisTTL.ONLINE).toBe(90);
  });

  it('should have correct TTL for typing indicator (5 seconds)', () => {
    expect(RedisTTL.TYPING).toBe(5);
  });

  it('should have correct TTL for trending posts (5 minutes in seconds)', () => {
    expect(RedisTTL.TRENDING_POSTS).toBe(300);
  });

  it('should have correct TTL for trending hashtags (5 minutes in seconds)', () => {
    expect(RedisTTL.TRENDING_HASHTAGS).toBe(300);
  });

  it('should have correct TTL for recommendations (1 hour in seconds)', () => {
    expect(RedisTTL.RECOMMENDATIONS).toBe(3600);
  });
});
