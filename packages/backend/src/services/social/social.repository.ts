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
import { getDatabase } from '../../database/connection';
import { ConnectionUser } from './types';

export class SocialRepository {
  protected readonly db: Knex;

  constructor(options?: { db?: Knex }) {
    this.db = options?.db || getDatabase();
  }

  // ─── Follows ────────────────────────────────────────────────────────────────

  /**
   * Check if a follow relationship exists from follower to followed.
   */
  async followExists(followerId: number, followedId: number): Promise<boolean> {
    const result = await this.db('follows')
      .where('follower_id', followerId)
      .where('followed_id', followedId)
      .count('* as count')
      .first();
    return Number((result as any)?.count) > 0;
  }

  /**
   * Create a follow relationship.
   * Returns the ID of the created follow record.
   */
  async createFollow(followerId: number, followedId: number): Promise<number> {
    const [id] = await this.db('follows').insert({
      follower_id: followerId,
      followed_id: followedId,
    });
    return id as number;
  }

  /**
   * Remove a follow relationship.
   * Returns the number of affected rows.
   */
  async deleteFollow(followerId: number, followedId: number): Promise<number> {
    return this.db('follows')
      .where('follower_id', followerId)
      .where('followed_id', followedId)
      .delete();
  }

  // ─── Blocks ─────────────────────────────────────────────────────────────────

  /**
   * Check if a block relationship exists between two users in either direction.
   */
  async blockExistsBetween(userId1: number, userId2: number): Promise<boolean> {
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
   * Create a block relationship.
   * Returns the ID of the created block record.
   */
  async createBlock(blockerId: number, blockedId: number): Promise<number> {
    const [id] = await this.db('blocks').insert({
      blocker_id: blockerId,
      blocked_id: blockedId,
    });
    return id as number;
  }

  /**
   * Remove all follow relationships between two users (in both directions).
   * Returns the number of affected rows.
   */
  async deleteFollowsBetween(userId1: number, userId2: number): Promise<number> {
    return this.db('follows')
      .where(function () {
        this.where(function () {
          this.where('follower_id', userId1).where('followed_id', userId2);
        }).orWhere(function () {
          this.where('follower_id', userId2).where('followed_id', userId1);
        });
      })
      .delete();
  }

  /**
   * Remove all friendships between two users.
   * Returns the number of affected rows.
   */
  async deleteFriendshipBetween(userId1: number, userId2: number): Promise<number> {
    return this.db('friendships')
      .where(function () {
        this.where(function () {
          this.where('user_id_1', userId1).where('user_id_2', userId2);
        }).orWhere(function () {
          this.where('user_id_1', userId2).where('user_id_2', userId1);
        });
      })
      .delete();
  }

  /**
   * Remove all pending friend requests between two users (in both directions).
   * Returns the number of affected rows.
   */
  async deletePendingRequestsBetween(userId1: number, userId2: number): Promise<number> {
    return this.db('friend_requests')
      .where('status', 'pending')
      .where(function () {
        this.where(function () {
          this.where('sender_id', userId1).where('recipient_id', userId2);
        }).orWhere(function () {
          this.where('sender_id', userId2).where('recipient_id', userId1);
        });
      })
      .delete();
  }

  // ─── Mutual Friends ─────────────────────────────────────────────────────────

  /**
   * Get the set of friend IDs for a user.
   * A friend is someone who appears in the friendships table with this user.
   */
  async getFriendIds(userId: number): Promise<number[]> {
    const friendships = await this.db('friendships')
      .where('user_id_1', userId)
      .orWhere('user_id_2', userId)
      .select('user_id_1', 'user_id_2');

    return friendships.map((f: any) =>
      f.user_id_1 === userId ? f.user_id_2 : f.user_id_1,
    );
  }

  /**
   * Count mutual friends between two users.
   * Uses a SQL intersection query for efficiency.
   */
  async countMutualFriends(userId1: number, userId2: number): Promise<number> {
    // Get friends of user1
    const user1FriendsSubquery = this.db('friendships')
      .select(this.db.raw(`
        CASE 
          WHEN user_id_1 = ? THEN user_id_2 
          ELSE user_id_1 
        END as friend_id
      `, [userId1]))
      .where('user_id_1', userId1)
      .orWhere('user_id_2', userId1);

    // Get friends of user2
    const user2FriendsSubquery = this.db('friendships')
      .select(this.db.raw(`
        CASE 
          WHEN user_id_1 = ? THEN user_id_2 
          ELSE user_id_1 
        END as friend_id
      `, [userId2]))
      .where('user_id_1', userId2)
      .orWhere('user_id_2', userId2);

    // Count intersection
    const result = await this.db.raw(`
      SELECT COUNT(*) as count FROM (
        SELECT friend_id FROM (${user1FriendsSubquery.toQuery()}) as u1_friends
        INTERSECT
        SELECT friend_id FROM (${user2FriendsSubquery.toQuery()}) as u2_friends
      ) as mutual
    `);

    // Handle different DB response formats (MySQL vs SQLite)
    if (Array.isArray(result) && Array.isArray(result[0])) {
      return Number(result[0][0]?.count) || 0;
    }
    if (Array.isArray(result)) {
      return Number(result[0]?.count) || 0;
    }
    return Number((result as any)?.count) || 0;
  }

  // ─── Paginated Connections ──────────────────────────────────────────────────

  /**
   * Get paginated friends for a user.
   * Returns users joined with the friendships table.
   */
  async getFriendsPaginated(
    userId: number,
    cursor: string | null,
    limit: number,
  ): Promise<{ data: ConnectionUser[]; hasMore: boolean }> {
    // Build the query using a raw subquery to get the friend's user ID
    let query = this.db('friendships')
      .join('users', this.db.raw(`
        users.id = CASE 
          WHEN friendships.user_id_1 = ? THEN friendships.user_id_2 
          ELSE friendships.user_id_1 
        END
      `, [userId]))
      .where(function () {
        this.where('friendships.user_id_1', userId)
          .orWhere('friendships.user_id_2', userId);
      })
      .select(
        'users.id',
        'users.username',
        'users.display_name',
        'users.avatar_url',
        'friendships.id as friendship_id',
      );

    if (cursor) {
      const cursorId = parseInt(cursor, 10);
      if (!isNaN(cursorId)) {
        query = query.where('friendships.id', '>', cursorId);
      }
    }

    query = query.orderBy('friendships.id', 'asc').limit(limit + 1);

    const results = await query;
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return {
      data: data.map((r: any) => ({
        id: r.id,
        username: r.username,
        display_name: r.display_name,
        avatar_url: r.avatar_url,
      })),
      hasMore,
    };
  }

  /**
   * Get paginated followers for a user.
   * Returns users who follow this user.
   */
  async getFollowersPaginated(
    userId: number,
    cursor: string | null,
    limit: number,
  ): Promise<{ data: ConnectionUser[]; hasMore: boolean }> {
    let query = this.db('follows')
      .join('users', 'follows.follower_id', '=', 'users.id')
      .where('follows.followed_id', userId)
      .select(
        'users.id',
        'users.username',
        'users.display_name',
        'users.avatar_url',
        'follows.id as follow_id',
      );

    if (cursor) {
      const cursorId = parseInt(cursor, 10);
      if (!isNaN(cursorId)) {
        query = query.where('follows.id', '>', cursorId);
      }
    }

    query = query.orderBy('follows.id', 'asc').limit(limit + 1);

    const results = await query;
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return {
      data: data.map((r: any) => ({
        id: r.id,
        username: r.username,
        display_name: r.display_name,
        avatar_url: r.avatar_url,
      })),
      hasMore,
    };
  }

  /**
   * Get paginated following for a user.
   * Returns users that this user follows.
   */
  async getFollowingPaginated(
    userId: number,
    cursor: string | null,
    limit: number,
  ): Promise<{ data: ConnectionUser[]; hasMore: boolean }> {
    let query = this.db('follows')
      .join('users', 'follows.followed_id', '=', 'users.id')
      .where('follows.follower_id', userId)
      .select(
        'users.id',
        'users.username',
        'users.display_name',
        'users.avatar_url',
        'follows.id as follow_id',
      );

    if (cursor) {
      const cursorId = parseInt(cursor, 10);
      if (!isNaN(cursorId)) {
        query = query.where('follows.id', '>', cursorId);
      }
    }

    query = query.orderBy('follows.id', 'asc').limit(limit + 1);

    const results = await query;
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return {
      data: data.map((r: any) => ({
        id: r.id,
        username: r.username,
        display_name: r.display_name,
        avatar_url: r.avatar_url,
      })),
      hasMore,
    };
  }

  /**
   * Get the last cursor value for a paginated result.
   * Uses the relationship table's ID as the cursor.
   */
  getLastCursorFromFriends(results: any[]): string | null {
    if (results.length === 0) return null;
    const last = results[results.length - 1];
    return String(last.friendship_id || last.follow_id || last.id);
  }

  /**
   * Get the underlying Knex instance for advanced queries.
   */
  getDb(): Knex {
    return this.db;
  }
}
