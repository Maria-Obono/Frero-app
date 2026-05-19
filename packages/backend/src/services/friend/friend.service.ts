/**
 * Friend Service - Friend Request System
 *
 * Handles sending, accepting, and declining friend requests with all
 * required validations and the mutual pending request auto-accept logic.
 *
 * Requirements covered:
 * - 3.1: Send friend request with max 500 pending outbound, notify recipient
 * - 3.2: Accept friend request with mutual friendship creation (max 5000 friends)
 * - 3.3: Decline friend request (remove pending request, no notification)
 * - 3.9: Reject self-request, blocked users, existing friendship/pending request
 * - 3.10: Mutual pending request auto-accept
 */

import { FriendRepository } from './friend.repository';
import {
  FriendRequest,
  Friendship,
  FriendServiceError,
  MAX_PENDING_OUTBOUND_REQUESTS,
  MAX_FRIENDS_PER_USER,
} from './types';

export class FriendService {
  private readonly repository: FriendRepository;

  constructor(options?: { repository?: FriendRepository }) {
    this.repository = options?.repository || new FriendRepository();
  }

  /**
   * Send a friend request from sender to recipient.
   *
   * Validations (Requirement 3.9):
   * - Cannot send request to yourself
   * - Cannot send request if either user has blocked the other
   * - Cannot send request if already friends
   * - Cannot send request if a pending request already exists (in either direction)
   *
   * Limits (Requirement 3.1):
   * - Sender cannot have more than 500 pending outbound requests
   *
   * Auto-accept (Requirement 3.10):
   * - If recipient already has a pending request TO the sender,
   *   auto-accept both and create mutual friendship.
   *
   * @param senderId - The user sending the friend request
   * @param recipientId - The user receiving the friend request
   * @returns The created friend request, or the friendship if auto-accepted
   */
  async sendFriendRequest(
    senderId: number,
    recipientId: number,
  ): Promise<{ request?: FriendRequest; friendship?: Friendship; autoAccepted: boolean }> {
    // Validation: No self-request
    if (senderId === recipientId) {
      throw new FriendServiceError(
        'Cannot send a friend request to yourself',
        400,
        'SELF_REQUEST',
      );
    }

    // Validation: Check for blocks in either direction
    const isBlocked = await this.repository.blockExists(senderId, recipientId);
    if (isBlocked) {
      throw new FriendServiceError(
        'Cannot send a friend request to this user',
        403,
        'USER_BLOCKED',
      );
    }

    // Validation: Check if already friends
    const alreadyFriends = await this.repository.friendshipExists(senderId, recipientId);
    if (alreadyFriends) {
      throw new FriendServiceError(
        'You are already friends with this user',
        409,
        'ALREADY_FRIENDS',
      );
    }

    // Validation: Check for existing pending request from sender to recipient
    const existingRequest = await this.repository.findRequestBetween(senderId, recipientId);
    if (existingRequest && existingRequest.status === 'pending') {
      throw new FriendServiceError(
        'A pending friend request already exists',
        409,
        'REQUEST_ALREADY_EXISTS',
      );
    }

    // Auto-accept logic (Requirement 3.10):
    // Check if recipient already sent a pending request to sender
    const reverseRequest = await this.repository.findRequestBetween(recipientId, senderId);
    if (reverseRequest && reverseRequest.status === 'pending') {
      // Both users want to be friends - auto-accept
      return this.autoAcceptMutualRequests(senderId, recipientId, reverseRequest);
    }

    // Validation: Check pending outbound limit (Requirement 3.1)
    const pendingCount = await this.repository.countPendingOutbound(senderId);
    if (pendingCount >= MAX_PENDING_OUTBOUND_REQUESTS) {
      throw new FriendServiceError(
        'You have reached the maximum number of pending friend requests (500)',
        429,
        'MAX_PENDING_REQUESTS',
      );
    }

    // Create the friend request
    const requestId = await this.repository.createRequest(senderId, recipientId);
    const request = await this.repository.findRequestById(requestId);

    return { request: request!, autoAccepted: false };
  }

  /**
   * Accept a friend request.
   *
   * Requirement 3.2: Creates a mutual friendship record.
   * Validates that neither user exceeds 5000 total friends.
   *
   * @param requestId - The ID of the friend request to accept
   * @param userId - The ID of the user accepting (must be the recipient)
   * @returns The created friendship
   */
  async acceptFriendRequest(requestId: number, userId: number): Promise<Friendship> {
    // Find the request
    const request = await this.repository.findRequestById(requestId);
    if (!request) {
      throw new FriendServiceError('Friend request not found', 404, 'REQUEST_NOT_FOUND');
    }

    // Validate the user is the recipient
    if (request.recipient_id !== userId) {
      throw new FriendServiceError(
        'You can only accept friend requests sent to you',
        403,
        'NOT_RECIPIENT',
      );
    }

    // Validate the request is still pending
    if (request.status !== 'pending') {
      throw new FriendServiceError(
        'This friend request is no longer pending',
        409,
        'REQUEST_NOT_PENDING',
      );
    }

    // Check friend limits for both users (Requirement 3.2)
    const senderFriendCount = await this.repository.countFriends(request.sender_id);
    if (senderFriendCount >= MAX_FRIENDS_PER_USER) {
      throw new FriendServiceError(
        'The sender has reached the maximum number of friends (5000)',
        429,
        'SENDER_MAX_FRIENDS',
      );
    }

    const recipientFriendCount = await this.repository.countFriends(userId);
    if (recipientFriendCount >= MAX_FRIENDS_PER_USER) {
      throw new FriendServiceError(
        'You have reached the maximum number of friends (5000)',
        429,
        'RECIPIENT_MAX_FRIENDS',
      );
    }

    // Update request status to accepted
    await this.repository.updateRequestStatus(requestId, 'accepted');

    // Create mutual friendship
    await this.repository.createFriendship(request.sender_id, userId);
    const friendship = await this.repository.findFriendship(request.sender_id, userId);

    return friendship!;
  }

  /**
   * Decline a friend request.
   *
   * Requirement 3.3: Removes the pending request and does not notify the sender.
   *
   * @param requestId - The ID of the friend request to decline
   * @param userId - The ID of the user declining (must be the recipient)
   */
  async declineFriendRequest(requestId: number, userId: number): Promise<void> {
    // Find the request
    const request = await this.repository.findRequestById(requestId);
    if (!request) {
      throw new FriendServiceError('Friend request not found', 404, 'REQUEST_NOT_FOUND');
    }

    // Validate the user is the recipient
    if (request.recipient_id !== userId) {
      throw new FriendServiceError(
        'You can only decline friend requests sent to you',
        403,
        'NOT_RECIPIENT',
      );
    }

    // Validate the request is still pending
    if (request.status !== 'pending') {
      throw new FriendServiceError(
        'This friend request is no longer pending',
        409,
        'REQUEST_NOT_PENDING',
      );
    }

    // Remove the pending request (Requirement 3.3)
    await this.repository.deleteRequest(requestId);
  }

  /**
   * Handle mutual pending request auto-accept.
   *
   * Requirement 3.10: If A sends to B and B already has a pending request to A,
   * auto-accept both requests and create a mutual friendship record.
   *
   * @param senderId - The user who just sent the request (A)
   * @param recipientId - The user who already had a pending request to A (B)
   * @param existingRequest - The existing pending request from B to A
   */
  private async autoAcceptMutualRequests(
    senderId: number,
    recipientId: number,
    existingRequest: FriendRequest,
  ): Promise<{ request?: FriendRequest; friendship?: Friendship; autoAccepted: boolean }> {
    // Check friend limits for both users before auto-accepting
    const senderFriendCount = await this.repository.countFriends(senderId);
    if (senderFriendCount >= MAX_FRIENDS_PER_USER) {
      throw new FriendServiceError(
        'You have reached the maximum number of friends (5000)',
        429,
        'SENDER_MAX_FRIENDS',
      );
    }

    const recipientFriendCount = await this.repository.countFriends(recipientId);
    if (recipientFriendCount >= MAX_FRIENDS_PER_USER) {
      throw new FriendServiceError(
        'The other user has reached the maximum number of friends (5000)',
        429,
        'RECIPIENT_MAX_FRIENDS',
      );
    }

    // Accept the existing request from recipient to sender
    await this.repository.updateRequestStatus(existingRequest.id, 'accepted');

    // Create mutual friendship
    await this.repository.createFriendship(senderId, recipientId);
    const friendship = await this.repository.findFriendship(senderId, recipientId);

    return { friendship: friendship!, autoAccepted: true };
  }
}
