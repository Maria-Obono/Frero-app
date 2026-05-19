/**
 * Social Service - Follow/Unfollow, Block, Mutual Friends, Connections
 *
 * Handles follow/unfollow relationships, blocking users, calculating
 * mutual friends, and paginated connections retrieval.
 *
 * Requirements covered:
 * - 3.4: Follow user and notify the followed user
 * - 3.5: Unfollow user (remove follower relationship)
 * - 3.6: Block user (remove ALL relationships, prevent future interactions)
 * - 3.7: Calculate and expose mutual friends count between any two users
 * - 3.8: Paginated connections (cursor-based, default 20, max 100)
 */
import { SocialRepository } from './social.repository';
import { ConnectionType, PaginatedConnections } from './types';
export declare class SocialService {
    private readonly repository;
    constructor(options?: {
        repository?: SocialRepository;
    });
    /**
     * Follow a user.
     *
     * Requirement 3.4: Creates a follower relationship and notifies the followed user.
     *
     * Validations:
     * - Cannot follow yourself
     * - Cannot follow if either user has blocked the other
     * - Cannot follow if already following
     *
     * @param followerId - The user who wants to follow
     * @param followedId - The user to be followed
     */
    follow(followerId: number, followedId: number): Promise<void>;
    /**
     * Unfollow a user.
     *
     * Requirement 3.5: Removes the follower relationship.
     *
     * @param followerId - The user who wants to unfollow
     * @param followedId - The user to be unfollowed
     */
    unfollow(followerId: number, followedId: number): Promise<void>;
    /**
     * Block a user.
     *
     * Requirement 3.6: Removes any existing friendship, follower relationship,
     * or pending friend request between the two users, and prevents all future
     * interactions including friend requests, follows, messaging, viewing profiles,
     * and appearing in search results or feeds.
     *
     * @param blockerId - The user who wants to block
     * @param blockedId - The user to be blocked
     */
    block(blockerId: number, blockedId: number): Promise<void>;
    /**
     * Get mutual friends count between two users.
     *
     * Requirement 3.7: Calculate the intersection of two users' friend sets.
     *
     * @param userId1 - First user
     * @param userId2 - Second user
     * @returns The number of mutual friends
     */
    getMutualFriendsCount(userId1: number, userId2: number): Promise<number>;
    /**
     * Get paginated connections for a user.
     *
     * Requirement 3.8: Returns paginated results with cursor-based pagination
     * using a default page size of 20 and a maximum page size of 100 items.
     *
     * @param userId - The user whose connections to retrieve
     * @param type - The type of connections: 'friends', 'followers', or 'following'
     * @param cursor - Optional cursor for pagination
     * @param limit - Optional page size (default 20, max 100)
     * @returns Paginated connection results
     */
    getConnections(userId: number, type: ConnectionType, cursor?: string | null, limit?: number): Promise<PaginatedConnections>;
    /**
     * Normalize the pagination limit for connections.
     * Default: 20, Min: 1, Max: 100 (Requirement 3.8).
     */
    private normalizeConnectionsLimit;
}
//# sourceMappingURL=social.service.d.ts.map