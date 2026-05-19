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
import { FriendRequest, Friendship } from './types';
export declare class FriendService {
    private readonly repository;
    constructor(options?: {
        repository?: FriendRepository;
    });
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
    sendFriendRequest(senderId: number, recipientId: number): Promise<{
        request?: FriendRequest;
        friendship?: Friendship;
        autoAccepted: boolean;
    }>;
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
    acceptFriendRequest(requestId: number, userId: number): Promise<Friendship>;
    /**
     * Decline a friend request.
     *
     * Requirement 3.3: Removes the pending request and does not notify the sender.
     *
     * @param requestId - The ID of the friend request to decline
     * @param userId - The ID of the user declining (must be the recipient)
     */
    declineFriendRequest(requestId: number, userId: number): Promise<void>;
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
    private autoAcceptMutualRequests;
}
//# sourceMappingURL=friend.service.d.ts.map