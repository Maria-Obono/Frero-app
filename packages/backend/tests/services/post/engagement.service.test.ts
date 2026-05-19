/**
 * Unit tests for EngagementService - Post Engagement
 *
 * Tests cover:
 * - Like/unlike with idempotency guard (Req 6.1, 6.2, 6.3, 6.4)
 * - Comment system with nesting (Req 6.5, 6.6, 6.7, 6.8)
 * - Share functionality (Req 6.9)
 * - Bookmark add/remove (Req 6.10, 6.11)
 * - Engagement counts with Redis caching (Req 6.13, 6.14)
 * - Reject actions on non-existent/deleted posts (Req 6.12)
 * - Self-engagement notification suppression (Req 6.15)
 */

import {
  EngagementService,
  IEngagementNotificationTrigger,
  IRedisCache,
  PostRepository,
  PostServiceError,
  PostType,
  PostPrivacy,
  LikeableType,
} from '../../../src/services/post';

describe('EngagementService', () => {
  let engagementService: EngagementService;
  let mockRepository: jest.Mocked<PostRepository>;
  let mockRedisCache: jest.Mocked<IRedisCache>;
  let mockNotificationTrigger: jest.Mocked<IEngagementNotificationTrigger>;

  const mockPost = {
    id: 1,
    user_id: 10,
    type: PostType.TEXT,
    content: 'Hello world',
    privacy: PostPrivacy.PUBLIC,
    like_count: 5,
    comment_count: 3,
    share_count: 2,
    deleted_at: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  const mockComment = {
    id: 100,
    post_id: 1,
    user_id: 20,
    parent_comment_id: null,
    content: 'Great post!',
    depth: 0,
    deleted_at: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  beforeEach(() => {
    mockRepository = {
      findById: jest.fn().mockResolvedValue(mockPost),
      findLike: jest.fn().mockResolvedValue(undefined),
      createLike: jest.fn().mockResolvedValue(1),
      deleteLike: jest.fn().mockResolvedValue(1),
      incrementLikeCount: jest.fn().mockResolvedValue(undefined),
      decrementLikeCount: jest.fn().mockResolvedValue(undefined),
      createComment: jest.fn().mockResolvedValue(100),
      findCommentById: jest.fn().mockResolvedValue(mockComment),
      incrementCommentCount: jest.fn().mockResolvedValue(undefined),
      createShare: jest.fn().mockResolvedValue(1),
      incrementShareCount: jest.fn().mockResolvedValue(undefined),
      findBookmark: jest.fn().mockResolvedValue(undefined),
      createBookmark: jest.fn().mockResolvedValue(1),
      deleteBookmark: jest.fn().mockResolvedValue(1),
      // Base repository methods
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      findPaginated: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      hardDelete: jest.fn(),
      count: jest.fn(),
      exists: jest.fn(),
      getDb: jest.fn(),
      getTableName: jest.fn(),
      softDeleteWithTransaction: jest.fn(),
      createPostMedia: jest.fn(),
      getPostMedia: jest.fn(),
      findOrCreateHashtag: jest.fn(),
      createPostHashtag: jest.fn(),
      getPostHashtags: jest.fn(),
      transaction: jest.fn(),
      createReel: jest.fn(),
      findReelById: jest.fn(),
      createStory: jest.fn(),
      findStoryById: jest.fn(),
      getActiveStories: jest.fn(),
      getActiveStoriesForUsers: jest.fn(),
      recordStoryView: jest.fn(),
      getStoryViewers: jest.fn(),
      getStoryViewCount: jest.fn(),
      hasViewedStory: jest.fn(),
    } as any;

    mockRedisCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    mockNotificationTrigger = {
      notifyLike: jest.fn().mockResolvedValue(undefined),
      notifyComment: jest.fn().mockResolvedValue(undefined),
      notifyReply: jest.fn().mockResolvedValue(undefined),
      notifyShare: jest.fn().mockResolvedValue(undefined),
    };

    engagementService = new EngagementService({
      repository: mockRepository,
      redisCache: mockRedisCache,
      notificationTrigger: mockNotificationTrigger,
    });
  });

  // ============================================================
  // Like/Unlike Tests (Requirements 6.1, 6.2, 6.3, 6.4)
  // ============================================================

  describe('likePost (Requirements 6.1, 6.2)', () => {
    it('should create a like record for a valid post', async () => {
      await engagementService.likePost(1, 20);

      expect(mockRepository.createLike).toHaveBeenCalledWith(20, 1, LikeableType.POST);
      expect(mockRepository.incrementLikeCount).toHaveBeenCalledWith(1);
    });

    it('should reject if post is already liked (idempotency guard)', async () => {
      mockRepository.findLike.mockResolvedValue({
        id: 1, user_id: 20, likeable_id: 1, likeable_type: LikeableType.POST, created_at: new Date(),
      });

      await expect(engagementService.likePost(1, 20)).rejects.toThrow(PostServiceError);
      await expect(engagementService.likePost(1, 20)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('already liked'),
      });

      expect(mockRepository.createLike).not.toHaveBeenCalled();
    });

    it('should reject if post does not exist (Requirement 6.12)', async () => {
      mockRepository.findById.mockResolvedValue(undefined);

      await expect(engagementService.likePost(999, 20)).rejects.toThrow(PostServiceError);
      await expect(engagementService.likePost(999, 20)).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('not found'),
      });
    });

    it('should notify post owner on like', async () => {
      await engagementService.likePost(1, 20);

      expect(mockNotificationTrigger.notifyLike).toHaveBeenCalledWith(1, 10, 20);
    });

    it('should suppress notification when user likes their own post (Requirement 6.15)', async () => {
      await engagementService.likePost(1, 10); // user 10 is the post owner

      expect(mockNotificationTrigger.notifyLike).not.toHaveBeenCalled();
    });

    it('should not fail if notification trigger throws', async () => {
      mockNotificationTrigger.notifyLike.mockRejectedValue(new Error('Notification failed'));

      await expect(engagementService.likePost(1, 20)).resolves.toBeUndefined();
      expect(mockRepository.createLike).toHaveBeenCalled();
    });

    it('should invalidate engagement cache on like', async () => {
      await engagementService.likePost(1, 20);

      expect(mockRedisCache.del).toHaveBeenCalledWith('engagement:1');
    });
  });

  describe('unlikePost (Requirements 6.3, 6.4)', () => {
    it('should remove a like record for a previously liked post', async () => {
      mockRepository.findLike.mockResolvedValue({
        id: 1, user_id: 20, likeable_id: 1, likeable_type: LikeableType.POST, created_at: new Date(),
      });

      await engagementService.unlikePost(1, 20);

      expect(mockRepository.deleteLike).toHaveBeenCalledWith(20, 1, LikeableType.POST);
      expect(mockRepository.decrementLikeCount).toHaveBeenCalledWith(1);
    });

    it('should reject if post was not liked (Requirement 6.4)', async () => {
      mockRepository.findLike.mockResolvedValue(undefined);

      await expect(engagementService.unlikePost(1, 20)).rejects.toThrow(PostServiceError);
      await expect(engagementService.unlikePost(1, 20)).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('No existing like'),
      });
    });

    it('should reject if post does not exist (Requirement 6.12)', async () => {
      mockRepository.findById.mockResolvedValue(undefined);

      await expect(engagementService.unlikePost(999, 20)).rejects.toThrow(PostServiceError);
      await expect(engagementService.unlikePost(999, 20)).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('not found'),
      });
    });

    it('should invalidate engagement cache on unlike', async () => {
      mockRepository.findLike.mockResolvedValue({
        id: 1, user_id: 20, likeable_id: 1, likeable_type: LikeableType.POST, created_at: new Date(),
      });

      await engagementService.unlikePost(1, 20);

      expect(mockRedisCache.del).toHaveBeenCalledWith('engagement:1');
    });
  });

  // ============================================================
  // Comment Tests (Requirements 6.5, 6.6, 6.7, 6.8)
  // ============================================================

  describe('commentOnPost (Requirements 6.5, 6.6)', () => {
    it('should create a comment with valid content', async () => {
      const result = await engagementService.commentOnPost(1, 20, { content: 'Great post!' });

      expect(mockRepository.createComment).toHaveBeenCalledWith({
        post_id: 1,
        user_id: 20,
        parent_comment_id: null,
        content: 'Great post!',
        depth: 0,
      });
      expect(mockRepository.incrementCommentCount).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockComment);
    });

    it('should accept comment of exactly 1 character', async () => {
      await engagementService.commentOnPost(1, 20, { content: 'A' });

      expect(mockRepository.createComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'A' }),
      );
    });

    it('should accept comment of exactly 2000 characters', async () => {
      const content = 'a'.repeat(2000);

      await engagementService.commentOnPost(1, 20, { content });

      expect(mockRepository.createComment).toHaveBeenCalledWith(
        expect.objectContaining({ content }),
      );
    });

    it('should reject empty comment (Requirement 6.6)', async () => {
      await expect(
        engagementService.commentOnPost(1, 20, { content: '' }),
      ).rejects.toThrow(PostServiceError);

      await expect(
        engagementService.commentOnPost(1, 20, { content: '' }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('at least 1 character'),
      });
    });

    it('should reject comment exceeding 2000 characters (Requirement 6.6)', async () => {
      const content = 'a'.repeat(2001);

      await expect(
        engagementService.commentOnPost(1, 20, { content }),
      ).rejects.toThrow(PostServiceError);

      await expect(
        engagementService.commentOnPost(1, 20, { content }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('2000'),
      });
    });

    it('should reject if post does not exist (Requirement 6.12)', async () => {
      mockRepository.findById.mockResolvedValue(undefined);

      await expect(
        engagementService.commentOnPost(999, 20, { content: 'Hello' }),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('not found'),
      });
    });

    it('should notify post owner on comment', async () => {
      await engagementService.commentOnPost(1, 20, { content: 'Nice!' });

      expect(mockNotificationTrigger.notifyComment).toHaveBeenCalledWith(1, 10, 20, 100);
    });

    it('should suppress notification when user comments on their own post (Requirement 6.15)', async () => {
      await engagementService.commentOnPost(1, 10, { content: 'My own comment' });

      expect(mockNotificationTrigger.notifyComment).not.toHaveBeenCalled();
    });

    it('should not fail if notification trigger throws', async () => {
      mockNotificationTrigger.notifyComment.mockRejectedValue(new Error('Notification failed'));

      const result = await engagementService.commentOnPost(1, 20, { content: 'Hello' });
      expect(result).toEqual(mockComment);
    });

    it('should invalidate engagement cache on comment', async () => {
      await engagementService.commentOnPost(1, 20, { content: 'Hello' });

      expect(mockRedisCache.del).toHaveBeenCalledWith('engagement:1');
    });
  });

  describe('replyToComment (Requirements 6.7, 6.8)', () => {
    it('should create a nested reply at depth 1', async () => {
      // Parent comment at depth 0
      mockRepository.findCommentById
        .mockResolvedValueOnce({ ...mockComment, depth: 0 }) // parent lookup
        .mockResolvedValueOnce({ ...mockComment, id: 101, depth: 1, parent_comment_id: 100 }); // reply lookup

      mockRepository.createComment.mockResolvedValue(101);

      const result = await engagementService.replyToComment(100, 30, { content: 'Nice reply!' });

      expect(mockRepository.createComment).toHaveBeenCalledWith({
        post_id: 1,
        user_id: 30,
        parent_comment_id: 100,
        content: 'Nice reply!',
        depth: 1,
      });
      expect(result.id).toBe(101);
    });

    it('should create a nested reply at depth 2', async () => {
      mockRepository.findCommentById
        .mockResolvedValueOnce({ ...mockComment, depth: 1 })
        .mockResolvedValueOnce({ ...mockComment, id: 102, depth: 2, parent_comment_id: 100 });

      mockRepository.createComment.mockResolvedValue(102);

      await engagementService.replyToComment(100, 30, { content: 'Deeper reply!' });

      expect(mockRepository.createComment).toHaveBeenCalledWith(
        expect.objectContaining({ depth: 2 }),
      );
    });

    it('should create a nested reply at max depth 3', async () => {
      mockRepository.findCommentById
        .mockResolvedValueOnce({ ...mockComment, depth: 2 })
        .mockResolvedValueOnce({ ...mockComment, id: 103, depth: 3, parent_comment_id: 100 });

      mockRepository.createComment.mockResolvedValue(103);

      await engagementService.replyToComment(100, 30, { content: 'Max depth reply!' });

      expect(mockRepository.createComment).toHaveBeenCalledWith(
        expect.objectContaining({ depth: 3 }),
      );
    });

    it('should reject reply beyond max depth 3 (Requirement 6.8)', async () => {
      mockRepository.findCommentById.mockResolvedValue({ ...mockComment, depth: 3 });

      const error = await engagementService.replyToComment(100, 30, { content: 'Too deep!' }).catch(e => e);

      expect(error).toBeInstanceOf(PostServiceError);
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('Maximum');
    });

    it('should reject if parent comment does not exist', async () => {
      mockRepository.findCommentById.mockResolvedValueOnce(undefined);

      await expect(
        engagementService.replyToComment(999, 30, { content: 'Reply' }),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('Parent comment not found'),
      });
    });

    it('should reject if post of parent comment does not exist (Requirement 6.12)', async () => {
      mockRepository.findCommentById.mockResolvedValueOnce({ ...mockComment, depth: 0 });
      mockRepository.findById.mockResolvedValue(undefined);

      await expect(
        engagementService.replyToComment(100, 30, { content: 'Reply' }),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('not found'),
      });
    });

    it('should validate reply content length', async () => {
      await expect(
        engagementService.replyToComment(100, 30, { content: '' }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('at least 1 character'),
      });

      await expect(
        engagementService.replyToComment(100, 30, { content: 'a'.repeat(2001) }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('2000'),
      });
    });

    it('should notify parent comment author on reply', async () => {
      mockRepository.findCommentById
        .mockResolvedValueOnce({ ...mockComment, user_id: 20, depth: 0 })
        .mockResolvedValueOnce({ ...mockComment, id: 101, depth: 1 });

      mockRepository.createComment.mockResolvedValue(101);

      await engagementService.replyToComment(100, 30, { content: 'Reply!' });

      expect(mockNotificationTrigger.notifyReply).toHaveBeenCalledWith(100, 20, 30, 101);
    });

    it('should suppress notification when replying to own comment (Requirement 6.15)', async () => {
      mockRepository.findCommentById
        .mockResolvedValueOnce({ ...mockComment, user_id: 30, depth: 0 })
        .mockResolvedValueOnce({ ...mockComment, id: 101, depth: 1 });

      mockRepository.createComment.mockResolvedValue(101);

      await engagementService.replyToComment(100, 30, { content: 'Self reply' });

      expect(mockNotificationTrigger.notifyReply).not.toHaveBeenCalled();
    });

    it('should increment comment count on post for replies', async () => {
      mockRepository.findCommentById
        .mockResolvedValueOnce({ ...mockComment, depth: 0 })
        .mockResolvedValueOnce({ ...mockComment, id: 101, depth: 1 });

      mockRepository.createComment.mockResolvedValue(101);

      await engagementService.replyToComment(100, 30, { content: 'Reply!' });

      expect(mockRepository.incrementCommentCount).toHaveBeenCalledWith(1);
    });
  });

  // ============================================================
  // Share Tests (Requirement 6.9)
  // ============================================================

  describe('sharePost (Requirement 6.9)', () => {
    it('should create a share record and increment share count', async () => {
      await engagementService.sharePost(1, 20);

      expect(mockRepository.createShare).toHaveBeenCalledWith(20, 1);
      expect(mockRepository.incrementShareCount).toHaveBeenCalledWith(1);
    });

    it('should reject if post does not exist (Requirement 6.12)', async () => {
      mockRepository.findById.mockResolvedValue(undefined);

      await expect(engagementService.sharePost(999, 20)).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('not found'),
      });
    });

    it('should notify post owner on share', async () => {
      await engagementService.sharePost(1, 20);

      expect(mockNotificationTrigger.notifyShare).toHaveBeenCalledWith(1, 10, 20);
    });

    it('should suppress notification when user shares their own post (Requirement 6.15)', async () => {
      await engagementService.sharePost(1, 10); // user 10 is the post owner

      expect(mockNotificationTrigger.notifyShare).not.toHaveBeenCalled();
    });

    it('should not fail if notification trigger throws', async () => {
      mockNotificationTrigger.notifyShare.mockRejectedValue(new Error('Notification failed'));

      await expect(engagementService.sharePost(1, 20)).resolves.toBeUndefined();
    });

    it('should invalidate engagement cache on share', async () => {
      await engagementService.sharePost(1, 20);

      expect(mockRedisCache.del).toHaveBeenCalledWith('engagement:1');
    });
  });

  // ============================================================
  // Bookmark Tests (Requirements 6.10, 6.11)
  // ============================================================

  describe('bookmarkPost (Requirement 6.10)', () => {
    it('should create a bookmark record', async () => {
      await engagementService.bookmarkPost(1, 20);

      expect(mockRepository.createBookmark).toHaveBeenCalledWith(20, 1);
    });

    it('should reject if post is already bookmarked', async () => {
      mockRepository.findBookmark.mockResolvedValue({
        id: 1, user_id: 20, post_id: 1, created_at: new Date(),
      });

      await expect(engagementService.bookmarkPost(1, 20)).rejects.toThrow(PostServiceError);
      await expect(engagementService.bookmarkPost(1, 20)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('already bookmarked'),
      });
    });

    it('should reject if post does not exist (Requirement 6.12)', async () => {
      mockRepository.findById.mockResolvedValue(undefined);

      await expect(engagementService.bookmarkPost(999, 20)).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('not found'),
      });
    });
  });

  describe('removeBookmark (Requirement 6.11)', () => {
    it('should remove a bookmark record', async () => {
      mockRepository.findBookmark.mockResolvedValue({
        id: 1, user_id: 20, post_id: 1, created_at: new Date(),
      });

      await engagementService.removeBookmark(1, 20);

      expect(mockRepository.deleteBookmark).toHaveBeenCalledWith(20, 1);
    });

    it('should reject if bookmark does not exist', async () => {
      mockRepository.findBookmark.mockResolvedValue(undefined);

      await expect(engagementService.removeBookmark(1, 20)).rejects.toThrow(PostServiceError);
      await expect(engagementService.removeBookmark(1, 20)).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('Bookmark not found'),
      });
    });
  });

  // ============================================================
  // Engagement Counts Tests (Requirements 6.13, 6.14)
  // ============================================================

  describe('getEngagementCounts (Requirements 6.13, 6.14)', () => {
    it('should return engagement counts from database', async () => {
      const result = await engagementService.getEngagementCounts(1);

      expect(result).toEqual({
        likes: 5,
        comments: 3,
        shares: 2,
      });
    });

    it('should cache engagement counts in Redis with 5-second TTL', async () => {
      await engagementService.getEngagementCounts(1);

      expect(mockRedisCache.setex).toHaveBeenCalledWith(
        'engagement:1',
        5,
        JSON.stringify({ likes: 5, comments: 3, shares: 2 }),
      );
    });

    it('should return cached counts from Redis when available', async () => {
      const cachedCounts = { likes: 10, comments: 7, shares: 4 };
      mockRedisCache.get.mockResolvedValue(JSON.stringify(cachedCounts));

      const result = await engagementService.getEngagementCounts(1);

      expect(result).toEqual(cachedCounts);
      expect(mockRepository.findById).not.toHaveBeenCalled();
    });

    it('should fall back to database when Redis cache misses', async () => {
      mockRedisCache.get.mockResolvedValue(null);

      const result = await engagementService.getEngagementCounts(1);

      expect(result).toEqual({ likes: 5, comments: 3, shares: 2 });
      expect(mockRepository.findById).toHaveBeenCalledWith(1);
    });

    it('should reject if post does not exist', async () => {
      mockRepository.findById.mockResolvedValue(undefined);

      await expect(engagementService.getEngagementCounts(999)).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('not found'),
      });
    });

    it('should work without Redis cache (graceful degradation)', async () => {
      const serviceWithoutRedis = new EngagementService({
        repository: mockRepository,
        redisCache: null,
        notificationTrigger: mockNotificationTrigger,
      });

      const result = await serviceWithoutRedis.getEngagementCounts(1);

      expect(result).toEqual({ likes: 5, comments: 3, shares: 2 });
    });

    it('should not fail if Redis cache write throws', async () => {
      mockRedisCache.setex.mockRejectedValue(new Error('Redis error'));

      const result = await engagementService.getEngagementCounts(1);

      expect(result).toEqual({ likes: 5, comments: 3, shares: 2 });
    });
  });

  // ============================================================
  // Self-engagement notification suppression (Requirement 6.15)
  // ============================================================

  describe('Self-engagement notification suppression (Requirement 6.15)', () => {
    it('should suppress like notification for self-like', async () => {
      await engagementService.likePost(1, 10); // user 10 owns post 1

      expect(mockNotificationTrigger.notifyLike).not.toHaveBeenCalled();
    });

    it('should suppress comment notification for self-comment', async () => {
      await engagementService.commentOnPost(1, 10, { content: 'My own comment' });

      expect(mockNotificationTrigger.notifyComment).not.toHaveBeenCalled();
    });

    it('should suppress share notification for self-share', async () => {
      await engagementService.sharePost(1, 10);

      expect(mockNotificationTrigger.notifyShare).not.toHaveBeenCalled();
    });

    it('should suppress reply notification when replying to own comment', async () => {
      mockRepository.findCommentById
        .mockResolvedValueOnce({ ...mockComment, user_id: 30, depth: 0 })
        .mockResolvedValueOnce({ ...mockComment, id: 101, depth: 1 });

      mockRepository.createComment.mockResolvedValue(101);

      await engagementService.replyToComment(100, 30, { content: 'Self reply' });

      expect(mockNotificationTrigger.notifyReply).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Edge Cases
  // ============================================================

  describe('Edge cases', () => {
    it('should work without notification trigger configured', async () => {
      const serviceWithoutNotifications = new EngagementService({
        repository: mockRepository,
        redisCache: mockRedisCache,
        notificationTrigger: null,
      });

      await expect(serviceWithoutNotifications.likePost(1, 20)).resolves.toBeUndefined();
      await expect(
        serviceWithoutNotifications.commentOnPost(1, 20, { content: 'Hello' }),
      ).resolves.toBeDefined();
      await expect(serviceWithoutNotifications.sharePost(1, 20)).resolves.toBeUndefined();
    });

    it('should handle cache invalidation failure gracefully', async () => {
      mockRedisCache.del.mockRejectedValue(new Error('Redis error'));

      // Should not throw even if cache invalidation fails
      await expect(engagementService.likePost(1, 20)).resolves.toBeUndefined();
    });
  });
});
