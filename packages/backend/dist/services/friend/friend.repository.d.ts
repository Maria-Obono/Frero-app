/**
 * Friend repository for friend request and friendship database operations.
 *
 * Provides data access for:
 * - friend_requests table (pending/accepted/declined requests)
 * - friendships table (mutual friendship records)
 * - blocks table (block relationship checks)
 */
import { Knex } from 'knex';
import { FriendRequest, Friendship, FriendRequestStatus } from './types';
export declare class FriendRepository {
    protected readonly db: Knex;
    constructor(options?: {
        db?: Knex;
    });
    /**
     * Find a friend request by ID.
     */
    findRequestById(id: number): Promise<FriendRequest | undefined>;
    /**
     * Find a friend request between two specific users (in either direction).
     * Returns the request where sender_id = senderId AND recipient_id = recipientId.
     */
    findRequestBetween(senderId: number, recipientId: number): Promise<FriendRequest | undefined>;
    /**
     * Find any pending request between two users in either direction.
     * Returns the first pending request found.
     */
    findPendingRequestBetween(userId1: number, userId2: number): Promise<FriendRequest | undefined>;
    /**
     * Count pending outbound requests for a sender.
     * Used to enforce the 500 pending request limit (Requirement 3.1).
     */
    countPendingOutbound(senderId: number): Promise<number>;
    /**
     * Create a new friend request.
     * Returns the ID of the created request.
     */
    createRequest(senderId: number, recipientId: number): Promise<number>;
    /**
     * Update the status of a friend request.
     * Returns the number of affected rows.
     */
    updateRequestStatus(requestId: number, status: FriendRequestStatus): Promise<number>;
    /**
     * Delete a friend request by ID.
     * Used when declining (Requirement 3.3: remove the pending request).
     */
    deleteRequest(requestId: number): Promise<number>;
    /**
     * Check if a friendship exists between two users (in either direction).
     */
    friendshipExists(userId1: number, userId2: number): Promise<boolean>;
    /**
     * Count total friends for a user (friendships in either direction).
     * Used to enforce the 5000 friend limit (Requirement 3.2).
     */
    countFriends(userId: number): Promise<number>;
    /**
     * Create a friendship record.
     * Stores with user_id_1 < user_id_2 to maintain the unique constraint.
     * Returns the ID of the created friendship.
     */
    createFriendship(userId1: number, userId2: number): Promise<number>;
    /**
     * Find a friendship record between two users.
     */
    findFriendship(userId1: number, userId2: number): Promise<Friendship | undefined>;
    /**
     * Check if a block relationship exists between two users in either direction.
     * Used to prevent friend requests between blocked users (Requirement 3.9).
     */
    blockExists(userId1: number, userId2: number): Promise<boolean>;
    /**
     * Get the underlying Knex instance for advanced queries.
     */
    getDb(): Knex;
}
//# sourceMappingURL=friend.repository.d.ts.map