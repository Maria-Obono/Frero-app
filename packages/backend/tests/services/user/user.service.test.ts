/**
 * Unit tests for UserService - Profile Management
 *
 * Tests cover:
 * - getProfile with privacy-aware field filtering (Req 2.5)
 * - updateProfile with field validation (Req 2.1, 2.2)
 * - uploadProfilePhoto with image validation and resizing (Req 2.3, 2.6, 2.7, 2.8)
 * - uploadCoverPhoto with image validation and resizing (Req 2.4, 2.6, 2.7, 2.8)
 */

import { UserService, IMediaUploader, UserServiceError } from '../../../src/services/user';
import { UserProfileRepository } from '../../../src/services/user/user.repository';

// Mock sharp
const mockResize = jest.fn().mockReturnThis();
const mockToBuffer = jest.fn().mockResolvedValue(Buffer.from('resized-image'));
jest.mock('sharp', () => {
  return jest.fn(() => ({
    resize: mockResize,
    toBuffer: mockToBuffer,
  }));
});

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

describe('UserService', () => {
  let userService: UserService;
  let mockRepository: jest.Mocked<UserProfileRepository>;
  let mockMediaUploader: jest.Mocked<IMediaUploader>;

  const mockUser = {
    id: 1,
    email: 'john@example.com',
    username: 'johndoe',
    password_hash: 'hashed',
    display_name: 'John Doe',
    bio: 'Hello world',
    location: 'New York',
    website: 'https://johndoe.com',
    avatar_url: 'https://s3.amazonaws.com/avatars/1/old.jpg',
    cover_url: 'https://s3.amazonaws.com/covers/1/old.jpg',
    role: 'user' as const,
    is_2fa_enabled: false,
    totp_secret: null,
    locked_until: null,
    failed_login_attempts: 0,
    deleted_at: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  beforeEach(() => {
    mockResize.mockClear();
    mockToBuffer.mockClear();

    mockRepository = {
      findProfileById: jest.fn(),
      updateProfile: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      findPaginated: jest.fn(),
      create: jest.fn(),
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

    mockMediaUploader = {
      upload: jest.fn().mockImplementation((_buffer: Buffer, key: string, _contentType: string) => {
        return Promise.resolve(`https://frero-media.s3.amazonaws.com/${key}`);
      }),
    };

    userService = new UserService({
      repository: mockRepository,
      mediaUploader: mockMediaUploader,
    });
  });

  describe('getProfile', () => {
    it('should return all fields when requester is the profile owner', async () => {
      mockRepository.findProfileById.mockResolvedValue(mockUser);

      const profile = await userService.getProfile(1, 1);

      expect(profile.id).toBe(1);
      expect(profile.email).toBe('john@example.com');
      expect(profile.username).toBe('johndoe');
      expect(profile.display_name).toBe('John Doe');
      expect(profile.bio).toBe('Hello world');
      expect(profile.location).toBe('New York');
      expect(profile.website).toBe('https://johndoe.com');
      expect(profile.avatar_url).toBe('https://s3.amazonaws.com/avatars/1/old.jpg');
      expect(profile.cover_url).toBe('https://s3.amazonaws.com/covers/1/old.jpg');
      expect(profile.role).toBe('user');
      expect(profile.created_at).toEqual(new Date('2024-01-01'));
    });

    it('should exclude email when requester is not the profile owner', async () => {
      mockRepository.findProfileById.mockResolvedValue(mockUser);

      const profile = await userService.getProfile(1, 2);

      expect(profile.id).toBe(1);
      expect(profile.username).toBe('johndoe');
      expect(profile.display_name).toBe('John Doe');
      expect(profile.email).toBeUndefined();
    });

    it('should exclude email when no requester is provided', async () => {
      mockRepository.findProfileById.mockResolvedValue(mockUser);

      const profile = await userService.getProfile(1);

      expect(profile.id).toBe(1);
      expect(profile.username).toBe('johndoe');
      expect(profile.email).toBeUndefined();
    });

    it('should throw 404 when user does not exist', async () => {
      mockRepository.findProfileById.mockResolvedValue(undefined);

      await expect(userService.getProfile(999)).rejects.toThrow(UserServiceError);
      await expect(userService.getProfile(999)).rejects.toMatchObject({
        statusCode: 404,
        message: 'User not found',
      });
    });
  });

  describe('updateProfile', () => {
    beforeEach(() => {
      mockRepository.findProfileById.mockResolvedValue(mockUser);
      mockRepository.updateProfile.mockResolvedValue(1);
    });

    it('should update display_name successfully', async () => {
      const updatedUser = { ...mockUser, display_name: 'Jane Doe' };
      mockRepository.findProfileById
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(updatedUser);

      const profile = await userService.updateProfile(1, { display_name: 'Jane Doe' });

      expect(mockRepository.updateProfile).toHaveBeenCalledWith(1, { display_name: 'Jane Doe' });
      expect(profile.display_name).toBe('Jane Doe');
    });

    it('should update bio successfully', async () => {
      const updatedUser = { ...mockUser, bio: 'New bio' };
      mockRepository.findProfileById
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(updatedUser);

      const profile = await userService.updateProfile(1, { bio: 'New bio' });

      expect(mockRepository.updateProfile).toHaveBeenCalledWith(1, { bio: 'New bio' });
      expect(profile.bio).toBe('New bio');
    });

    it('should update multiple fields at once', async () => {
      const updatedUser = { ...mockUser, display_name: 'New Name', location: 'LA' };
      mockRepository.findProfileById
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(updatedUser);

      const profile = await userService.updateProfile(1, {
        display_name: 'New Name',
        location: 'LA',
      });

      expect(mockRepository.updateProfile).toHaveBeenCalledWith(1, {
        display_name: 'New Name',
        location: 'LA',
      });
      expect(profile.display_name).toBe('New Name');
      expect(profile.location).toBe('LA');
    });

    it('should reject display_name shorter than 1 character', async () => {
      await expect(
        userService.updateProfile(1, { display_name: '' }),
      ).rejects.toThrow(UserServiceError);

      await expect(
        userService.updateProfile(1, { display_name: '' }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: 'display_name',
            message: expect.stringContaining('at least 1 character'),
          }),
        ]),
      });

      // Existing data should be preserved (no update call)
      expect(mockRepository.updateProfile).not.toHaveBeenCalled();
    });

    it('should reject display_name longer than 50 characters', async () => {
      const longName = 'a'.repeat(51);

      await expect(
        userService.updateProfile(1, { display_name: longName }),
      ).rejects.toThrow(UserServiceError);

      await expect(
        userService.updateProfile(1, { display_name: longName }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: 'display_name',
            message: expect.stringContaining('50 characters'),
          }),
        ]),
      });
    });

    it('should accept display_name of exactly 1 character', async () => {
      const updatedUser = { ...mockUser, display_name: 'A' };
      mockRepository.findProfileById
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(updatedUser);

      const profile = await userService.updateProfile(1, { display_name: 'A' });
      expect(profile.display_name).toBe('A');
    });

    it('should accept display_name of exactly 50 characters', async () => {
      const name50 = 'a'.repeat(50);
      const updatedUser = { ...mockUser, display_name: name50 };
      mockRepository.findProfileById
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(updatedUser);

      const profile = await userService.updateProfile(1, { display_name: name50 });
      expect(profile.display_name).toBe(name50);
    });

    it('should reject bio longer than 500 characters', async () => {
      const longBio = 'a'.repeat(501);

      await expect(
        userService.updateProfile(1, { bio: longBio }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: 'bio',
            message: expect.stringContaining('500 characters'),
          }),
        ]),
      });
    });

    it('should accept bio of exactly 500 characters', async () => {
      const bio500 = 'a'.repeat(500);
      const updatedUser = { ...mockUser, bio: bio500 };
      mockRepository.findProfileById
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(updatedUser);

      const profile = await userService.updateProfile(1, { bio: bio500 });
      expect(profile.bio).toBe(bio500);
    });

    it('should accept empty bio (clearing the field)', async () => {
      const updatedUser = { ...mockUser, bio: '' };
      mockRepository.findProfileById
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(updatedUser);

      const profile = await userService.updateProfile(1, { bio: '' });
      expect(profile.bio).toBe('');
    });

    it('should reject location longer than 100 characters', async () => {
      const longLocation = 'a'.repeat(101);

      await expect(
        userService.updateProfile(1, { location: longLocation }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: 'location',
            message: expect.stringContaining('100 characters'),
          }),
        ]),
      });
    });

    it('should accept location of exactly 100 characters', async () => {
      const loc100 = 'a'.repeat(100);
      const updatedUser = { ...mockUser, location: loc100 };
      mockRepository.findProfileById
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(updatedUser);

      const profile = await userService.updateProfile(1, { location: loc100 });
      expect(profile.location).toBe(loc100);
    });

    it('should reject website longer than 200 characters', async () => {
      const longWebsite = 'https://' + 'a'.repeat(193);

      await expect(
        userService.updateProfile(1, { website: longWebsite }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: 'website',
            message: expect.stringContaining('200 characters'),
          }),
        ]),
      });
    });

    it('should accept website of exactly 200 characters', async () => {
      const web200 = 'a'.repeat(200);
      const updatedUser = { ...mockUser, website: web200 };
      mockRepository.findProfileById
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(updatedUser);

      const profile = await userService.updateProfile(1, { website: web200 });
      expect(profile.website).toBe(web200);
    });

    it('should return multiple validation errors for multiple invalid fields', async () => {
      const longName = 'a'.repeat(51);
      const longBio = 'a'.repeat(501);

      try {
        await userService.updateProfile(1, { display_name: longName, bio: longBio });
        fail('Should have thrown');
      } catch (err) {
        const error = err as UserServiceError;
        expect(error.statusCode).toBe(400);
        expect(error.errors).toHaveLength(2);
        expect(error.errors!.map((e) => e.field)).toContain('display_name');
        expect(error.errors!.map((e) => e.field)).toContain('bio');
      }
    });

    it('should throw 404 when user does not exist', async () => {
      mockRepository.findProfileById.mockResolvedValue(undefined);

      await expect(
        userService.updateProfile(999, { display_name: 'Test' }),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'User not found',
      });
    });

    it('should not call updateProfile when no fields are provided', async () => {
      mockRepository.findProfileById.mockResolvedValue(mockUser);

      await userService.updateProfile(1, {});

      expect(mockRepository.updateProfile).not.toHaveBeenCalled();
    });
  });

  describe('uploadProfilePhoto', () => {
    const validFile = {
      buffer: Buffer.from('fake-image-data'),
      mimetype: 'image/jpeg',
      size: 1024 * 1024, // 1MB
      originalname: 'photo.jpg',
    };

    beforeEach(() => {
      mockRepository.findProfileById.mockResolvedValue(mockUser);
    });

    it('should upload and resize profile photo to 400x400', async () => {
      const sharp = require('sharp');

      const result = await userService.uploadProfilePhoto(1, validFile);

      expect(sharp).toHaveBeenCalledWith(validFile.buffer);
      expect(mockResize).toHaveBeenCalledWith(400, 400, { fit: 'cover' });
      expect(result.url).toContain('avatars/1/test-uuid-1234.jpg');
      expect(result.key).toBe('avatars/1/test-uuid-1234.jpg');
    });

    it('should upload resized image to media uploader', async () => {
      await userService.uploadProfilePhoto(1, validFile);

      expect(mockMediaUploader.upload).toHaveBeenCalledWith(
        Buffer.from('resized-image'),
        'avatars/1/test-uuid-1234.jpg',
        'image/jpeg',
      );
    });

    it('should update user avatar_url in database', async () => {
      await userService.uploadProfilePhoto(1, validFile);

      expect(mockRepository.updateProfile).toHaveBeenCalledWith(1, {
        avatar_url: expect.stringContaining('avatars/1/test-uuid-1234.jpg'),
      });
    });

    it('should reject files exceeding 10MB', async () => {
      const largeFile = { ...validFile, size: 11 * 1024 * 1024 };

      await expect(
        userService.uploadProfilePhoto(1, largeFile),
      ).rejects.toThrow(UserServiceError);

      await expect(
        userService.uploadProfilePhoto(1, largeFile),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('10MB'),
      });
    });

    it('should accept files of exactly 10MB', async () => {
      const exactFile = { ...validFile, size: 10 * 1024 * 1024 };

      const result = await userService.uploadProfilePhoto(1, exactFile);
      expect(result.url).toBeDefined();
    });

    it('should reject invalid image formats', async () => {
      const invalidFile = { ...validFile, mimetype: 'image/bmp' };

      await expect(
        userService.uploadProfilePhoto(1, invalidFile),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('JPEG, PNG, WebP, GIF'),
      });
    });

    it('should accept JPEG images', async () => {
      const jpegFile = { ...validFile, mimetype: 'image/jpeg' };
      const result = await userService.uploadProfilePhoto(1, jpegFile);
      expect(result.key).toContain('.jpg');
    });

    it('should accept PNG images', async () => {
      const pngFile = { ...validFile, mimetype: 'image/png' };
      const result = await userService.uploadProfilePhoto(1, pngFile);
      expect(result.key).toContain('.png');
    });

    it('should accept WebP images', async () => {
      const webpFile = { ...validFile, mimetype: 'image/webp' };
      const result = await userService.uploadProfilePhoto(1, webpFile);
      expect(result.key).toContain('.webp');
    });

    it('should accept GIF images', async () => {
      const gifFile = { ...validFile, mimetype: 'image/gif' };
      const result = await userService.uploadProfilePhoto(1, gifFile);
      expect(result.key).toContain('.gif');
    });

    it('should throw 404 when user does not exist', async () => {
      mockRepository.findProfileById.mockResolvedValue(undefined);

      await expect(
        userService.uploadProfilePhoto(999, validFile),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'User not found',
      });
    });
  });

  describe('uploadCoverPhoto', () => {
    const validFile = {
      buffer: Buffer.from('fake-image-data'),
      mimetype: 'image/png',
      size: 5 * 1024 * 1024, // 5MB
      originalname: 'cover.png',
    };

    beforeEach(() => {
      mockRepository.findProfileById.mockResolvedValue(mockUser);
    });

    it('should upload and resize cover photo to 1500x500', async () => {
      const sharp = require('sharp');

      const result = await userService.uploadCoverPhoto(1, validFile);

      expect(sharp).toHaveBeenCalledWith(validFile.buffer);
      expect(mockResize).toHaveBeenCalledWith(1500, 500, { fit: 'cover' });
      expect(result.url).toContain('covers/1/test-uuid-1234.png');
      expect(result.key).toBe('covers/1/test-uuid-1234.png');
    });

    it('should upload resized image to media uploader', async () => {
      await userService.uploadCoverPhoto(1, validFile);

      expect(mockMediaUploader.upload).toHaveBeenCalledWith(
        Buffer.from('resized-image'),
        'covers/1/test-uuid-1234.png',
        'image/png',
      );
    });

    it('should update user cover_url in database', async () => {
      await userService.uploadCoverPhoto(1, validFile);

      expect(mockRepository.updateProfile).toHaveBeenCalledWith(1, {
        cover_url: expect.stringContaining('covers/1/test-uuid-1234.png'),
      });
    });

    it('should reject files exceeding 10MB', async () => {
      const largeFile = { ...validFile, size: 11 * 1024 * 1024 };

      await expect(
        userService.uploadCoverPhoto(1, largeFile),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('10MB'),
      });
    });

    it('should reject invalid image formats', async () => {
      const invalidFile = { ...validFile, mimetype: 'application/pdf' };

      await expect(
        userService.uploadCoverPhoto(1, invalidFile),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('JPEG, PNG, WebP, GIF'),
      });
    });

    it('should throw 404 when user does not exist', async () => {
      mockRepository.findProfileById.mockResolvedValue(undefined);

      await expect(
        userService.uploadCoverPhoto(999, validFile),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'User not found',
      });
    });
  });
});
