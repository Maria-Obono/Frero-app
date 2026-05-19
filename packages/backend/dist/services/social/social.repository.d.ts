/**
 * Social repository for follow, block, and connection database operations.
 *
 * Provides data access for:
 * - follows table (follower relationships)
 * - blocks table (block relationships)
 * - friendships table (for mutual friends and connections queries)
 * - friend_requests table (for block cleanup)
 */
import { Knex } from 'knex';
import { ConnectionUser } from './types';
export declare class SocialRepository {
    protected readonly db: Knex;
    constructor(options?: {
        db?: Knex;
    });
    /**
     * Check if a follow relationship exists from follower to followed.
     */
    followExists(followerId: number, followedId: number): Promise<boolean>;
    /**
     * Create a follow relationship.
     * Returns the ID of the created follow record.
     */
    createFollow(followerId: number, followedId: number): Promise<number>;
    /**
     * Remove a follow relationship.
     * Returns the number of affected rows.
     */
    deleteFollow(followerId: number, followedId: number): Promise<number>;
    /**
     * Check if a block relationship exists between two users in either direction.
     */
    blockExistsBetween(userId1: number, userId2: number): Promise<boolean>;
    /**
     * Create a block relationship.
     * Returns the ID of the created block record.
     */
    createBlock(blockerId: number, blockedId: number): Promise<number>;
    /**
     * Remove all follow relationships between two users (in both directions).
     * Returns the number of affected rows.
     */
    deleteFollowsBetween(userId1: number, userId2: number): Promise<number>;
    /**
     * Remove all friendships between two users.
     * Returns the number of affected rows.
     */
    deleteFriendshipBetween(userId1: number, userId2: number): Promise<number>;
    /**
     * Remove all pending friend requests between two users (in both directions).
     * Returns the number of affected rows.
     */
    deletePendingRequestsBetween(userId1: number, userId2: number): Promise<number>;
    /**
     * Get the set of friend IDs for a user.
     * A friend is someone who appears in the friendships table with this user.
     */
    getFriendIds(userId: number): Promise<number[]>;
    /**
     * Count mutual friends between two users.
     * Uses a SQL intersection query for efficiency.
     */
    countMutualFriends(userId1: number, userId2: number): Promise<number>;
    /**
     * Get paginated friends for a user.
     * Returns users joined with the friendships table.
     */
    getFriendsPaginated(userId: number, cursor: string | null, limit: number): Promise<{
        data: ConnectionUser[];
        hasMore: boolean;
    }>;
    /**
     * Get paginated followers for a user.
     * Returns users who follow this user.
     */
    getFollowersPaginated(userId: number, cursor: string | null, limit: number): Promise<{
        data: ConnectionUser[];
        hasMore: boolean;
    }>;
    /**
     * Get paginated following for a user.
     * Returns users that this user follows.
     */
    getFollowingPaginated(userId: number, cursor: string | null, limit: number): Promise<{
        data: ConnectionUser[];
        hasMore: boolean;
    }>;
    /**
     * Get the last cursor value for a paginated result.
     * Uses the relationship table's ID as the cursor.
     */
    getLastCursorFromFriends(results: any[]): string | null;
    /**
     * Get the underlying Knex instance for advanced queries.
     */
    getDb(): Knex;
}
//# sourceMappingURL=social.repository.d.ts.map