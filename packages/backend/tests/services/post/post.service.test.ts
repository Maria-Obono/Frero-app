/**
 * Unit tests for PostService - Post Creation
 *
 * Tests cover:
 * - Content validation: 1-5000 chars (Req 4.8)
 * - Carousel validation: 2-10 items (Req 4.9)
 * - Hashtag extraction: max 30 per post (Req 4.5)
 * - Mention extraction: max 20 per post (Req 4.6)
 * - Privacy enforcement (Req 4.7)
 * - Media upload integration (Req 4.2, 4.3, 4.10, 4.11)
 * - Carousel order preservation (Req 4.4)
 */

import {
  PostService,
  PostRepository,
  PostType,
  PostPrivacy,
  PostServiceError,
  MediaType,
  INotificationTrigger,
} from '../../../src/services/post';

describe('PostService', () => {
  let postService: PostService;
  let mockRepository: jest.Mocked<PostRepository>;
  let mockNotificationTrigger: jest.Mocked<INotificationTrigger>;

  const mockPost = {
    id: 1,
    user_id: 1,
    type: PostType.TEXT,
    content: 'Hello world',
    privacy: PostPrivacy.PUBLIC,
    like_count: 0,
    comment_count: 0,
    share_count: 0,
    deleted_at: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  beforeEach(() => {
    mockRepository = {
      create: jest.fn().mockResolvedValue(1),
      findById: jest.fn().mockResolvedValue(mockPost),
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
    } as any;

    mockNotificationTrigger = {
      notifyMention: jest.fn().mockResolvedValue(undefined),
    };

    postService = new PostService({
      repository: mockRepository,
      notificationTrigger: mockNotificationTrigger,
    });
  });

  describe('createPost - Content Validation (Requirement 4.8)', () => {
    it('should create a text post with valid content', async () => {
      const result = await postService.createPost(1, {
        type: PostType.TEXT,
        content: 'Hello world!',
        privacy: PostPrivacy.PUBLIC,
      });

      expect(mockRepository.create).toHaveBeenCalledWith({
        user_id: 1,
        type: PostType.TEXT,
        content: 'Hello world!',
        privacy: PostPrivacy.PUBLIC,
      });
      expect(result.id).toBe(1);
    });

    it('should accept content of exactly 1 character', async () => {
      await postService.createPost(1, {
        type: PostType.TEXT,
        content: 'A',
        privacy: PostPrivacy.PUBLIC,
      });

      expect(mockRepository.create).toHaveBeenCalled();
    });

    it('should accept content of exactly 5000 characters', async () => {
      const content = 'a'.repeat(5000);

      await postService.createPost(1, {
        type: PostType.TEXT,
        content,
        privacy: PostPrivacy.PUBLIC,
      });

      expect(mockRepository.create).toHaveBeenCalled();
    });

    it('should reject text post with empty content', async () => {
      await expect(
        postService.createPost(1, {
          type: PostType.TEXT,
          content: '',
          privacy: PostPrivacy.PUBLIC,
        }),
      ).rejects.toThrow(PostServiceError);

      await expect(
        postService.createPost(1, {
          type: PostType.TEXT,
          content: '',
          privacy: PostPrivacy.PUBLIC,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('at least 1 character'),
      });
    });

    it('should reject text post with no content', async () => {
      await expect(
        postService.createPost(1, {
          type: PostType.TEXT,
          privacy: PostPrivacy.PUBLIC,
        }),
      ).rejects.toThrow(PostServiceError);
    });

    it('should reject post with content exceeding 5000 characters', async () => {
      const content = 'a'.repeat(5001);

      await expect(
        postService.createPost(1, {
          type: PostType.TEXT,
          content,
          privacy: PostPrivacy.PUBLIC,
        }),
      ).rejects.toThrow(PostServiceError);

      await expect(
        postService.createPost(1, {
          type: PostType.TEXT,
          content,
          privacy: PostPrivacy.PUBLIC,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('5000'),
      });
    });

    it('should allow photo posts with optional content', async () => {
      const media = [{
        file: Buffer.alloc(1024),
        mimeType: 'image/jpeg',
        filename: 'photo.jpg',
      }];

      await postService.createPost(1, {
        type: PostType.PHOTO,
        privacy: PostPrivacy.PUBLIC,
        media,
      });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ content: null }),
      );
    });

    it('should reject photo post with content exceeding 5000 characters', async () => {
      const content = 'a'.repeat(5001);
      const media = [{
        file: Buffer.alloc(1024),
        mimeType: 'image/jpeg',
        filename: 'photo.jpg',
      }];

      await expect(
        postService.createPost(1, {
          type: PostType.PHOTO,
          content,
          privacy: PostPrivacy.PUBLIC,
          media,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('5000'),
      });
    });
  });

  describe('createPost - Carousel Validation (Requirement 4.9)', () => {
    const makeMediaItems = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        file: Buffer.alloc(1024),
        mimeType: 'image/jpeg',
        filename: `photo${i}.jpg`,
      }));

    it('should accept carousel with exactly 2 items', async () => {
      await postService.createPost(1, {
        type: PostType.CAROUSEL,
        content: 'My carousel',
        privacy: PostPrivacy.PUBLIC,
        media: makeMediaItems(2),
      });

      expect(mockRepository.create).toHaveBeenCalled();
    });

    it('should accept carousel with exactly 10 items', async () => {
      await postService.createPost(1, {
        type: PostType.CAROUSEL,
        content: 'Big carousel',
        privacy: PostPrivacy.PUBLIC,
        media: makeMediaItems(10),
      });

      expect(mockRepository.create).toHaveBeenCalled();
    });

    it('should accept carousel with 5 items (middle of range)', async () => {
      await postService.createPost(1, {
        type: PostType.CAROUSEL,
        content: 'Medium carousel',
        privacy: PostPrivacy.PUBLIC,
        media: makeMediaItems(5),
      });

      expect(mockRepository.create).toHaveBeenCalled();
    });

    it('should reject carousel with fewer than 2 items', async () => {
      await expect(
        postService.createPost(1, {
          type: PostType.CAROUSEL,
          content: 'Too few',
          privacy: PostPrivacy.PUBLIC,
          media: makeMediaItems(1),
        }),
      ).rejects.toThrow(PostServiceError);

      await expect(
        postService.createPost(1, {
          type: PostType.CAROUSEL,
          content: 'Too few',
          privacy: PostPrivacy.PUBLIC,
          media: makeMediaItems(1),
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('at least 2'),
      });
    });

    it('should reject carousel with 0 items', async () => {
      await expect(
        postService.createPost(1, {
          type: PostType.CAROUSEL,
          content: 'Empty carousel',
          privacy: PostPrivacy.PUBLIC,
          media: [],
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('at least 2'),
      });
    });

    it('should reject carousel with more than 10 items', async () => {
      await expect(
        postService.createPost(1, {
          type: PostType.CAROUSEL,
          content: 'Too many',
          privacy: PostPrivacy.PUBLIC,
          media: makeMediaItems(11),
        }),
      ).rejects.toThrow(PostServiceError);

      await expect(
        postService.createPost(1, {
          type: PostType.CAROUSEL,
          content: 'Too many',
          privacy: PostPrivacy.PUBLIC,
          media: makeMediaItems(11),
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('maximum of 10'),
      });
    });

    it('should preserve media order via order_index', async () => {
      const media = makeMediaItems(3);

      await postService.createPost(1, {
        type: PostType.CAROUSEL,
        content: 'Ordered carousel',
        privacy: PostPrivacy.PUBLIC,
        media,
      });

      expect(mockRepository.createPostMedia).toHaveBeenCalledTimes(3);
      expect(mockRepository.createPostMedia).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ order_index: 0 }),
      );
      expect(mockRepository.createPostMedia).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ order_index: 1 }),
      );
      expect(mockRepository.createPostMedia).toHaveBeenNthCalledWith(3,
        expect.objectContaining({ order_index: 2 }),
      );
    });
  });

  describe('createPost - Hashtag Extraction (Requirement 4.5)', () => {
    it('should extract hashtags from content', async () => {
      mockRepository.getPostHashtags.mockResolvedValue(['hello', 'world']);

      const result = await postService.createPost(1, {
        type: PostType.TEXT,
        content: 'Hello #hello #world',
        privacy: PostPrivacy.PUBLIC,
      });

      expect(mockRepository.findOrCreateHashtag).toHaveBeenCalledWith('hello');
      expect(mockRepository.findOrCreateHashtag).toHaveBeenCalledWith('world');
      expect(mockRepository.createPostHashtag).toHaveBeenCalledTimes(2);
      expect(result.hashtags).toEqual(['hello', 'world']);
    });

    it('should extract hashtags case-insensitively (lowercase)', async () => {
      await postService.createPost(1, {
        type: PostType.TEXT,
        content: '#Hello #WORLD #Test',
        privacy: PostPrivacy.PUBLIC,
      });

      expect(mockRepository.findOrCreateHashtag).toHaveBeenCalledWith('hello');
      expect(mockRepository.findOrCreateHashtag).toHaveBeenCalledWith('world');
      expect(mockRepository.findOrCreateHashtag).toHaveBeenCalledWith('test');
    });

    it('should deduplicate hashtags', async () => {
      await postService.createPost(1, {
        type: PostType.TEXT,
        content: '#hello #Hello #HELLO',
        privacy: PostPrivacy.PUBLIC,
      });

      expect(mockRepository.findOrCreateHashtag).toHaveBeenCalledTimes(1);
      expect(mockRepository.findOrCreateHashtag).toHaveBeenCalledWith('hello');
    });

    it('should limit hashtags to 30 per post', async () => {
      const tags = Array.from({ length: 35 }, (_, i) => `#tag${i}`).join(' ');

      await postService.createPost(1, {
        type: PostType.TEXT,
        content: `Post with many tags ${tags}`,
        privacy: PostPrivacy.PUBLIC,
      });

      expect(mockRepository.findOrCreateHashtag).toHaveBeenCalledTimes(30);
    });

    it('should handle content with no hashtags', async () => {
      await postService.createPost(1, {
        type: PostType.TEXT,
        content: 'No hashtags here',
        privacy: PostPrivacy.PUBLIC,
      });

      expect(mockRepository.findOrCreateHashtag).not.toHaveBeenCalled();
    });

    it('should extract hashtags with underscores and numbers', async () => {
      await postService.createPost(1, {
        type: PostType.TEXT,
        content: '#hello_world #test123',
        privacy: PostPrivacy.PUBLIC,
      });

      expect(mockRepository.findOrCreateHashtag).toHaveBeenCalledWith('hello_world');
      expect(mockRepository.findOrCreateHashtag).toHaveBeenCalledWith('test123');
    });
  });

  describe('createPost - Mention Extraction (Requirement 4.6)', () => {
    it('should extract mentions from content', async () => {
      await postService.createPost(1, {
        type: PostType.TEXT,
        content: 'Hello @john and @jane',
        privacy: PostPrivacy.PUBLIC,
      });

      expect(mockNotificationTrigger.notifyMention).toHaveBeenCalledWith(1, 1, 'john');
      expect(mockNotificationTrigger.notifyMention).toHaveBeenCalledWith(1, 1, 'jane');
    });

    it('should deduplicate mentions', async () => {
      await postService.createPost(1, {
        type: PostType.TEXT,
        content: 'Hello @john and @John again',
        privacy: PostPrivacy.PUBLIC,
      });

      expect(mockNotificationTrigger.notifyMention).toHaveBeenCalledTimes(1);
      expect(mockNotificationTrigger.notifyMention).toHaveBeenCalledWith(1, 1, 'john');
    });

    it('should limit mentions to 20 per post', async () => {
      const mentions = Array.from({ length: 25 }, (_, i) => `@user${i}`).join(' ');

      await postService.createPost(1, {
        type: PostType.TEXT,
        content: `Post with many mentions ${mentions}`,
        privacy: PostPrivacy.PUBLIC,
      });

      expect(mockNotificationTrigger.notifyMention).toHaveBeenCalledTimes(20);
    });

    it('should handle content with no mentions', async () => {
      await postService.createPost(1, {
        type: PostType.TEXT,
        content: 'No mentions here',
        privacy: PostPrivacy.PUBLIC,
      });

      expect(mockNotificationTrigger.notifyMention).not.toHaveBeenCalled();
    });

    it('should not fail post creation if notification fails', async () => {
      mockNotificationTrigger.notifyMention.mockRejectedValue(new Error('Notification failed'));

      const result = await postService.createPost(1, {
        type: PostType.TEXT,
        content: 'Hello @john',
        privacy: PostPrivacy.PUBLIC,
      });

      expect(result.id).toBe(1);
    });
  });

  describe('createPost - Privacy Settings (Requirement 4.7)', () => {
    it('should create post with public privacy', async () => {
      await postService.createPost(1, {
        type: PostType.TEXT,
        content: 'Public post',
        privacy: PostPrivacy.PUBLIC,
      });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ privacy: PostPrivacy.PUBLIC }),
      );
    });

    it('should create post with friends-only privacy', async () => {
      await postService.createPost(1, {
        type: PostType.TEXT,
        content: 'Friends only post',
        privacy: PostPrivacy.FRIENDS,
      });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ privacy: PostPrivacy.FRIENDS }),
      );
    });

    it('should create post with private privacy', async () => {
      await postService.createPost(1, {
        type: PostType.TEXT,
        content: 'Private post',
        privacy: PostPrivacy.PRIVATE,
      });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ privacy: PostPrivacy.PRIVATE }),
      );
    });
  });

  describe('createPost - Photo Post (Requirements 4.2, 4.11)', () => {
    it('should create photo post with valid image', async () => {
      const media = [{
        file: Buffer.alloc(1024),
        mimeType: 'image/jpeg',
        filename: 'photo.jpg',
        width: 800,
        height: 600,
      }];

      await postService.createPost(1, {
        type: PostType.PHOTO,
        content: 'My photo',
        privacy: PostPrivacy.PUBLIC,
        media,
      });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: PostType.PHOTO }),
      );
      expect(mockRepository.createPostMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          post_id: 1,
          type: MediaType.IMAGE,
          order_index: 0,
          width: 800,
          height: 600,
        }),
      );
    });

    it('should reject photo exceeding 15MB', async () => {
      const media = [{
        file: Buffer.alloc(16 * 1024 * 1024), // 16MB
        mimeType: 'image/jpeg',
        filename: 'large.jpg',
      }];

      await expect(
        postService.createPost(1, {
          type: PostType.PHOTO,
          privacy: PostPrivacy.PUBLIC,
          media,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('15MB'),
      });
    });

    it('should accept photo of exactly 15MB', async () => {
      const media = [{
        file: Buffer.alloc(15 * 1024 * 1024), // exactly 15MB
        mimeType: 'image/jpeg',
        filename: 'max.jpg',
      }];

      await postService.createPost(1, {
        type: PostType.PHOTO,
        privacy: PostPrivacy.PUBLIC,
        media,
      });

      expect(mockRepository.create).toHaveBeenCalled();
    });

    it('should reject invalid image format', async () => {
      const media = [{
        file: Buffer.alloc(1024),
        mimeType: 'image/bmp',
        filename: 'photo.bmp',
      }];

      await expect(
        postService.createPost(1, {
          type: PostType.PHOTO,
          privacy: PostPrivacy.PUBLIC,
          media,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('JPEG, PNG, WebP, GIF'),
      });
    });

    it('should reject photo post with no media', async () => {
      await expect(
        postService.createPost(1, {
          type: PostType.PHOTO,
          privacy: PostPrivacy.PUBLIC,
          media: [],
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('at least 1 image'),
      });
    });
  });

  describe('createPost - Video Post (Requirements 4.3, 4.11)', () => {
    it('should create video post with valid video', async () => {
      const media = [{
        file: Buffer.alloc(1024),
        mimeType: 'video/mp4',
        filename: 'video.mp4',
        durationSeconds: 120,
      }];

      await postService.createPost(1, {
        type: PostType.VIDEO,
        content: 'My video',
        privacy: PostPrivacy.PUBLIC,
        media,
      });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: PostType.VIDEO }),
      );
      expect(mockRepository.createPostMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MediaType.VIDEO,
          duration_seconds: 120,
        }),
      );
    });

    it('should reject video exceeding 500MB', async () => {
      const media = [{
        file: Buffer.alloc(501 * 1024 * 1024),
        mimeType: 'video/mp4',
        filename: 'large.mp4',
      }];

      await expect(
        postService.createPost(1, {
          type: PostType.VIDEO,
          privacy: PostPrivacy.PUBLIC,
          media,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('500MB'),
      });
    });

    it('should reject video exceeding 10 minutes', async () => {
      const media = [{
        file: Buffer.alloc(1024),
        mimeType: 'video/mp4',
        filename: 'long.mp4',
        durationSeconds: 601,
      }];

      await expect(
        postService.createPost(1, {
          type: PostType.VIDEO,
          privacy: PostPrivacy.PUBLIC,
          media,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('10 minutes'),
      });
    });

    it('should accept video of exactly 10 minutes', async () => {
      const media = [{
        file: Buffer.alloc(1024),
        mimeType: 'video/mp4',
        filename: 'max.mp4',
        durationSeconds: 600,
      }];

      await postService.createPost(1, {
        type: PostType.VIDEO,
        privacy: PostPrivacy.PUBLIC,
        media,
      });

      expect(mockRepository.create).toHaveBeenCalled();
    });

    it('should reject invalid video format', async () => {
      const media = [{
        file: Buffer.alloc(1024),
        mimeType: 'video/avi',
        filename: 'video.avi',
      }];

      await expect(
        postService.createPost(1, {
          type: PostType.VIDEO,
          privacy: PostPrivacy.PUBLIC,
          media,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('MP4, MOV'),
      });
    });

    it('should reject video post with no media', async () => {
      await expect(
        postService.createPost(1, {
          type: PostType.VIDEO,
          privacy: PostPrivacy.PUBLIC,
          media: [],
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('requires a video file'),
      });
    });
  });

  describe('createPost - Media Upload Failure (Requirement 4.10)', () => {
    it('should not persist post if media upload fails', async () => {
      const mockMediaService = {
        uploadImage: jest.fn().mockRejectedValue(new Error('S3 upload failed')),
        uploadVideo: jest.fn(),
      } as any;

      const serviceWithMedia = new PostService({
        repository: mockRepository,
        mediaService: mockMediaService,
      });

      const media = [{
        file: Buffer.alloc(1024),
        mimeType: 'image/jpeg',
        filename: 'photo.jpg',
      }];

      await expect(
        serviceWithMedia.createPost(1, {
          type: PostType.PHOTO,
          privacy: PostPrivacy.PUBLIC,
          media,
        }),
      ).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringContaining('Media upload failed'),
      });

      expect(mockRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('extractHashtags', () => {
    it('should extract simple hashtags', () => {
      const result = postService.extractHashtags('Hello #world');
      expect(result).toEqual(['world']);
    });

    it('should extract multiple hashtags', () => {
      const result = postService.extractHashtags('#hello #world #test');
      expect(result).toEqual(['hello', 'world', 'test']);
    });

    it('should handle hashtags with numbers', () => {
      const result = postService.extractHashtags('#test123 #2024');
      expect(result).toEqual(['test123', '2024']);
    });

    it('should handle hashtags with underscores', () => {
      const result = postService.extractHashtags('#hello_world');
      expect(result).toEqual(['hello_world']);
    });

    it('should return empty array for content without hashtags', () => {
      const result = postService.extractHashtags('No hashtags here');
      expect(result).toEqual([]);
    });

    it('should return empty array for empty content', () => {
      const result = postService.extractHashtags('');
      expect(result).toEqual([]);
    });

    it('should deduplicate hashtags (case-insensitive)', () => {
      const result = postService.extractHashtags('#Hello #hello #HELLO');
      expect(result).toEqual(['hello']);
    });

    it('should limit to 30 hashtags', () => {
      const tags = Array.from({ length: 35 }, (_, i) => `#tag${i}`).join(' ');
      const result = postService.extractHashtags(tags);
      expect(result).toHaveLength(30);
    });

    it('should not extract # without word characters', () => {
      const result = postService.extractHashtags('# alone or #');
      expect(result).toEqual([]);
    });
  });

  describe('extractMentions', () => {
    it('should extract simple mentions', () => {
      const result = postService.extractMentions('Hello @john');
      expect(result).toEqual(['john']);
    });

    it('should extract multiple mentions', () => {
      const result = postService.extractMentions('@alice @bob @charlie');
      expect(result).toEqual(['alice', 'bob', 'charlie']);
    });

    it('should handle mentions with numbers', () => {
      const result = postService.extractMentions('@user123');
      expect(result).toEqual(['user123']);
    });

    it('should handle mentions with underscores', () => {
      const result = postService.extractMentions('@john_doe');
      expect(result).toEqual(['john_doe']);
    });

    it('should return empty array for content without mentions', () => {
      const result = postService.extractMentions('No mentions here');
      expect(result).toEqual([]);
    });

    it('should return empty array for empty content', () => {
      const result = postService.extractMentions('');
      expect(result).toEqual([]);
    });

    it('should deduplicate mentions (case-insensitive)', () => {
      const result = postService.extractMentions('@John @john @JOHN');
      expect(result).toEqual(['john']);
    });

    it('should limit to 20 mentions', () => {
      const mentions = Array.from({ length: 25 }, (_, i) => `@user${i}`).join(' ');
      const result = postService.extractMentions(mentions);
      expect(result).toHaveLength(20);
    });

    it('should not extract @ without word characters', () => {
      const result = postService.extractMentions('@ alone or @');
      expect(result).toEqual([]);
    });
  });

  describe('createPost - Combined hashtags and mentions', () => {
    it('should extract both hashtags and mentions from same content', async () => {
      mockRepository.getPostHashtags.mockResolvedValue(['coding']);

      await postService.createPost(1, {
        type: PostType.TEXT,
        content: 'Hey @john check out #coding',
        privacy: PostPrivacy.PUBLIC,
      });

      expect(mockRepository.findOrCreateHashtag).toHaveBeenCalledWith('coding');
      expect(mockNotificationTrigger.notifyMention).toHaveBeenCalledWith(1, 1, 'john');
    });
  });

  describe('createPost - Carousel Order Preservation (Requirement 4.4)', () => {
    it('should create media records with sequential order_index', async () => {
      const media = [
        { file: Buffer.alloc(100), mimeType: 'image/jpeg', filename: 'first.jpg' },
        { file: Buffer.alloc(200), mimeType: 'image/png', filename: 'second.png' },
        { file: Buffer.alloc(300), mimeType: 'video/mp4', filename: 'third.mp4', durationSeconds: 30 },
      ];

      await postService.createPost(1, {
        type: PostType.CAROUSEL,
        content: 'Mixed carousel',
        privacy: PostPrivacy.PUBLIC,
        media,
      });

      expect(mockRepository.createPostMedia).toHaveBeenCalledTimes(3);

      // Verify order is preserved
      const calls = mockRepository.createPostMedia.mock.calls;
      expect(calls[0]![0]).toMatchObject({ order_index: 0, type: MediaType.IMAGE });
      expect(calls[1]![0]).toMatchObject({ order_index: 1, type: MediaType.IMAGE });
      expect(calls[2]![0]).toMatchObject({ order_index: 2, type: MediaType.VIDEO });
    });
  });
});
