/**
 * Unit tests for SocialService - Follow/Unfollow, Block, Mutual Friends, Connections
 *
 * Tests cover:
 * - follow() with all validations (Req 3.4)
 * - unfollow() (Req 3.5)
 * - block() removing all relationships (Req 3.6)
 * - getMutualFriendsCount() (Req 3.7)
 * - getConnections() with pagination (Req 3.8)
 */

import { SocialService, SocialServiceError } from '../../../src/services/social';
import { SocialRepository } from '../../../src/services/social/social.repository';

describe('SocialService', () => {
  let socialService: SocialService;
  let mockRepository: jest.Mocked<SocialRepository>;

  beforeEach(() => {
    mockRepository = {
      followExists: jest.fn(),
      createFollow: jest.fn(),
      deleteFollow: jest.fn(),
      blockExistsBetween: jest.fn(),
      createBlock: jest.fn(),
      deleteFollowsBetween: jest.fn(),
      deleteFriendshipBetween: jest.fn(),
      deletePendingRequestsBetween: jest.fn(),
      getFriendIds: jest.fn(),
      countMutualFriends: jest.fn(),
      getFriendsPaginated: jest.fn(),
      getFollowersPaginated: jest.fn(),
      getFollowingPaginated: jest.fn(),
      getLastCursorFromFriends: jest.fn(),
      getDb: jest.fn(),
    } as any;

    socialService = new SocialService({ repository: mockRepository });
  });

  describe('follow', () => {
    beforeEach(() => {
      mockRepository.blockExistsBetween.mockResolvedValue(false);
      mockRepository.followExists.mockResolvedValue(false);
      mockRepository.createFollow.mockResolvedValue(1);
    });

    it('should create a follow relationship successfully', async () => {
      await socialService.follow(1, 2);

      expect(mockRepository.createFollow).toHaveBeenCalledWith(1, 2);
    });

    it('should reject following yourself', async () => {
      await expect(socialService.follow(1, 1)).rejects.toThrow(SocialServiceError);
      await expect(socialService.follow(1, 1)).rejects.toMatchObject({
        statusCode: 400,
        code: 'SELF_FOLLOW',
      });
    });

    it('should reject when a block exists between users', async () => {
      mockRepository.blockExistsBetween.mockResolvedValue(true);

      await expect(socialService.follow(1, 2)).rejects.toThrow(SocialServiceError);
      await expect(socialService.follow(1, 2)).rejects.toMatchObject({
        statusCode: 403,
        code: 'USER_BLOCKED',
      });
    });

    it('should reject when already following', async () => {
      mockRepository.followExists.mockResolvedValue(true);

      await expect(socialService.follow(1, 2)).rejects.toThrow(SocialServiceError);
      await expect(socialService.follow(1, 2)).rejects.toMatchObject({
        statusCode: 409,
        code: 'ALREADY_FOLLOWING',
      });
    });

    it('should check block before checking follow status', async () => {
      mockRepository.blockExistsBetween.mockResolvedValue(true);

      await expect(socialService.follow(1, 2)).rejects.toMatchObject({
        code: 'USER_BLOCKED',
      });

      // followExists should not be called if blocked
      expect(mockRepository.followExists).not.toHaveBeenCalled();
    });
  });

  describe('unfollow', () => {
    beforeEach(() => {
      mockRepository.followExists.mockResolvedValue(true);
      mockRepository.deleteFollow.mockResolvedValue(1);
    });

    it('should remove a follow relationship successfully', async () => {
      await socialService.unfollow(1, 2);

      expect(mockRepository.deleteFollow).toHaveBeenCalledWith(1, 2);
    });

    it('should reject unfollowing yourself', async () => {
      await expect(socialService.unfollow(1, 1)).rejects.toThrow(SocialServiceError);
      await expect(socialService.unfollow(1, 1)).rejects.toMatchObject({
        statusCode: 400,
        code: 'SELF_UNFOLLOW',
      });
    });

    it('should reject when not following the user', async () => {
      mockRepository.followExists.mockResolvedValue(false);

      await expect(socialService.unfollow(1, 2)).rejects.toThrow(SocialServiceError);
      await expect(socialService.unfollow(1, 2)).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOLLOWING',
      });
    });
  });

  describe('block', () => {
    beforeEach(() => {
      mockRepository.blockExistsBetween.mockResolvedValue(false);
      mockRepository.deleteFriendshipBetween.mockResolvedValue(0);
      mockRepository.deleteFollowsBetween.mockResolvedValue(0);
      mockRepository.deletePendingRequestsBetween.mockResolvedValue(0);
      mockRepository.createBlock.mockResolvedValue(1);
    });

    it('should block a user and remove all relationships', async () => {
      mockRepository.deleteFriendshipBetween.mockResolvedValue(1);
      mockRepository.deleteFollowsBetween.mockResolvedValue(2);
      mockRepository.deletePendingRequestsBetween.mockResolvedValue(1);

      await socialService.block(1, 2);

      expect(mockRepository.deleteFriendshipBetween).toHaveBeenCalledWith(1, 2);
      expect(mockRepository.deleteFollowsBetween).toHaveBeenCalledWith(1, 2);
      expect(mockRepository.deletePendingRequestsBetween).toHaveBeenCalledWith(1, 2);
      expect(mockRepository.createBlock).toHaveBeenCalledWith(1, 2);
    });

    it('should reject blocking yourself', async () => {
      await expect(socialService.block(1, 1)).rejects.toThrow(SocialServiceError);
      await expect(socialService.block(1, 1)).rejects.toMatchObject({
        statusCode: 400,
        code: 'SELF_BLOCK',
      });
    });

    it('should reject when user is already blocked', async () => {
      mockRepository.blockExistsBetween.mockResolvedValue(true);

      await expect(socialService.block(1, 2)).rejects.toThrow(SocialServiceError);
      await expect(socialService.block(1, 2)).rejects.toMatchObject({
        statusCode: 409,
        code: 'ALREADY_BLOCKED',
      });
    });

    it('should remove friendships when blocking', async () => {
      mockRepository.deleteFriendshipBetween.mockResolvedValue(1);

      await socialService.block(1, 2);

      expect(mockRepository.deleteFriendshipBetween).toHaveBeenCalledWith(1, 2);
    });

    it('should remove follows in both directions when blocking', async () => {
      mockRepository.deleteFollowsBetween.mockResolvedValue(2);

      await socialService.block(1, 2);

      expect(mockRepository.deleteFollowsBetween).toHaveBeenCalledWith(1, 2);
    });

    it('should remove pending friend requests in both directions when blocking', async () => {
      mockRepository.deletePendingRequestsBetween.mockResolvedValue(2);

      await socialService.block(1, 2);

      expect(mockRepository.deletePendingRequestsBetween).toHaveBeenCalledWith(1, 2);
    });

    it('should create block record even when no existing relationships', async () => {
      await socialService.block(1, 2);

      expect(mockRepository.createBlock).toHaveBeenCalledWith(1, 2);
    });

    it('should remove relationships before creating block', async () => {
      const callOrder: string[] = [];
      mockRepository.deleteFriendshipBetween.mockImplementation(async () => {
        callOrder.push('deleteFriendship');
        return 0;
      });
      mockRepository.deleteFollowsBetween.mockImplementation(async () => {
        callOrder.push('deleteFollows');
        return 0;
      });
      mockRepository.deletePendingRequestsBetween.mockImplementation(async () => {
        callOrder.push('deletePendingRequests');
        return 0;
      });
      mockRepository.createBlock.mockImplementation(async () => {
        callOrder.push('createBlock');
        return 1;
      });

      await socialService.block(1, 2);

      // createBlock should be last
      expect(callOrder.indexOf('createBlock')).toBe(callOrder.length - 1);
    });
  });

  describe('getMutualFriendsCount', () => {
    it('should return the mutual friends count', async () => {
      mockRepository.countMutualFriends.mockResolvedValue(5);

      const count = await socialService.getMutualFriendsCount(1, 2);

      expect(count).toBe(5);
      expect(mockRepository.countMutualFriends).toHaveBeenCalledWith(1, 2);
    });

    it('should return 0 for same user', async () => {
      const count = await socialService.getMutualFriendsCount(1, 1);

      expect(count).toBe(0);
      expect(mockRepository.countMutualFriends).not.toHaveBeenCalled();
    });

    it('should return 0 when users have no mutual friends', async () => {
      mockRepository.countMutualFriends.mockResolvedValue(0);

      const count = await socialService.getMutualFriendsCount(1, 2);

      expect(count).toBe(0);
    });
  });

  describe('getConnections', () => {
    const mockUsers = [
      { id: 1, username: 'user1', display_name: 'User One', avatar_url: null },
      { id: 2, username: 'user2', display_name: 'User Two', avatar_url: 'https://example.com/avatar.jpg' },
      { id: 3, username: 'user3', display_name: null, avatar_url: null },
    ];

    describe('friends', () => {
      it('should return paginated friends', async () => {
        mockRepository.getFriendsPaginated.mockResolvedValue({
          data: mockUsers,
          hasMore: false,
        });

        const result = await socialService.getConnections(10, 'friends');

        expect(result.data).toHaveLength(3);
        expect(result.hasMore).toBe(false);
        expect(result.cursor).toBeNull();
        expect(mockRepository.getFriendsPaginated).toHaveBeenCalledWith(10, null, 20);
      });

      it('should return cursor when there are more results', async () => {
        mockRepository.getFriendsPaginated.mockResolvedValue({
          data: mockUsers,
          hasMore: true,
        });

        const result = await socialService.getConnections(10, 'friends');

        expect(result.hasMore).toBe(true);
        expect(result.cursor).toBe('3'); // Last user's ID
      });
    });

    describe('followers', () => {
      it('should return paginated followers', async () => {
        mockRepository.getFollowersPaginated.mockResolvedValue({
          data: mockUsers.slice(0, 2),
          hasMore: false,
        });

        const result = await socialService.getConnections(10, 'followers');

        expect(result.data).toHaveLength(2);
        expect(mockRepository.getFollowersPaginated).toHaveBeenCalledWith(10, null, 20);
      });
    });

    describe('following', () => {
      it('should return paginated following', async () => {
        mockRepository.getFollowingPaginated.mockResolvedValue({
          data: mockUsers.slice(0, 1),
          hasMore: false,
        });

        const result = await socialService.getConnections(10, 'following');

        expect(result.data).toHaveLength(1);
        expect(mockRepository.getFollowingPaginated).toHaveBeenCalledWith(10, null, 20);
      });
    });

    describe('pagination limits', () => {
      beforeEach(() => {
        mockRepository.getFriendsPaginated.mockResolvedValue({
          data: [],
          hasMore: false,
        });
      });

      it('should use default page size of 20 when no limit specified', async () => {
        await socialService.getConnections(10, 'friends');

        expect(mockRepository.getFriendsPaginated).toHaveBeenCalledWith(10, null, 20);
      });

      it('should use default page size of 20 when limit is undefined', async () => {
        await socialService.getConnections(10, 'friends', null, undefined);

        expect(mockRepository.getFriendsPaginated).toHaveBeenCalledWith(10, null, 20);
      });

      it('should cap limit at 100 (max for connections)', async () => {
        await socialService.getConnections(10, 'friends', null, 200);

        expect(mockRepository.getFriendsPaginated).toHaveBeenCalledWith(10, null, 100);
      });

      it('should allow limit up to 100', async () => {
        await socialService.getConnections(10, 'friends', null, 100);

        expect(mockRepository.getFriendsPaginated).toHaveBeenCalledWith(10, null, 100);
      });

      it('should enforce minimum limit of 1', async () => {
        await socialService.getConnections(10, 'friends', null, 0);

        expect(mockRepository.getFriendsPaginated).toHaveBeenCalledWith(10, null, 1);
      });

      it('should enforce minimum limit of 1 for negative values', async () => {
        await socialService.getConnections(10, 'friends', null, -5);

        expect(mockRepository.getFriendsPaginated).toHaveBeenCalledWith(10, null, 1);
      });

      it('should pass cursor to repository', async () => {
        await socialService.getConnections(10, 'friends', '42', 20);

        expect(mockRepository.getFriendsPaginated).toHaveBeenCalledWith(10, '42', 20);
      });
    });

    describe('invalid connection type', () => {
      it('should throw error for invalid connection type', async () => {
        await expect(
          socialService.getConnections(10, 'invalid' as any),
        ).rejects.toThrow(SocialServiceError);

        await expect(
          socialService.getConnections(10, 'invalid' as any),
        ).rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_CONNECTION_TYPE',
        });
      });
    });

    describe('empty results', () => {
      it('should return empty data with no cursor when no connections', async () => {
        mockRepository.getFriendsPaginated.mockResolvedValue({
          data: [],
          hasMore: false,
        });

        const result = await socialService.getConnections(10, 'friends');

        expect(result.data).toHaveLength(0);
        expect(result.cursor).toBeNull();
        expect(result.hasMore).toBe(false);
      });
    });
  });
});
