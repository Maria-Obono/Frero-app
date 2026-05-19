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
import {
  ConnectionType,
  PaginatedConnections,
  SocialServiceError,
  DEFAULT_CONNECTIONS_PAGE_SIZE,
  MAX_CONNECTIONS_PAGE_SIZE,
} from './types';

export class SocialService {
  private readonly repository: SocialRepository;

  constructor(options?: { repository?: SocialRepository }) {
    this.repository = options?.repository || new SocialRepository();
  }

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
  async follow(followerId: number, followedId: number): Promise<void> {
    // Validation: Cannot follow yourself
    if (followerId === followedId) {
      throw new SocialServiceError(
        'Cannot follow yourself',
        400,
        'SELF_FOLLOW',
      );
    }

    // Validation: Check for blocks in either direction
    const isBlocked = await this.repository.blockExistsBetween(followerId, followedId);
    if (isBlocked) {
      throw new SocialServiceError(
        'Cannot follow this user',
        403,
        'USER_BLOCKED',
      );
    }

    // Validation: Check if already following
    const alreadyFollowing = await this.repository.followExists(followerId, followedId);
    if (alreadyFollowing) {
      throw new SocialServiceError(
        'You are already following this user',
        409,
        'ALREADY_FOLLOWING',
      );
    }

    // Create the follow relationship
    await this.repository.createFollow(followerId, followedId);

    // Note: Notification to followed user will be handled by NotificationService
    // when it's integrated (Task 10.1)
  }

  /**
   * Unfollow a user.
   *
   * Requirement 3.5: Removes the follower relationship.
   *
   * @param followerId - The user who wants to unfollow
   * @param followedId - The user to be unfollowed
   */
  async unfollow(followerId: number, followedId: number): Promise<void> {
    // Validation: Cannot unfollow yourself
    if (followerId === followedId) {
      throw new SocialServiceError(
        'Cannot unfollow yourself',
        400,
        'SELF_UNFOLLOW',
      );
    }

    // Check if the follow relationship exists
    const isFollowing = await this.repository.followExists(followerId, followedId);
    if (!isFollowing) {
      throw new SocialServiceError(
        'You are not following this user',
        404,
        'NOT_FOLLOWING',
      );
    }

    // Remove the follow relationship
    await this.repository.deleteFollow(followerId, followedId);
  }

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
  async block(blockerId: number, blockedId: number): Promise<void> {
    // Validation: Cannot block yourself
    if (blockerId === blockedId) {
      throw new SocialServiceError(
        'Cannot block yourself',
        400,
        'SELF_BLOCK',
      );
    }

    // Check if already blocked
    const alreadyBlocked = await this.repository.blockExistsBetween(blockerId, blockedId);
    if (alreadyBlocked) {
      throw new SocialServiceError(
        'This user is already blocked',
        409,
        'ALREADY_BLOCKED',
      );
    }

    // Remove ALL existing relationships between the two users:

    // 1. Remove friendships
    await this.repository.deleteFriendshipBetween(blockerId, blockedId);

    // 2. Remove follow relationships (both directions)
    await this.repository.deleteFollowsBetween(blockerId, blockedId);

    // 3. Remove pending friend requests (both directions)
    await this.repository.deletePendingRequestsBetween(blockerId, blockedId);

    // 4. Create the block record
    await this.repository.createBlock(blockerId, blockedId);
  }

  /**
   * Get mutual friends count between two users.
   *
   * Requirement 3.7: Calculate the intersection of two users' friend sets.
   *
   * @param userId1 - First user
   * @param userId2 - Second user
   * @returns The number of mutual friends
   */
  async getMutualFriendsCount(userId1: number, userId2: number): Promise<number> {
    if (userId1 === userId2) {
      return 0;
    }

    return this.repository.countMutualFriends(userId1, userId2);
  }

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
  async getConnections(
    userId: number,
    type: ConnectionType,
    cursor?: string | null,
    limit?: number,
  ): Promise<PaginatedConnections> {
    // Normalize the limit to be within bounds (default 20, max 100)
    const normalizedLimit = this.normalizeConnectionsLimit(limit);
    const normalizedCursor = cursor || null;

    let result: { data: any[]; hasMore: boolean };

    switch (type) {
      case 'friends':
        result = await this.repository.getFriendsPaginated(
          userId,
          normalizedCursor,
          normalizedLimit,
        );
        break;
      case 'followers':
        result = await this.repository.getFollowersPaginated(
          userId,
          normalizedCursor,
          normalizedLimit,
        );
        break;
      case 'following':
        result = await this.repository.getFollowingPaginated(
          userId,
          normalizedCursor,
          normalizedLimit,
        );
        break;
      default:
        throw new SocialServiceError(
          'Invalid connection type. Must be one of: friends, followers, following',
          400,
          'INVALID_CONNECTION_TYPE',
        );
    }

    // Determine the cursor for the next page
    const nextCursor = result.hasMore && result.data.length > 0
      ? String(result.data[result.data.length - 1].id)
      : null;

    return {
      data: result.data,
      cursor: nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Normalize the pagination limit for connections.
   * Default: 20, Min: 1, Max: 100 (Requirement 3.8).
   */
  private normalizeConnectionsLimit(limit?: number): number {
    if (limit === undefined || limit === null) {
      return DEFAULT_CONNECTIONS_PAGE_SIZE;
    }
    return Math.min(Math.max(limit, 1), MAX_CONNECTIONS_PAGE_SIZE);
  }
}
