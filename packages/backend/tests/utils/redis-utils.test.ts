import {
  storeSession,
  getSession,
  deleteSession,
  deleteAllUserSessions,
  checkRateLimit,
  checkIpRateLimit,
  incrementLoginAttempts,
  getLoginAttempts,
  resetLoginAttempts,
  cacheFeed,
  getCachedFeed,
  invalidateFeed,
  cacheEngagement,
  getCachedEngagement,
  setOnline,
  isOnline,
  setOffline,
  setTyping,
  clearTyping,
  isTyping,
  updateTrendingPosts,
  getTrendingPosts,
  updateTrendingHashtags,
  getTrendingHashtags,
  cacheRecommendations,
  getCachedRecommendations,
  invalidateRecommendations,
} from '../../src/utils/redis-utils';

// Mock the redis client
const mockPipeline = {
  del: jest.fn().mockReturnThis(),
  zremrangebyscore: jest.fn().mockReturnThis(),
  zadd: jest.fn().mockReturnThis(),
  zcard: jest.fn().mockReturnThis(),
  pexpire: jest.fn().mockReturnThis(),
  rpush: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([
    [null, 0],
    [null, 1],
    [null, 1],
    [null, 1],
  ]),
};

const mockRedis = {
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  lrange: jest.fn().mockResolvedValue([]),
  hmset: jest.fn().mockResolvedValue('OK'),
  hgetall: jest.fn().mockResolvedValue({}),
  zadd: jest.fn().mockResolvedValue(1),
  zrevrange: jest.fn().mockResolvedValue([]),
  scan: jest.fn().mockResolvedValue(['0', []]),
  pipeline: jest.fn().mockReturnValue(mockPipeline),
};

jest.mock('../../src/config/redis', () => ({
  getRedisClient: () => mockRedis,
}));

describe('Redis Utils - Session Storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('storeSession', () => {
    it('should store a session with default TTL', async () => {
      await storeSession('user1', 'token1', 'tokenData');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'session:user1:token1',
        'tokenData',
        'EX',
        604800,
      );
    });

    it('should store a session with custom TTL', async () => {
      await storeSession('user1', 'token1', 'tokenData', 3600);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'session:user1:token1',
        'tokenData',
        'EX',
        3600,
      );
    });
  });

  describe('getSession', () => {
    it('should retrieve a session', async () => {
      mockRedis.get.mockResolvedValueOnce('tokenData');
      const result = await getSession('user1', 'token1');
      expect(mockRedis.get).toHaveBeenCalledWith('session:user1:token1');
      expect(result).toBe('tokenData');
    });

    it('should return null for non-existent session', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      const result = await getSession('user1', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should delete a session', async () => {
      await deleteSession('user1', 'token1');
      expect(mockRedis.del).toHaveBeenCalledWith('session:user1:token1');
    });
  });

  describe('deleteAllUserSessions', () => {
    it('should scan and delete all sessions for a user', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', ['session:user1:t1', 'session:user1:t2']]);
      await deleteAllUserSessions('user1');
      expect(mockRedis.scan).toHaveBeenCalledWith('0', 'MATCH', 'session:user1:*', 'COUNT', 100);
      expect(mockRedis.del).toHaveBeenCalledWith('session:user1:t1', 'session:user1:t2');
    });

    it('should handle no sessions found', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', []]);
      await deleteAllUserSessions('user1');
      expect(mockRedis.scan).toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });
});

describe('Redis Utils - Rate Limiting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should allow requests under the limit', async () => {
      mockPipeline.exec.mockResolvedValueOnce([
        [null, 0],
        [null, 1],
        [null, 5],
        [null, 1],
      ]);
      const result = await checkRateLimit('user1', 100);
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(5);
      expect(result.remaining).toBe(95);
    });

    it('should deny requests over the limit', async () => {
      mockPipeline.exec.mockResolvedValueOnce([
        [null, 0],
        [null, 1],
        [null, 101],
        [null, 1],
      ]);
      const result = await checkRateLimit('user1', 100);
      expect(result.allowed).toBe(false);
      expect(result.current).toBe(101);
      expect(result.remaining).toBe(0);
    });
  });

  describe('checkIpRateLimit', () => {
    it('should allow requests under the limit', async () => {
      mockPipeline.exec.mockResolvedValueOnce([
        [null, 0],
        [null, 1],
        [null, 10],
        [null, 1],
      ]);
      const result = await checkIpRateLimit('192.168.1.1', 20);
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(10);
      expect(result.remaining).toBe(10);
    });
  });
});

describe('Redis Utils - Login Attempts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('incrementLoginAttempts', () => {
    it('should increment and set TTL on first attempt', async () => {
      mockRedis.incr.mockResolvedValueOnce(1);
      const count = await incrementLoginAttempts('user1');
      expect(count).toBe(1);
      expect(mockRedis.incr).toHaveBeenCalledWith('login_attempts:user1');
      expect(mockRedis.expire).toHaveBeenCalledWith('login_attempts:user1', 900);
    });

    it('should increment without setting TTL on subsequent attempts', async () => {
      mockRedis.incr.mockResolvedValueOnce(3);
      const count = await incrementLoginAttempts('user1');
      expect(count).toBe(3);
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });
  });

  describe('getLoginAttempts', () => {
    it('should return the current count', async () => {
      mockRedis.get.mockResolvedValueOnce('3');
      const count = await getLoginAttempts('user1');
      expect(count).toBe(3);
    });

    it('should return 0 when no attempts recorded', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      const count = await getLoginAttempts('user1');
      expect(count).toBe(0);
    });
  });

  describe('resetLoginAttempts', () => {
    it('should delete the login attempts key', async () => {
      await resetLoginAttempts('user1');
      expect(mockRedis.del).toHaveBeenCalledWith('login_attempts:user1');
    });
  });
});

describe('Redis Utils - Caching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cacheFeed', () => {
    it('should cache feed post IDs with TTL', async () => {
      await cacheFeed('user1', ['post1', 'post2', 'post3']);
      expect(mockPipeline.del).toHaveBeenCalledWith('feed:user1');
      expect(mockPipeline.rpush).toHaveBeenCalledWith('feed:user1', 'post1', 'post2', 'post3');
      expect(mockPipeline.expire).toHaveBeenCalledWith('feed:user1', 300);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should handle empty feed', async () => {
      await cacheFeed('user1', []);
      expect(mockPipeline.del).toHaveBeenCalledWith('feed:user1');
      expect(mockPipeline.rpush).not.toHaveBeenCalled();
      expect(mockPipeline.expire).toHaveBeenCalledWith('feed:user1', 300);
    });
  });

  describe('getCachedFeed', () => {
    it('should return cached feed when it exists', async () => {
      mockRedis.exists.mockResolvedValueOnce(1);
      mockRedis.lrange.mockResolvedValueOnce(['post1', 'post2']);
      const result = await getCachedFeed('user1');
      expect(result).toEqual(['post1', 'post2']);
    });

    it('should return null when feed is not cached', async () => {
      mockRedis.exists.mockResolvedValueOnce(0);
      const result = await getCachedFeed('user1');
      expect(result).toBeNull();
    });
  });

  describe('invalidateFeed', () => {
    it('should delete the feed cache key', async () => {
      await invalidateFeed('user1');
      expect(mockRedis.del).toHaveBeenCalledWith('feed:user1');
    });
  });

  describe('cacheEngagement', () => {
    it('should cache engagement counts as a hash', async () => {
      await cacheEngagement('post1', { likes: 10, comments: 5, shares: 2 });
      expect(mockRedis.hmset).toHaveBeenCalledWith('engagement:post1', {
        likes: '10',
        comments: '5',
        shares: '2',
      });
      expect(mockRedis.expire).toHaveBeenCalledWith('engagement:post1', 30);
    });
  });

  describe('getCachedEngagement', () => {
    it('should return cached engagement counts', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({ likes: '10', comments: '5', shares: '2' });
      const result = await getCachedEngagement('post1');
      expect(result).toEqual({ likes: 10, comments: 5, shares: 2 });
    });

    it('should return null when no engagement is cached', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});
      const result = await getCachedEngagement('post1');
      expect(result).toBeNull();
    });
  });
});

describe('Redis Utils - Online Presence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setOnline', () => {
    it('should set online presence with TTL', async () => {
      await setOnline('user1');
      expect(mockRedis.set).toHaveBeenCalledWith('online:user1', '1', 'EX', 90);
    });
  });

  describe('isOnline', () => {
    it('should return true when user is online', async () => {
      mockRedis.exists.mockResolvedValueOnce(1);
      const result = await isOnline('user1');
      expect(result).toBe(true);
    });

    it('should return false when user is offline', async () => {
      mockRedis.exists.mockResolvedValueOnce(0);
      const result = await isOnline('user1');
      expect(result).toBe(false);
    });
  });

  describe('setOffline', () => {
    it('should remove the online presence key', async () => {
      await setOffline('user1');
      expect(mockRedis.del).toHaveBeenCalledWith('online:user1');
    });
  });
});

describe('Redis Utils - Typing Indicators', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setTyping', () => {
    it('should set typing indicator with TTL', async () => {
      await setTyping('chat1', 'user1');
      expect(mockRedis.set).toHaveBeenCalledWith('typing:chat1:user1', '1', 'EX', 5);
    });
  });

  describe('clearTyping', () => {
    it('should remove typing indicator', async () => {
      await clearTyping('chat1', 'user1');
      expect(mockRedis.del).toHaveBeenCalledWith('typing:chat1:user1');
    });
  });

  describe('isTyping', () => {
    it('should return true when user is typing', async () => {
      mockRedis.exists.mockResolvedValueOnce(1);
      const result = await isTyping('chat1', 'user1');
      expect(result).toBe(true);
    });

    it('should return false when user is not typing', async () => {
      mockRedis.exists.mockResolvedValueOnce(0);
      const result = await isTyping('chat1', 'user1');
      expect(result).toBe(false);
    });
  });
});

describe('Redis Utils - Trending', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateTrendingPosts', () => {
    it('should update trending posts sorted set', async () => {
      await updateTrendingPosts([
        { id: 'post1', score: 100 },
        { id: 'post2', score: 50 },
      ]);
      expect(mockPipeline.del).toHaveBeenCalledWith('trending:posts');
      expect(mockPipeline.zadd).toHaveBeenCalledWith('trending:posts', '100', 'post1');
      expect(mockPipeline.zadd).toHaveBeenCalledWith('trending:posts', '50', 'post2');
      expect(mockPipeline.expire).toHaveBeenCalledWith('trending:posts', 300);
    });
  });

  describe('getTrendingPosts', () => {
    it('should return trending post IDs', async () => {
      mockRedis.zrevrange.mockResolvedValueOnce(['post1', 'post2']);
      const result = await getTrendingPosts(10);
      expect(mockRedis.zrevrange).toHaveBeenCalledWith('trending:posts', 0, 9);
      expect(result).toEqual(['post1', 'post2']);
    });
  });

  describe('updateTrendingHashtags', () => {
    it('should update trending hashtags sorted set', async () => {
      await updateTrendingHashtags([
        { id: 'tag1', score: 200 },
        { id: 'tag2', score: 150 },
      ]);
      expect(mockPipeline.del).toHaveBeenCalledWith('trending:hashtags');
      expect(mockPipeline.zadd).toHaveBeenCalledWith('trending:hashtags', '200', 'tag1');
      expect(mockPipeline.zadd).toHaveBeenCalledWith('trending:hashtags', '150', 'tag2');
      expect(mockPipeline.expire).toHaveBeenCalledWith('trending:hashtags', 300);
    });
  });

  describe('getTrendingHashtags', () => {
    it('should return trending hashtag IDs', async () => {
      mockRedis.zrevrange.mockResolvedValueOnce(['tag1', 'tag2']);
      const result = await getTrendingHashtags(10);
      expect(mockRedis.zrevrange).toHaveBeenCalledWith('trending:hashtags', 0, 9);
      expect(result).toEqual(['tag1', 'tag2']);
    });
  });
});

describe('Redis Utils - Recommendations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cacheRecommendations', () => {
    it('should cache recommendation post IDs with TTL', async () => {
      await cacheRecommendations('user1', ['post1', 'post2']);
      expect(mockPipeline.del).toHaveBeenCalledWith('recommendations:user1');
      expect(mockPipeline.rpush).toHaveBeenCalledWith('recommendations:user1', 'post1', 'post2');
      expect(mockPipeline.expire).toHaveBeenCalledWith('recommendations:user1', 3600);
    });
  });

  describe('getCachedRecommendations', () => {
    it('should return cached recommendations when they exist', async () => {
      mockRedis.exists.mockResolvedValueOnce(1);
      mockRedis.lrange.mockResolvedValueOnce(['post1', 'post2']);
      const result = await getCachedRecommendations('user1');
      expect(result).toEqual(['post1', 'post2']);
    });

    it('should return null when no recommendations are cached', async () => {
      mockRedis.exists.mockResolvedValueOnce(0);
      const result = await getCachedRecommendations('user1');
      expect(result).toBeNull();
    });
  });

  describe('invalidateRecommendations', () => {
    it('should delete the recommendations cache key', async () => {
      await invalidateRecommendations('user1');
      expect(mockRedis.del).toHaveBeenCalledWith('recommendations:user1');
    });
  });
});
