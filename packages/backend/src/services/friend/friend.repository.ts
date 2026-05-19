/**
 * Friend repository for friend request and friendship database operations.
 *
 * Provides data access for:
 * - friend_requests table (pending/accepted/declined requests)
 * - friendships table (mutual friendship records)
 * - blocks table (block relationship checks)
 */

import { Knex } from 'knex';
import { getDatabase } from '../../database/connection';
import { FriendRequest, Friendship, FriendRequestStatus } from './types';

export class FriendRepository {
  protected readonly db: Knex;

  constructor(options?: { db?: Knex }) {
    this.db = options?.db || getDatabase();
  }

  // ─── Friend Requests ────────────────────────────────────────────────────────

  /**
   * Find a friend request by ID.
   */
  async findRequestById(id: number): Promise<FriendRequest | undefined> {
    return this.db('friend_requests').where('id', id).first();
  }

  /**
   * Find a friend request between two specific users (in either direction).
   * Returns the request where sender_id = senderId AND recipient_id = recipientId.
   */
  async findRequestBetween(
    senderId: number,
    recipientId: number,
  ): Promise<FriendRequest | undefined> {
    return this.db('friend_requests')
      .where('sender_id', senderId)
      .where('recipient_id', recipientId)
      .first();
  }

  /**
   * Find any pending request between two users in either direction.
   * Returns the first pending request found.
   */
  async findPendingRequestBetween(
    userId1: number,
    userId2: number,
  ): Promise<FriendRequest | undefined> {
    return this.db('friend_requests')
      .where('status', 'pending')
      .where(function () {
        this.where(function () {
          this.where('sender_id', userId1).where('recipient_id', userId2);
        }).orWhere(function () {
          this.where('sender_id', userId2).where('recipient_id', userId1);
        });
      })
      .first();
  }

  /**
   * Count pending outbound requests for a sender.
   * Used to enforce the 500 pending request limit (Requirement 3.1).
   */
  async countPendingOutbound(senderId: number): Promise<number> {
    const result = await this.db('friend_requests')
      .where('sender_id', senderId)
      .where('status', 'pending')
      .count('* as count')
      .first();
    return Number((result as any)?.count) || 0;
  }

  /**
   * Create a new friend request.
   * Returns the ID of the created request.
   */
  async createRequest(senderId: number, recipientId: number): Promise<number> {
    const [id] = await this.db('friend_requests').insert({
      sender_id: senderId,
      recipient_id: recipientId,
      status: 'pending',
    });
    return id as number;
  }

  /**
   * Update the status of a friend request.
   * Returns the number of affected rows.
   */
  async updateRequestStatus(requestId: number, status: FriendRequestStatus): Promise<number> {
    return this.db('friend_requests').where('id', requestId).update({ status });
  }

  /**
   * Delete a friend request by ID.
   * Used when declining (Requirement 3.3: remove the pending request).
   */
  async deleteRequest(requestId: number): Promise<number> {
    return this.db('friend_requests').where('id', requestId).delete();
  }

  // ─── Friendships ────────────────────────────────────────────────────────────

  /**
   * Check if a friendship exists between two users (in either direction).
   */
  async friendshipExists(userId1: number, userId2: number): Promise<boolean> {
    const result = await this.db('friendships')
      .where(function () {
        this.where(function () {
          this.where('user_id_1', userId1).where('user_id_2', userId2);
        }).orWhere(function () {
          this.where('user_id_1', userId2).where('user_id_2', userId1);
        });
      })
      .count('* as count')
      .first();
    return Number((result as any)?.count) > 0;
  }

  /**
   * Count total friends for a user (friendships in either direction).
   * Used to enforce the 5000 friend limit (Requirement 3.2).
   */
  async countFriends(userId: number): Promise<number> {
    const result = await this.db('friendships')
      .where('user_id_1', userId)
      .orWhere('user_id_2', userId)
      .count('* as count')
      .first();
    return Number((result as any)?.count) || 0;
  }

  /**
   * Create a friendship record.
   * Stores with user_id_1 < user_id_2 to maintain the unique constraint.
   * Returns the ID of the created friendship.
   */
  async createFriendship(userId1: number, userId2: number): Promise<number> {
    // Enforce canonical ordering to satisfy the unique constraint (user_id_1, user_id_2)
    const [lower, higher] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
    const [id] = await this.db('friendships').insert({
      user_id_1: lower,
      user_id_2: higher,
    });
    return id as number;
  }

  /**
   * Find a friendship record between two users.
   */
  async findFriendship(userId1: number, userId2: number): Promise<Friendship | undefined> {
    const [lower, higher] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
    return this.db('friendships')
      .where('user_id_1', lower)
      .where('user_id_2', higher)
      .first();
  }

  // ─── Blocks ─────────────────────────────────────────────────────────────────

  /**
   * Check if a block relationship exists between two users in either direction.
   * Used to prevent friend requests between blocked users (Requirement 3.9).
   */
  async blockExists(userId1: number, userId2: number): Promise<boolean> {
    const result = await this.db('blocks')
      .where(function () {
        this.where(function () {
          this.where('blocker_id', userId1).where('blocked_id', userId2);
        }).orWhere(function () {
          this.where('blocker_id', userId2).where('blocked_id', userId1);
        });
      })
      .count('* as count')
      .first();
    return Number((result as any)?.count) > 0;
  }

  /**
   * Get the underlying Knex instance for advanced queries.
   */
  getDb(): Knex {
    return this.db;
  }
}
