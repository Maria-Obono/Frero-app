/**
 * Unit tests for FriendService - Friend Request System
 *
 * Tests cover:
 * - sendFriendRequest with all validations (Req 3.1, 3.9, 3.10)
 * - acceptFriendRequest with mutual friendship creation (Req 3.2)
 * - declineFriendRequest (Req 3.3)
 * - Mutual pending request auto-accept logic (Req 3.10)
 */

import { FriendService, FriendServiceError } from '../../../src/services/friend';
import { FriendRepository } from '../../../src/services/friend/friend.repository';

describe('FriendService', () => {
  let friendService: FriendService;
  let mockRepository: jest.Mocked<FriendRepository>;

  beforeEach(() => {
    mockRepository = {
      findRequestById: jest.fn(),
      findRequestBetween: jest.fn(),
      findPendingRequestBetween: jest.fn(),
      countPendingOutbound: jest.fn(),
      createRequest: jest.fn(),
      updateRequestStatus: jest.fn(),
      deleteRequest: jest.fn(),
      friendshipExists: jest.fn(),
      countFriends: jest.fn(),
      createFriendship: jest.fn(),
      findFriendship: jest.fn(),
      blockExists: jest.fn(),
      getDb: jest.fn(),
    } as any;

    friendService = new FriendService({ repository: mockRepository });
  });

  describe('sendFriendRequest', () => {
    beforeEach(() => {
      // Default: no blocks, no existing friendship, no existing requests, under limits
      mockRepository.blockExists.mockResolvedValue(false);
      mockRepository.friendshipExists.mockResolvedValue(false);
      mockRepository.findRequestBetween.mockResolvedValue(undefined);
      mockRepository.countPendingOutbound.mockResolvedValue(0);
      mockRepository.createRequest.mockResolvedValue(1);
      mockRepository.findRequestById.mockResolvedValue({
        id: 1,
        sender_id: 1,
        recipient_id: 2,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
      });
    });

    it('should create a friend request successfully', async () => {
      const result = await friendService.sendFriendRequest(1, 2);

      expect(result.autoAccepted).toBe(false);
      expect(result.request).toBeDefined();
      expect(result.request!.sender_id).toBe(1);
      expect(result.request!.recipient_id).toBe(2);
      expect(result.request!.status).toBe('pending');
      expect(mockRepository.createRequest).toHaveBeenCalledWith(1, 2);
    });

    it('should reject self-request', async () => {
      await expect(friendService.sendFriendRequest(1, 1)).rejects.toThrow(FriendServiceError);
      await expect(friendService.sendFriendRequest(1, 1)).rejects.toMatchObject({
        statusCode: 400,
        code: 'SELF_REQUEST',
        message: expect.stringContaining('yourself'),
      });
    });

    it('should reject when sender has blocked recipient', async () => {
      mockRepository.blockExists.mockResolvedValue(true);

      await expect(friendService.sendFriendRequest(1, 2)).rejects.toThrow(FriendServiceError);
      await expect(friendService.sendFriendRequest(1, 2)).rejects.toMatchObject({
        statusCode: 403,
        code: 'USER_BLOCKED',
      });
    });

    it('should reject when recipient has blocked sender', async () => {
      mockRepository.blockExists.mockResolvedValue(true);

      await expect(friendService.sendFriendRequest(1, 2)).rejects.toThrow(FriendServiceError);
      await expect(friendService.sendFriendRequest(1, 2)).rejects.toMatchObject({
        statusCode: 403,
        code: 'USER_BLOCKED',
      });
    });

    it('should reject when users are already friends', async () => {
      mockRepository.friendshipExists.mockResolvedValue(true);

      await expect(friendService.sendFriendRequest(1, 2)).rejects.toThrow(FriendServiceError);
      await expect(friendService.sendFriendRequest(1, 2)).rejects.toMatchObject({
        statusCode: 409,
        code: 'ALREADY_FRIENDS',
      });
    });

    it('should reject when a pending request already exists from sender to recipient', async () => {
      const existingPendingRequest = {
        id: 5,
        sender_id: 1,
        recipient_id: 2,
        status: 'pending' as const,
        created_at: new Date(),
        updated_at: new Date(),
      };
      // findRequestBetween is called twice: first for sender->recipient, then for recipient->sender
      // We need it to return the pending request on the first call (sender->recipient check)
      mockRepository.findRequestBetween.mockResolvedValue(existingPendingRequest);

      await expect(friendService.sendFriendRequest(1, 2)).rejects.toThrow(FriendServiceError);

      mockRepository.findRequestBetween.mockResolvedValue(existingPendingRequest);
      await expect(friendService.sendFriendRequest(1, 2)).rejects.toMatchObject({
        statusCode: 409,
        code: 'REQUEST_ALREADY_EXISTS',
      });
    });

    it('should allow sending request if previous request was declined', async () => {
      // First call: check sender->recipient (declined, not pending)
      mockRepository.findRequestBetween
        .mockResolvedValueOnce({
          id: 5,
          sender_id: 1,
          recipient_id: 2,
          status: 'declined',
          created_at: new Date(),
          updated_at: new Date(),
        })
        // Second call: check recipient->sender (no request)
        .mockResolvedValueOnce(undefined);

      const result = await friendService.sendFriendRequest(1, 2);
      expect(result.autoAccepted).toBe(false);
      expect(result.request).toBeDefined();
    });

    it('should reject when sender has 500 pending outbound requests', async () => {
      mockRepository.countPendingOutbound.mockResolvedValue(500);

      await expect(friendService.sendFriendRequest(1, 2)).rejects.toThrow(FriendServiceError);
      await expect(friendService.sendFriendRequest(1, 2)).rejects.toMatchObject({
        statusCode: 429,
        code: 'MAX_PENDING_REQUESTS',
        message: expect.stringContaining('500'),
      });
    });

    it('should allow sending when sender has 499 pending outbound requests', async () => {
      mockRepository.countPendingOutbound.mockResolvedValue(499);

      const result = await friendService.sendFriendRequest(1, 2);
      expect(result.autoAccepted).toBe(false);
      expect(result.request).toBeDefined();
    });

    describe('mutual pending request auto-accept (Requirement 3.10)', () => {
      const reverseRequest = {
        id: 10,
        sender_id: 2,
        recipient_id: 1,
        status: 'pending' as const,
        created_at: new Date(),
        updated_at: new Date(),
      };

      beforeEach(() => {
        // First findRequestBetween call: sender->recipient (no request)
        mockRepository.findRequestBetween
          .mockResolvedValueOnce(undefined)
          // Second call: recipient->sender (pending request exists)
          .mockResolvedValueOnce(reverseRequest);
        mockRepository.countFriends.mockResolvedValue(0);
        mockRepository.createFriendship.mockResolvedValue(1);
        mockRepository.findFriendship.mockResolvedValue({
          id: 1,
          user_id_1: 1,
          user_id_2: 2,
          created_at: new Date(),
        });
      });

      it('should auto-accept when recipient has a pending request to sender', async () => {
        const result = await friendService.sendFriendRequest(1, 2);

        expect(result.autoAccepted).toBe(true);
        expect(result.friendship).toBeDefined();
        expect(result.friendship!.user_id_1).toBe(1);
        expect(result.friendship!.user_id_2).toBe(2);
      });

      it('should update the existing reverse request to accepted', async () => {
        await friendService.sendFriendRequest(1, 2);

        expect(mockRepository.updateRequestStatus).toHaveBeenCalledWith(10, 'accepted');
      });

      it('should create a friendship record', async () => {
        await friendService.sendFriendRequest(1, 2);

        expect(mockRepository.createFriendship).toHaveBeenCalledWith(1, 2);
      });

      it('should not create a new friend request when auto-accepting', async () => {
        await friendService.sendFriendRequest(1, 2);

        expect(mockRepository.createRequest).not.toHaveBeenCalled();
      });

      it('should reject auto-accept if sender has reached max friends', async () => {
        mockRepository.countFriends.mockResolvedValueOnce(5000);

        await expect(friendService.sendFriendRequest(1, 2)).rejects.toMatchObject({
          statusCode: 429,
          code: 'SENDER_MAX_FRIENDS',
        });
      });

      it('should reject auto-accept if recipient has reached max friends', async () => {
        mockRepository.countFriends
          .mockResolvedValueOnce(100) // sender OK
          .mockResolvedValueOnce(5000); // recipient at max

        await expect(friendService.sendFriendRequest(1, 2)).rejects.toMatchObject({
          statusCode: 429,
          code: 'RECIPIENT_MAX_FRIENDS',
        });
      });
    });
  });

  describe('acceptFriendRequest', () => {
    const pendingRequest = {
      id: 1,
      sender_id: 10,
      recipient_id: 20,
      status: 'pending' as const,
      created_at: new Date(),
      updated_at: new Date(),
    };

    beforeEach(() => {
      mockRepository.findRequestById.mockResolvedValue(pendingRequest);
      mockRepository.countFriends.mockResolvedValue(0);
      mockRepository.updateRequestStatus.mockResolvedValue(1);
      mockRepository.createFriendship.mockResolvedValue(1);
      mockRepository.findFriendship.mockResolvedValue({
        id: 1,
        user_id_1: 10,
        user_id_2: 20,
        created_at: new Date(),
      });
    });

    it('should accept a friend request and create friendship', async () => {
      const friendship = await friendService.acceptFriendRequest(1, 20);

      expect(friendship).toBeDefined();
      expect(friendship.user_id_1).toBe(10);
      expect(friendship.user_id_2).toBe(20);
      expect(mockRepository.updateRequestStatus).toHaveBeenCalledWith(1, 'accepted');
      expect(mockRepository.createFriendship).toHaveBeenCalledWith(10, 20);
    });

    it('should throw 404 when request does not exist', async () => {
      mockRepository.findRequestById.mockResolvedValue(undefined);

      await expect(friendService.acceptFriendRequest(999, 20)).rejects.toMatchObject({
        statusCode: 404,
        code: 'REQUEST_NOT_FOUND',
      });
    });

    it('should reject when user is not the recipient', async () => {
      await expect(friendService.acceptFriendRequest(1, 10)).rejects.toMatchObject({
        statusCode: 403,
        code: 'NOT_RECIPIENT',
      });
    });

    it('should reject when request is already accepted', async () => {
      mockRepository.findRequestById.mockResolvedValue({
        ...pendingRequest,
        status: 'accepted',
      });

      await expect(friendService.acceptFriendRequest(1, 20)).rejects.toMatchObject({
        statusCode: 409,
        code: 'REQUEST_NOT_PENDING',
      });
    });

    it('should reject when request is already declined', async () => {
      mockRepository.findRequestById.mockResolvedValue({
        ...pendingRequest,
        status: 'declined',
      });

      await expect(friendService.acceptFriendRequest(1, 20)).rejects.toMatchObject({
        statusCode: 409,
        code: 'REQUEST_NOT_PENDING',
      });
    });

    it('should reject when sender has reached max friends (5000)', async () => {
      mockRepository.countFriends.mockResolvedValueOnce(5000);

      await expect(friendService.acceptFriendRequest(1, 20)).rejects.toMatchObject({
        statusCode: 429,
        code: 'SENDER_MAX_FRIENDS',
        message: expect.stringContaining('5000'),
      });
    });

    it('should reject when recipient has reached max friends (5000)', async () => {
      mockRepository.countFriends
        .mockResolvedValueOnce(100) // sender OK
        .mockResolvedValueOnce(5000); // recipient at max

      await expect(friendService.acceptFriendRequest(1, 20)).rejects.toMatchObject({
        statusCode: 429,
        code: 'RECIPIENT_MAX_FRIENDS',
        message: expect.stringContaining('5000'),
      });
    });

    it('should allow accepting when both users have 4999 friends', async () => {
      mockRepository.countFriends.mockResolvedValue(4999);

      const friendship = await friendService.acceptFriendRequest(1, 20);
      expect(friendship).toBeDefined();
    });
  });

  describe('declineFriendRequest', () => {
    const pendingRequest = {
      id: 1,
      sender_id: 10,
      recipient_id: 20,
      status: 'pending' as const,
      created_at: new Date(),
      updated_at: new Date(),
    };

    beforeEach(() => {
      mockRepository.findRequestById.mockResolvedValue(pendingRequest);
      mockRepository.deleteRequest.mockResolvedValue(1);
    });

    it('should decline and remove the pending request', async () => {
      await friendService.declineFriendRequest(1, 20);

      expect(mockRepository.deleteRequest).toHaveBeenCalledWith(1);
    });

    it('should throw 404 when request does not exist', async () => {
      mockRepository.findRequestById.mockResolvedValue(undefined);

      await expect(friendService.declineFriendRequest(999, 20)).rejects.toMatchObject({
        statusCode: 404,
        code: 'REQUEST_NOT_FOUND',
      });
    });

    it('should reject when user is not the recipient', async () => {
      await expect(friendService.declineFriendRequest(1, 10)).rejects.toMatchObject({
        statusCode: 403,
        code: 'NOT_RECIPIENT',
      });
    });

    it('should reject when request is already accepted', async () => {
      mockRepository.findRequestById.mockResolvedValue({
        ...pendingRequest,
        status: 'accepted',
      });

      await expect(friendService.declineFriendRequest(1, 20)).rejects.toMatchObject({
        statusCode: 409,
        code: 'REQUEST_NOT_PENDING',
      });
    });

    it('should reject when request is already declined', async () => {
      mockRepository.findRequestById.mockResolvedValue({
        ...pendingRequest,
        status: 'declined',
      });

      await expect(friendService.declineFriendRequest(1, 20)).rejects.toMatchObject({
        statusCode: 409,
        code: 'REQUEST_NOT_PENDING',
      });
    });

    it('should not call updateRequestStatus (removes, not updates)', async () => {
      await friendService.declineFriendRequest(1, 20);

      expect(mockRepository.updateRequestStatus).not.toHaveBeenCalled();
    });
  });
});
