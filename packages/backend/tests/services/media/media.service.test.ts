/**
 * Unit tests for MediaService.
 *
 * Tests cover:
 * - File validation (type and size limits)
 * - Image upload with multi-resolution generation
 * - Video upload with compression and thumbnail
 * - Signed URL generation with expiration clamping
 * - Retry logic with exponential backoff
 *
 * S3 operations are mocked to avoid external dependencies.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';

import { MediaService } from '../../../src/services/media/media.service';
import {
  MediaError,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
} from '../../../src/services/media/types';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

const mockS3Send = jest.fn();
const mockGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

describe('MediaService', () => {
  let service: MediaService;
  let mockS3Client: jest.Mocked<S3Client>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockS3Client = {
      send: mockS3Send,
    } as any;

    mockS3Send.mockResolvedValue({});
    mockGetSignedUrl.mockResolvedValue('https://s3.example.com/signed-url');

    service = new MediaService({
      s3Client: mockS3Client as any,
      bucket: 'test-bucket',
    });
  });

  // ==========================================================================
  // validateFile tests
  // ==========================================================================

  describe('validateFile', () => {
    describe('image validation', () => {
      it('should accept valid JPEG image', () => {
        const file = Buffer.alloc(1024); // 1KB
        const result = service.validateFile(file, 'image', 'image/jpeg');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept valid PNG image', () => {
        const file = Buffer.alloc(1024);
        const result = service.validateFile(file, 'image', 'image/png');
        expect(result.valid).toBe(true);
      });

      it('should accept valid WebP image', () => {
        const file = Buffer.alloc(1024);
        const result = service.validateFile(file, 'image', 'image/webp');
        expect(result.valid).toBe(true);
      });

      it('should accept valid GIF image', () => {
        const file = Buffer.alloc(1024);
        const result = service.validateFile(file, 'image', 'image/gif');
        expect(result.valid).toBe(true);
      });

      it('should reject unsupported image format', () => {
        const file = Buffer.alloc(1024);
        const result = service.validateFile(file, 'image', 'image/bmp');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Unsupported image format');
        expect(result.error).toContain('JPEG, PNG, WebP, GIF');
      });

      it('should reject image exceeding 10MB', () => {
        const file = Buffer.alloc(MAX_IMAGE_SIZE + 1);
        const result = service.validateFile(file, 'image', 'image/jpeg');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('maximum allowed image size of 10MB');
      });

      it('should accept image exactly at 10MB', () => {
        const file = Buffer.alloc(MAX_IMAGE_SIZE);
        const result = service.validateFile(file, 'image', 'image/jpeg');
        expect(result.valid).toBe(true);
      });

      it('should reject empty image file', () => {
        const file = Buffer.alloc(0);
        const result = service.validateFile(file, 'image', 'image/jpeg');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('empty');
      });
    });

    describe('video validation', () => {
      it('should accept valid MP4 video', () => {
        const file = Buffer.alloc(1024);
        const result = service.validateFile(file, 'video', 'video/mp4');
        expect(result.valid).toBe(true);
      });

      it('should accept valid MOV video', () => {
        const file = Buffer.alloc(1024);
        const result = service.validateFile(file, 'video', 'video/quicktime');
        expect(result.valid).toBe(true);
      });

      it('should reject unsupported video format', () => {
        const file = Buffer.alloc(1024);
        const result = service.validateFile(file, 'video', 'video/avi');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Unsupported video format');
        expect(result.error).toContain('MP4, MOV');
      });

      it('should reject video exceeding 500MB', () => {
        const file = Buffer.alloc(MAX_VIDEO_SIZE + 1);
        const result = service.validateFile(file, 'video', 'video/mp4');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('maximum allowed video size of 500MB');
      });

      it('should accept video exactly at 500MB', () => {
        // We can't actually allocate 500MB in a test, so test with a smaller buffer
        // and verify the logic by checking the boundary
        const file = Buffer.alloc(MAX_VIDEO_SIZE);
        const result = service.validateFile(file, 'video', 'video/mp4');
        expect(result.valid).toBe(true);
      });

      it('should reject empty video file', () => {
        const file = Buffer.alloc(0);
        const result = service.validateFile(file, 'video', 'video/mp4');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('empty');
      });
    });
  });

  // ==========================================================================
  // resizeImage tests
  // ==========================================================================

  describe('resizeImage', () => {
    let testImage: Buffer;

    beforeAll(async () => {
      // Create a test image (100x50 red rectangle)
      testImage = await sharp({
        create: {
          width: 100,
          height: 50,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();
    });

    it('should resize image to specified width preserving aspect ratio', async () => {
      const resized = await service.resizeImage(testImage, { width: 50 });
      const metadata = await sharp(resized).metadata();
      expect(metadata.width).toBe(50);
      expect(metadata.height).toBe(25); // 50/100 * 50 = 25 (preserves 2:1 ratio)
    });

    it('should not enlarge image beyond original size', async () => {
      const resized = await service.resizeImage(testImage, { width: 200 });
      const metadata = await sharp(resized).metadata();
      expect(metadata.width).toBeLessThanOrEqual(100);
    });

    it('should handle square resize target', async () => {
      const squareImage = await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 3,
          background: { r: 0, g: 255, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const resized = await service.resizeImage(squareImage, { width: 100 });
      const metadata = await sharp(resized).metadata();
      expect(metadata.width).toBe(100);
      expect(metadata.height).toBe(100);
    });
  });

  // ==========================================================================
  // uploadImage tests
  // ==========================================================================

  describe('uploadImage', () => {
    let testImage: Buffer;

    beforeAll(async () => {
      testImage = await sharp({
        create: {
          width: 1500,
          height: 1000,
          channels: 3,
          background: { r: 128, g: 128, b: 128 },
        },
      })
        .jpeg()
        .toBuffer();
    });

    it('should upload image and generate multi-resolution variants', async () => {
      const result = await service.uploadImage(testImage, {
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
      });

      expect(result.key).toContain('original.jpg');
      expect(result.url).toBe('https://s3.example.com/signed-url');
      expect(result.variants).toHaveLength(3);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.filename).toBe('test.jpg');

      // Verify variant labels
      const labels = result.variants.map((v) => v.label);
      expect(labels).toContain('thumbnail');
      expect(labels).toContain('medium');
      expect(labels).toContain('large');
    });

    it('should generate correct variant dimensions preserving aspect ratio', async () => {
      const result = await service.uploadImage(testImage, {
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
      });

      const thumbnail = result.variants.find((v) => v.label === 'thumbnail')!;
      const medium = result.variants.find((v) => v.label === 'medium')!;
      const large = result.variants.find((v) => v.label === 'large')!;

      // Original is 1500x1000 (3:2 ratio)
      expect(thumbnail.width).toBe(150);
      expect(thumbnail.height).toBe(100); // 150/1500 * 1000

      expect(medium.width).toBe(600);
      expect(medium.height).toBe(400); // 600/1500 * 1000

      expect(large.width).toBe(1200);
      expect(large.height).toBe(800); // 1200/1500 * 1000
    });

    it('should upload to S3 (4 uploads: 3 variants + original)', async () => {
      await service.uploadImage(testImage, {
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
      });

      // 3 variants + 1 original = 4 S3 uploads
      expect(mockS3Send).toHaveBeenCalledTimes(4);
    });

    it('should use folder prefix when provided', async () => {
      await service.uploadImage(testImage, {
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
        folder: 'avatars',
      });

      const calls = mockS3Send.mock.calls;
      // Check that all uploads have the folder prefix
      for (const call of calls) {
        const command = call[0] as any;
        const input = command.input || command.Input || command;
        // The PutObjectCommand stores params in .input
        const key = input.Key || (command.constructor?.name === 'PutObjectCommand' && input.Key);
        if (key) {
          expect(key).toMatch(/^avatars\//);
        }
      }
      // Verify at least some calls were made
      expect(calls.length).toBeGreaterThan(0);
    });

    it('should throw MediaError for invalid image type', async () => {
      await expect(
        service.uploadImage(testImage, {
          filename: 'test.bmp',
          mimeType: 'image/bmp',
        }),
      ).rejects.toThrow(MediaError);
    });

    it('should throw MediaError for oversized image', async () => {
      const largeFile = Buffer.alloc(MAX_IMAGE_SIZE + 1);
      await expect(
        service.uploadImage(largeFile, {
          filename: 'large.jpg',
          mimeType: 'image/jpeg',
        }),
      ).rejects.toThrow(MediaError);
    });
  });

  // ==========================================================================
  // uploadVideo tests
  // ==========================================================================

  describe('uploadVideo', () => {
    it('should upload video and generate thumbnail', async () => {
      const videoFile = Buffer.alloc(1024 * 1024); // 1MB fake video

      const result = await service.uploadVideo(videoFile, {
        filename: 'test.mp4',
        mimeType: 'video/mp4',
      });

      expect(result.key).toContain('video.mp4');
      expect(result.url).toBe('https://s3.example.com/signed-url');
      expect(result.mimeType).toBe('video/mp4');
      expect(result.filename).toBe('test.mp4');

      // Should have a thumbnail variant
      expect(result.variants).toHaveLength(1);
      expect(result.variants[0]!.label).toBe('thumbnail');
      expect(result.variants[0]!.key).toContain('thumbnail.jpg');
    });

    it('should upload 2 files to S3 (video + thumbnail)', async () => {
      const videoFile = Buffer.alloc(1024);

      await service.uploadVideo(videoFile, {
        filename: 'test.mp4',
        mimeType: 'video/mp4',
      });

      // 1 video + 1 thumbnail = 2 S3 uploads
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });

    it('should throw MediaError for invalid video type', async () => {
      const videoFile = Buffer.alloc(1024);
      await expect(
        service.uploadVideo(videoFile, {
          filename: 'test.avi',
          mimeType: 'video/avi',
        }),
      ).rejects.toThrow(MediaError);
    });

    it('should throw MediaError for oversized video', async () => {
      const largeFile = Buffer.alloc(MAX_VIDEO_SIZE + 1);
      await expect(
        service.uploadVideo(largeFile, {
          filename: 'large.mp4',
          mimeType: 'video/mp4',
        }),
      ).rejects.toThrow(MediaError);
    });

    it('should use folder prefix when provided', async () => {
      const videoFile = Buffer.alloc(1024);

      await service.uploadVideo(videoFile, {
        filename: 'test.mp4',
        mimeType: 'video/mp4',
        folder: 'reels',
      });

      const calls = mockS3Send.mock.calls;
      for (const call of calls) {
        const command = call[0] as any;
        const input = command.input || command.Input || command;
        const key = input.Key;
        if (key) {
          expect(key).toMatch(/^reels\//);
        }
      }
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // getSignedUrl tests
  // ==========================================================================

  describe('getSignedUrl', () => {
    it('should generate signed URL with default expiration (3600s)', async () => {
      const url = await service.getSignedUrl('test-key');

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(GetObjectCommand),
        { expiresIn: 3600 },
      );
      expect(url).toBe('https://s3.example.com/signed-url');
    });

    it('should clamp expiration to minimum (300s)', async () => {
      await service.getSignedUrl('test-key', 100);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(GetObjectCommand),
        { expiresIn: 300 },
      );
    });

    it('should clamp expiration to maximum (86400s)', async () => {
      await service.getSignedUrl('test-key', 100000);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(GetObjectCommand),
        { expiresIn: 86400 },
      );
    });

    it('should accept valid expiration within range', async () => {
      await service.getSignedUrl('test-key', 7200);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(GetObjectCommand),
        { expiresIn: 7200 },
      );
    });

    it('should use default when expiration is undefined', async () => {
      await service.getSignedUrl('test-key', undefined);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(GetObjectCommand),
        { expiresIn: 3600 },
      );
    });
  });

  // ==========================================================================
  // Retry logic tests
  // ==========================================================================

  describe('retry logic', () => {
    it('should succeed on first attempt without retry', async () => {
      const videoFile = Buffer.alloc(1024);

      await service.uploadVideo(videoFile, {
        filename: 'test.mp4',
        mimeType: 'video/mp4',
      });

      // Each upload should only be called once (no retries)
      expect(mockS3Send).toHaveBeenCalledTimes(2); // video + thumbnail
    });

    it('should retry on S3 failure and succeed on second attempt', async () => {
      // First call fails, second succeeds (for each upload)
      mockS3Send
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const testImage = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      // Use a small image that won't need all resolutions
      // We need to mock the sleep to speed up the test
      jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      // uploadImage will try to upload 4 files (3 variants + original)
      // First upload fails once then succeeds, rest succeed immediately
      mockS3Send
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({});

      const result = await service.uploadImage(testImage, {
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
      });

      expect(result.key).toContain('original.jpg');
    });

    it('should throw MediaError after 3 failed attempts', async () => {
      mockS3Send.mockRejectedValue(new Error('Persistent S3 error'));

      jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      // Use uploadVideo which does sequential uploads (video then thumbnail)
      const videoFile = Buffer.alloc(1024);

      try {
        await service.uploadVideo(videoFile, {
          filename: 'test.mp4',
          mimeType: 'video/mp4',
        });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MediaError);
        expect((error as MediaError).message).toBe('Upload failed after all retry attempts');
        expect((error as MediaError).statusCode).toBe(500);
        expect((error as MediaError).details?.code).toBe('UPLOAD_FAILED');
      }
    });

    it('should use exponential backoff delays', async () => {
      const sleepSpy = jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

      // Fail all 3 attempts
      mockS3Send.mockRejectedValue(new Error('S3 error'));

      const videoFile = Buffer.alloc(1024);

      try {
        await service.uploadVideo(videoFile, {
          filename: 'test.mp4',
          mimeType: 'video/mp4',
        });
      } catch {
        // Expected to throw
      }

      // Should have called sleep with exponential backoff delays
      // Between attempt 1 and 2: 2000ms (2s * 2^0)
      // Between attempt 2 and 3: 4000ms (2s * 2^1)
      expect(sleepSpy).toHaveBeenCalledWith(2000);
      expect(sleepSpy).toHaveBeenCalledWith(4000);
    });
  });

  // ==========================================================================
  // compressVideo tests
  // ==========================================================================

  describe('compressVideo', () => {
    it('should return buffer (placeholder implementation)', async () => {
      const input = Buffer.alloc(1024);
      const result = await service.compressVideo(input, { codec: 'h264' });
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // generateThumbnail tests
  // ==========================================================================

  describe('generateThumbnail', () => {
    it('should generate a JPEG thumbnail', async () => {
      const videoFile = Buffer.alloc(1024);
      const thumbnail = await service.generateThumbnail(videoFile);

      expect(Buffer.isBuffer(thumbnail)).toBe(true);
      expect(thumbnail.length).toBeGreaterThan(0);

      // Verify it's a valid JPEG
      const metadata = await sharp(thumbnail).metadata();
      expect(metadata.format).toBe('jpeg');
      expect(metadata.width).toBe(600);
    });
  });
});
