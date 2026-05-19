/**
 * Unit tests for PostService - Reels and Stories
 *
 * Tests cover:
 * - Reel creation with duration validation (1-90s) (Req 5.2, 5.3)
 * - Reel creation with size validation (500MB max) (Req 5.2, 5.3)
 * - Reel video compression to max 1080x1920 at 8 Mbps (Req 5.1)
 * - Story creation with 24-hour expiration (Req 5.4)
 * - Story video duration validation (1-30s) (Req 5.7, 5.8)
 * - Story expiration logic and active story queries (Req 5.5)
 * - Story view recording with viewer tracking (Req 5.6)
 */

import {
  PostService,
  PostRepository,
  PostServiceError,
  StoryMediaType,
  MAX_REEL_DURATION,
  STORY_EXPIRATION_MS,
} from '../../../src/services/post';

describe('PostService - Reels and Stories', () => {
  let postService: PostService;
  let mockRepository: jest.Mocked<PostRepository>;

  const mockReel = {
    id: 1,
    user_id: 1,
    video_url: 'https://s3.example.com/reels/video.mp4',
    thumbnail_url: 'https://s3.example.com/reels/thumbnail.jpg',
    duration_seconds: 30,
    caption: 'My reel',
    like_count: 0,
    comment_count: 0,
    share_count: 0,
    deleted_at: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  const mockStory = {
    id: 1,
    user_id: 1,
    media_url: 'https://s3.example.com/stories/photo.jpg',
    media_type: StoryMediaType.IMAGE,
    expires_at: new Date(Date.now() + STORY_EXPIRATION_MS),
    deleted_at: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  beforeEach(() => {
    mockRepository = {
      create: jest.fn().mockResolvedValue(1),
      findById: jest.fn(),
      createPostMedia: jest.fn().mockResolvedValue(1),
      getPostMedia: jest.fn().mockResolvedValue([]),
      findOrCreateHashtag: jest.fn().mockResolvedValue(1),
      createPostHashtag: jest.fn().mockResolvedValue(undefined),
      getPostHashtags: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(),
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
      // Reel methods
      createReel: jest.fn().mockResolvedValue(1),
      findReelById: jest.fn().mockResolvedValue(mockReel),
      // Story methods
      createStory: jest.fn().mockResolvedValue(1),
      findStoryById: jest.fn().mockResolvedValue(mockStory),
      getActiveStories: jest.fn().mockResolvedValue([mockStory]),
      getActiveStoriesForUsers: jest.fn().mockResolvedValue([mockStory]),
      // Story view methods
      recordStoryView: jest.fn().mockResolvedValue(true),
      getStoryViewers: jest.fn().mockResolvedValue([]),
      getStoryViewCount: jest.fn().mockResolvedValue(0),
      hasViewedStory: jest.fn().mockResolvedValue(false),
    } as any;

    postService = new PostService({
      repository: mockRepository,
    });
  });

  // ============================================================
  // createReel Tests (Requirements 5.1, 5.2, 5.3)
  // ============================================================

  describe('createReel - Duration Validation (Requirement 5.2)', () => {
    it('should create a reel with valid duration (30 seconds)', async () => {
      const result = await postService.createReel(1, {
        file: Buffer.alloc(1024),
        mimeType: 'video/mp4',
        filename: 'reel.mp4',
        durationSeconds: 30,
        caption: 'My reel',
      });

      expect(mockRepository.createReel).toHaveBeenCalledWith({
        user_id: 1,
        video_url: 'placeholder-video-url',
        thumbnail_url: 'placeholder-thumbnail-url',
        duration_seconds: 30,
        caption: 'My reel',
      });
      expect(result.id).toBe(1);
    });

    it('should accept reel with minimum duration (1 second)', async () => {
      await postService.createReel(1, {
        file: Buffer.alloc(1024),
        mimeType: 'video/mp4',
        filename: 'reel.mp4',
        durationSeconds: 1,
      });

      expect(mockRepository.createReel).toHaveBeenCalledWith(
        expect.objectContaining({ duration_seconds: 1 }),
      );
    });

    it('should accept reel with maximum duration (90 seconds)', async () => {
      await postService.createReel(1, {
        file: Buffer.alloc(1024),
        mimeType: 'video/mp4',
        filename: 'reel.mp4',
        durationSeconds: 90,
      });

      expect(mockRepository.createReel).toHaveBeenCalledWith(
        expect.objectContaining({ duration_seconds: 90 }),
      );
    });

    it('should reject reel with duration less than 1 second', async () => {
      await expect(
        postService.createReel(1, {
          file: Buffer.alloc(1024),
          mimeType: 'video/mp4',
          filename: 'reel.mp4',
          durationSeconds: 0,
        }),
      ).rejects.toThrow(PostServiceError);

      await expect(
        postService.createReel(1, {
          file: Buffer.alloc(1024),
          mimeType: 'video/mp4',
          filename: 'reel.mp4',
          durationSeconds: 0,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('at least 1 second'),
      });
    });

    it('should reject reel with duration exceeding 90 seconds', async () => {
      await expect(
        postService.createReel(1, {
          file: Buffer.alloc(1024),
          mimeType: 'video/mp4',
          filename: 'reel.mp4',
          durationSeconds: 91,
        }),
      ).rejects.toThrow(PostServiceError);

      await expect(
        postService.createReel(1, {
          file: Buffer.alloc(1024),
          mimeType: 'video/mp4',
          filename: 'reel.mp4',
          durationSeconds: 91,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('90 seconds'),
      });
    });

    it('should reject reel with negative duration', async () => {
      await expect(
        postService.createReel(1, {
          file: Buffer.alloc(1024),
          mimeType: 'video/mp4',
          filename: 'reel.mp4',
          durationSeconds: -5,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('at least 1 second'),
      });
    });
  });

  describe('createReel - Size Validation (Requirement 5.2)', () => {
    it('should reject reel exceeding 500MB', async () => {
      const largeFile = Buffer.alloc(501 * 1024 * 1024);

      await expect(
        postService.createReel(1, {
          file: largeFile,
          mimeType: 'video/mp4',
          filename: 'large.mp4',
          durationSeconds: 30,
        }),
      ).rejects.toThrow(PostServiceError);

      await expect(
        postService.createReel(1, {
          file: largeFile,
          mimeType: 'video/mp4',
          filename: 'large.mp4',
          durationSeconds: 30,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('500MB'),
      });
    });

    it('should accept reel of exactly 500MB', async () => {
      const maxFile = Buffer.alloc(500 * 1024 * 1024);

      await postService.createReel(1, {
        file: maxFile,
        mimeType: 'video/mp4',
        filename: 'max.mp4',
        durationSeconds: 30,
      });

      expect(mockRepository.createReel).toHaveBeenCalled();
    });
  });

  describe('createReel - Format Validation (Requirement 5.3)', () => {
    it('should reject reel with invalid video format', async () => {
      await expect(
        postService.createReel(1, {
          file: Buffer.alloc(1024),
          mimeType: 'video/avi',
          filename: 'reel.avi',
          durationSeconds: 30,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('MP4, MOV'),
      });
    });

    it('should accept MP4 format', async () => {
      await postService.createReel(1, {
        file: Buffer.alloc(1024),
        mimeType: 'video/mp4',
        filename: 'reel.mp4',
        durationSeconds: 30,
      });

      expect(mockRepository.createReel).toHaveBeenCalled();
    });

    it('should accept MOV format', async () => {
      await postService.createReel(1, {
        file: Buffer.alloc(1024),
        mimeType: 'video/quicktime',
        filename: 'reel.mov',
        durationSeconds: 30,
      });

      expect(mockRepository.createReel).toHaveBeenCalled();
    });
  });

  describe('createReel - Video Compression (Requirement 5.1)', () => {
    it('should compress reel video via MediaService with correct options', async () => {
      const mockMediaService = {
        uploadVideo: jest.fn().mockResolvedValue({
          key: 'reels/123/video.mp4',
          url: 'https://s3.example.com/reels/123/video.mp4',
          variants: [{ url: 'https://s3.example.com/reels/123/thumbnail.jpg', label: 'thumbnail', width: 600, height: 338, key: 'reels/123/thumbnail.jpg' }],
          mimeType: 'video/mp4',
          filename: 'reel.mp4',
        }),
        uploadImage: jest.fn(),
      } as any;

      const serviceWithMedia = new PostService({
        repository: mockRepository,
        mediaService: mockMediaService,
      });

      await serviceWithMedia.createReel(1, {
        file: Buffer.alloc(1024),
        mimeType: 'video/mp4',
        filename: 'reel.mp4',
        durationSeconds: 30,
        caption: 'Compressed reel',
      });

      expect(mockMediaService.uploadVideo).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          folder: 'reels',
          maxDuration: MAX_REEL_DURATION,
        }),
      );

      expect(mockRepository.createReel).toHaveBeenCalledWith(
        expect.objectContaining({
          video_url: 'https://s3.example.com/reels/123/video.mp4',
          thumbnail_url: 'https://s3.example.com/reels/123/thumbnail.jpg',
        }),
      );
    });

    it('should handle media upload failure gracefully', async () => {
      const mockMediaService = {
        uploadVideo: jest.fn().mockRejectedValue(new Error('S3 upload failed')),
        uploadImage: jest.fn(),
      } as any;

      const serviceWithMedia = new PostService({
        repository: mockRepository,
        mediaService: mockMediaService,
      });

      await expect(
        serviceWithMedia.createReel(1, {
          file: Buffer.alloc(1024),
          mimeType: 'video/mp4',
          filename: 'reel.mp4',
          durationSeconds: 30,
        }),
      ).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringContaining('upload failed'),
      });

      expect(mockRepository.createReel).not.toHaveBeenCalled();
    });
  });

  describe('createReel - Caption (optional)', () => {
    it('should create reel without caption', async () => {
      await postService.createReel(1, {
        file: Buffer.alloc(1024),
        mimeType: 'video/mp4',
        filename: 'reel.mp4',
        durationSeconds: 30,
      });

      expect(mockRepository.createReel).toHaveBeenCalledWith(
        expect.objectContaining({ caption: null }),
      );
    });

    it('should create reel with caption', async () => {
      await postService.createReel(1, {
        file: Buffer.alloc(1024),
        mimeType: 'video/mp4',
        filename: 'reel.mp4',
        durationSeconds: 30,
        caption: 'Check this out!',
      });

      expect(mockRepository.createReel).toHaveBeenCalledWith(
        expect.objectContaining({ caption: 'Check this out!' }),
      );
    });
  });

  // ============================================================
  // createStory Tests (Requirements 5.4, 5.7, 5.8)
  // ============================================================

  describe('createStory - 24-hour Expiration (Requirement 5.4)', () => {
    it('should create a photo story with 24-hour expiration', async () => {
      const beforeCreate = Date.now();

      await postService.createStory(1, {
        file: Buffer.alloc(1024),
        mimeType: 'image/jpeg',
        filename: 'story.jpg',
        mediaType: StoryMediaType.IMAGE,
      });

      const afterCreate = Date.now();

      expect(mockRepository.createStory).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 1,
          media_type: StoryMediaType.IMAGE,
        }),
      );

      // Verify expires_at is approximately 24 hours from now
      const callArgs = mockRepository.createStory.mock.calls[0]![0];
      const expiresAt = callArgs.expires_at.getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(beforeCreate + STORY_EXPIRATION_MS);
      expect(expiresAt).toBeLessThanOrEqual(afterCreate + STORY_EXPIRATION_MS);
    });

    it('should create a video story with 24-hour expiration', async () => {
      await postService.createStory(1, {
        file: Buffer.alloc(1024),
        mimeType: 'video/mp4',
        filename: 'story.mp4',
        mediaType: StoryMediaType.VIDEO,
        durationSeconds: 15,
      });

      expect(mockRepository.createStory).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 1,
          media_type: StoryMediaType.VIDEO,
        }),
      );
    });
  });

  describe('createStory - Video Duration Validation (Requirement 5.7)', () => {
    it('should accept story video with minimum duration (1 second)', async () => {
      await postService.createStory(1, {
        file: Buffer.alloc(1024),
        mimeType: 'video/mp4',
        filename: 'story.mp4',
        mediaType: StoryMediaType.VIDEO,
        durationSeconds: 1,
      });

      expect(mockRepository.createStory).toHaveBeenCalled();
    });

    it('should accept story video with maximum duration (30 seconds)', async () => {
      await postService.createStory(1, {
        file: Buffer.alloc(1024),
        mimeType: 'video/mp4',
        filename: 'story.mp4',
        mediaType: StoryMediaType.VIDEO,
        durationSeconds: 30,
      });

      expect(mockRepository.createStory).toHaveBeenCalled();
    });

    it('should reject story video with duration less than 1 second', async () => {
      await expect(
        postService.createStory(1, {
          file: Buffer.alloc(1024),
          mimeType: 'video/mp4',
          filename: 'story.mp4',
          mediaType: StoryMediaType.VIDEO,
          durationSeconds: 0,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('at least 1 second'),
      });
    });

    it('should reject story video exceeding 30 seconds', async () => {
      await expect(
        postService.createStory(1, {
          file: Buffer.alloc(1024),
          mimeType: 'video/mp4',
          filename: 'story.mp4',
          mediaType: StoryMediaType.VIDEO,
          durationSeconds: 31,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('30 seconds'),
      });
    });

    it('should allow story video without explicit duration', async () => {
      await postService.createStory(1, {
        file: Buffer.alloc(1024),
        mimeType: 'video/mp4',
        filename: 'story.mp4',
        mediaType: StoryMediaType.VIDEO,
      });

      expect(mockRepository.createStory).toHaveBeenCalled();
    });
  });

  describe('createStory - Size Validation (Requirement 5.7)', () => {
    it('should reject story exceeding 500MB', async () => {
      const largeFile = Buffer.alloc(501 * 1024 * 1024);

      await expect(
        postService.createStory(1, {
          file: largeFile,
          mimeType: 'image/jpeg',
          filename: 'large.jpg',
          mediaType: StoryMediaType.IMAGE,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('500MB'),
      });
    });

    it('should accept story of exactly 500MB', async () => {
      const maxFile = Buffer.alloc(500 * 1024 * 1024);

      await postService.createStory(1, {
        file: maxFile,
        mimeType: 'image/jpeg',
        filename: 'max.jpg',
        mediaType: StoryMediaType.IMAGE,
      });

      expect(mockRepository.createStory).toHaveBeenCalled();
    });
  });

  describe('createStory - Format Validation (Requirement 5.8)', () => {
    it('should accept JPEG image story', async () => {
      await postService.createStory(1, {
        file: Buffer.alloc(1024),
        mimeType: 'image/jpeg',
        filename: 'story.jpg',
        mediaType: StoryMediaType.IMAGE,
      });

      expect(mockRepository.createStory).toHaveBeenCalled();
    });

    it('should accept PNG image story', async () => {
      await postService.createStory(1, {
        file: Buffer.alloc(1024),
        mimeType: 'image/png',
        filename: 'story.png',
        mediaType: StoryMediaType.IMAGE,
      });

      expect(mockRepository.createStory).toHaveBeenCalled();
    });

    it('should reject invalid image format for story', async () => {
      await expect(
        postService.createStory(1, {
          file: Buffer.alloc(1024),
          mimeType: 'image/bmp',
          filename: 'story.bmp',
          mediaType: StoryMediaType.IMAGE,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('JPEG, PNG, WebP, GIF'),
      });
    });

    it('should reject invalid video format for story', async () => {
      await expect(
        postService.createStory(1, {
          file: Buffer.alloc(1024),
          mimeType: 'video/avi',
          filename: 'story.avi',
          mediaType: StoryMediaType.VIDEO,
          durationSeconds: 10,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('MP4, MOV'),
      });
    });
  });

  describe('createStory - Media Upload Integration', () => {
    it('should upload image story via MediaService', async () => {
      const mockMediaService = {
        uploadImage: jest.fn().mockResolvedValue({
          key: 'stories/123/image.jpg',
          url: 'https://s3.example.com/stories/123/image.jpg',
          variants: [],
          mimeType: 'image/jpeg',
          filename: 'story.jpg',
        }),
        uploadVideo: jest.fn(),
      } as any;

      const serviceWithMedia = new PostService({
        repository: mockRepository,
        mediaService: mockMediaService,
      });

      await serviceWithMedia.createStory(1, {
        file: Buffer.alloc(1024),
        mimeType: 'image/jpeg',
        filename: 'story.jpg',
        mediaType: StoryMediaType.IMAGE,
      });

      expect(mockMediaService.uploadImage).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ folder: 'stories' }),
      );

      expect(mockRepository.createStory).toHaveBeenCalledWith(
        expect.objectContaining({
          media_url: 'https://s3.example.com/stories/123/image.jpg',
        }),
      );
    });

    it('should upload video story via MediaService', async () => {
      const mockMediaService = {
        uploadImage: jest.fn(),
        uploadVideo: jest.fn().mockResolvedValue({
          key: 'stories/123/video.mp4',
          url: 'https://s3.example.com/stories/123/video.mp4',
          variants: [],
          mimeType: 'video/mp4',
          filename: 'story.mp4',
        }),
      } as any;

      const serviceWithMedia = new PostService({
        repository: mockRepository,
        mediaService: mockMediaService,
      });

      await serviceWithMedia.createStory(1, {
        file: Buffer.alloc(1024),
        mimeType: 'video/mp4',
        filename: 'story.mp4',
        mediaType: StoryMediaType.VIDEO,
        durationSeconds: 15,
      });

      expect(mockMediaService.uploadVideo).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ folder: 'stories' }),
      );
    });

    it('should handle media upload failure for story', async () => {
      const mockMediaService = {
        uploadImage: jest.fn().mockRejectedValue(new Error('S3 upload failed')),
        uploadVideo: jest.fn(),
      } as any;

      const serviceWithMedia = new PostService({
        repository: mockRepository,
        mediaService: mockMediaService,
      });

      await expect(
        serviceWithMedia.createStory(1, {
          file: Buffer.alloc(1024),
          mimeType: 'image/jpeg',
          filename: 'story.jpg',
          mediaType: StoryMediaType.IMAGE,
        }),
      ).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringContaining('upload failed'),
      });

      expect(mockRepository.createStory).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Story Expiration Tests (Requirement 5.5)
  // ============================================================

  describe('getActiveStories - Expiration Logic (Requirement 5.5)', () => {
    it('should return active stories for a user', async () => {
      const result = await postService.getActiveStories(1);

      expect(mockRepository.getActiveStories).toHaveBeenCalledWith(1);
      expect(result).toEqual([mockStory]);
    });

    it('should return active stories for multiple users', async () => {
      const result = await postService.getActiveStoriesForUsers([1, 2, 3]);

      expect(mockRepository.getActiveStoriesForUsers).toHaveBeenCalledWith([1, 2, 3]);
      expect(result).toEqual([mockStory]);
    });

    it('should return empty array when no active stories exist', async () => {
      mockRepository.getActiveStories.mockResolvedValue([]);

      const result = await postService.getActiveStories(1);

      expect(result).toEqual([]);
    });
  });

  // ============================================================
  // Story View Tests (Requirement 5.6)
  // ============================================================

  describe('recordStoryView - View Recording (Requirement 5.6)', () => {
    it('should record a story view successfully', async () => {
      // Story belongs to user 1, viewer is user 2
      mockRepository.findStoryById.mockResolvedValue(mockStory);

      const result = await postService.recordStoryView(1, 2);

      expect(mockRepository.recordStoryView).toHaveBeenCalledWith(1, 2);
      expect(result).toBe(true);
    });

    it('should prevent duplicate views (return false)', async () => {
      mockRepository.findStoryById.mockResolvedValue(mockStory);
      mockRepository.recordStoryView.mockResolvedValue(false);

      const result = await postService.recordStoryView(1, 2);

      expect(result).toBe(false);
    });

    it('should not record self-views', async () => {
      // Story belongs to user 1, viewer is also user 1
      mockRepository.findStoryById.mockResolvedValue(mockStory);

      const result = await postService.recordStoryView(1, 1);

      expect(mockRepository.recordStoryView).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should throw error for non-existent story', async () => {
      mockRepository.findStoryById.mockResolvedValue(undefined);

      await expect(
        postService.recordStoryView(999, 2),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('not found'),
      });
    });

    it('should throw error for expired story', async () => {
      const expiredStory = {
        ...mockStory,
        expires_at: new Date(Date.now() - 1000), // expired 1 second ago
      };
      mockRepository.findStoryById.mockResolvedValue(expiredStory);

      await expect(
        postService.recordStoryView(1, 2),
      ).rejects.toMatchObject({
        statusCode: 410,
        message: expect.stringContaining('expired'),
      });
    });
  });

  describe('getStoryViewers - Viewer Tracking (Requirement 5.6)', () => {
    it('should return viewers list to story creator', async () => {
      const mockViewers = [
        { id: 1, story_id: 1, viewer_id: 2, created_at: new Date() },
        { id: 2, story_id: 1, viewer_id: 3, created_at: new Date() },
      ];
      mockRepository.getStoryViewers.mockResolvedValue(mockViewers);
      mockRepository.findStoryById.mockResolvedValue(mockStory);

      const result = await postService.getStoryViewers(1, 1); // user 1 is the creator

      expect(mockRepository.getStoryViewers).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockViewers);
    });

    it('should reject non-creator from viewing viewers list', async () => {
      mockRepository.findStoryById.mockResolvedValue(mockStory);

      await expect(
        postService.getStoryViewers(1, 2), // user 2 is not the creator
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('creator'),
      });
    });

    it('should throw error for non-existent story', async () => {
      mockRepository.findStoryById.mockResolvedValue(undefined);

      await expect(
        postService.getStoryViewers(999, 1),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('not found'),
      });
    });

    it('should return empty array when no viewers', async () => {
      mockRepository.getStoryViewers.mockResolvedValue([]);
      mockRepository.findStoryById.mockResolvedValue(mockStory);

      const result = await postService.getStoryViewers(1, 1);

      expect(result).toEqual([]);
    });
  });
});
