"use strict";
/**
 * Friend repository for friend request and friendship database operations.
 *
 * Provides data access for:
 * - friend_requests table (pending/accepted/declined requests)
 * - friendships table (mutual friendship records)
 * - blocks table (block relationship checks)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FriendRepository = void 0;
const connection_1 = require("../../database/connection");
class FriendRepository {
    db;
    constructor(options) {
        this.db = options?.db || (0, connection_1.getDatabase)();
    }
    // ─── Friend Requests ────────────────────────────────────────────────────────
    /**
     * Find a friend request by ID.
     */
    async findRequestById(id) {
        return this.db('friend_requests').where('id', id).first();
    }
    /**
     * Find a friend request between two specific users (in either direction).
     * Returns the request where sender_id = senderId AND recipient_id = recipientId.
     */
    async findRequestBetween(senderId, recipientId) {
        return this.db('friend_requests')
            .where('sender_id', senderId)
            .where('recipient_id', recipientId)
            .first();
    }
    /**
     * Find any pending request between two users in either direction.
     * Returns the first pending request found.
     */
    async findPendingRequestBetween(userId1, userId2) {
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
    async countPendingOutbound(senderId) {
        const result = await this.db('friend_requests')
            .where('sender_id', senderId)
            .where('status', 'pending')
            .count('* as count')
            .first();
        return Number(result?.count) || 0;
    }
    /**
     * Create a new friend request.
     * Returns the ID of the created request.
     */
    async createRequest(senderId, recipientId) {
        const [id] = await this.db('friend_requests').insert({
            sender_id: senderId,
            recipient_id: recipientId,
            status: 'pending',
        });
        return id;
    }
    /**
     * Update the status of a friend request.
     * Returns the number of affected rows.
     */
    async updateRequestStatus(requestId, status) {
        return this.db('friend_requests').where('id', requestId).update({ status });
    }
    /**
     * Delete a friend request by ID.
     * Used when declining (Requirement 3.3: remove the pending request).
     */
    async deleteRequest(requestId) {
        return this.db('friend_requests').where('id', requestId).delete();
    }
    // ─── Friendships ────────────────────────────────────────────────────────────
    /**
     * Check if a friendship exists between two users (in either direction).
     */
    async friendshipExists(userId1, userId2) {
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
        return Number(result?.count) > 0;
    }
    /**
     * Count total friends for a user (friendships in either direction).
     * Used to enforce the 5000 friend limit (Requirement 3.2).
     */
    async countFriends(userId) {
        const result = await this.db('friendships')
            .where('user_id_1', userId)
            .orWhere('user_id_2', userId)
            .count('* as count')
            .first();
        return Number(result?.count) || 0;
    }
    /**
     * Create a friendship record.
     * Stores with user_id_1 < user_id_2 to maintain the unique constraint.
     * Returns the ID of the created friendship.
     */
    async createFriendship(userId1, userId2) {
        // Enforce canonical ordering to satisfy the unique constraint (user_id_1, user_id_2)
        const [lower, higher] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
        const [id] = await this.db('friendships').insert({
            user_id_1: lower,
            user_id_2: higher,
        });
        return id;
    }
    /**
     * Find a friendship record between two users.
     */
    async findFriendship(userId1, userId2) {
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
    async blockExists(userId1, userId2) {
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
        return Number(result?.count) > 0;
    }
    /**
     * Get the underlying Knex instance for advanced queries.
     */
    getDb() {
        return this.db;
    }
}
exports.FriendRepository = FriendRepository;
//# sourceMappingURL=friend.repository.js.map