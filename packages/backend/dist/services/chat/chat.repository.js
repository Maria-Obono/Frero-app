"use strict";
/**
 * Chat repository for database access.
 *
 * Handles CRUD operations on chats, chat_participants, messages,
 * and message_read_receipts tables.
 *
 * Requirements covered:
 * - 7.1, 7.2: Chat creation and message persistence
 * - 7.4: Read receipts
 * - 7.9: Group chats (2-100 participants)
 * - 7.10: Persist messages for offline delivery
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatRepository = void 0;
const connection_1 = require("../../database/connection");
/** Default page size for message pagination */
const DEFAULT_PAGE_SIZE = 20;
/** Maximum page size for message pagination */
const MAX_PAGE_SIZE = 50;
class ChatRepository {
    db;
    constructor(options) {
        this.db = options?.db || (0, connection_1.getDatabase)();
    }
    // ─── Chat Operations ────────────────────────────────────────────────────────
    /**
     * Create a new chat room.
     */
    async createChat(data) {
        const [id] = await this.db('chats').insert({
            type: data.type,
            name: data.name,
            created_by: data.created_by,
            participant_count: data.participant_count,
        });
        const chat = await this.db('chats').where('id', id).first();
        return chat;
    }
    /**
     * Find a chat by ID.
     */
    async findChatById(chatId) {
        const result = await this.db('chats').where('id', chatId).first();
        return result;
    }
    /**
     * Find an existing private chat between two users.
     */
    async findPrivateChat(userId1, userId2) {
        const result = await this.db('chats')
            .where('type', 'private')
            .whereExists(this.db('chat_participants')
            .whereRaw('chat_participants.chat_id = chats.id')
            .where('user_id', userId1))
            .whereExists(this.db('chat_participants')
            .whereRaw('chat_participants.chat_id = chats.id')
            .where('user_id', userId2))
            .first();
        return result;
    }
    /**
     * Update participant count for a chat.
     */
    async updateParticipantCount(chatId, count) {
        await this.db('chats').where('id', chatId).update({ participant_count: count });
    }
    // ─── Participant Operations ─────────────────────────────────────────────────
    /**
     * Add participants to a chat.
     */
    async addParticipants(chatId, participants) {
        const records = participants.map((p) => ({
            chat_id: chatId,
            user_id: p.user_id,
            role: p.role,
        }));
        await this.db('chat_participants').insert(records);
    }
    /**
     * Get all participants of a chat.
     */
    async getParticipants(chatId) {
        return this.db('chat_participants')
            .where('chat_id', chatId);
    }
    /**
     * Check if a user is a participant of a chat.
     */
    async isParticipant(chatId, userId) {
        const result = await this.db('chat_participants')
            .where('chat_id', chatId)
            .where('user_id', userId)
            .first();
        return !!result;
    }
    /**
     * Get participant count for a chat.
     */
    async getParticipantCount(chatId) {
        const result = await this.db('chat_participants')
            .where('chat_id', chatId)
            .count('* as count')
            .first();
        return Number(result?.count) || 0;
    }
    // ─── Message Operations ─────────────────────────────────────────────────────
    /**
     * Create a new message.
     */
    async createMessage(data) {
        const [id] = await this.db('messages').insert({
            chat_id: data.chat_id,
            sender_id: data.sender_id,
            content_encrypted: data.content_encrypted,
            type: data.type,
            media_url: data.media_url,
        });
        const message = await this.db('messages').where('id', id).first();
        return message;
    }
    /**
     * Find a message by ID.
     */
    async findMessageById(messageId) {
        const result = await this.db('messages')
            .where('id', messageId)
            .whereNull('deleted_at')
            .first();
        return result;
    }
    /**
     * Get messages for a chat with cursor-based pagination.
     * Returns messages in reverse chronological order (newest first).
     */
    async getMessages(chatId, cursor, limit) {
        const pageSize = this.normalizePaginationLimit(limit);
        const qb = this.db('messages')
            .where('chat_id', chatId)
            .whereNull('deleted_at')
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc');
        if (cursor) {
            const cursorId = parseInt(cursor, 10);
            if (!isNaN(cursorId)) {
                qb.where('id', '<', cursorId);
            }
        }
        qb.limit(pageSize + 1);
        const results = (await qb);
        const hasMore = results.length > pageSize;
        const data = hasMore ? results.slice(0, pageSize) : results;
        const nextCursor = data.length > 0 ? String(data[data.length - 1].id) : null;
        return {
            data,
            cursor: hasMore ? nextCursor : null,
            hasMore,
        };
    }
    /**
     * Get undelivered messages for a user (messages sent while they were offline).
     * Returns messages from all chats the user participates in that were sent
     * after their last read receipt.
     */
    async getUndeliveredMessages(userId) {
        // Get all chat IDs the user participates in
        const participantRecords = await this.db('chat_participants')
            .where('user_id', userId)
            .select('chat_id');
        if (participantRecords.length === 0)
            return [];
        const chatIds = participantRecords.map((r) => r.chat_id);
        // Get messages not sent by this user that don't have a read receipt from them
        return this.db('messages')
            .whereIn('chat_id', chatIds)
            .where('sender_id', '!=', userId)
            .whereNull('deleted_at')
            .whereNotExists(this.db('message_read_receipts')
            .whereRaw('message_read_receipts.message_id = messages.id')
            .where('message_read_receipts.user_id', userId))
            .orderBy('created_at', 'asc');
    }
    // ─── Read Receipt Operations ────────────────────────────────────────────────
    /**
     * Create or update a read receipt.
     * Uses INSERT IGNORE to handle duplicate (message_id, user_id) pairs.
     */
    async createReadReceipt(messageId, userId) {
        try {
            const [id] = await this.db('message_read_receipts').insert({
                message_id: messageId,
                user_id: userId,
            });
            const receipt = await this.db('message_read_receipts').where('id', id).first();
            return receipt;
        }
        catch (err) {
            // Handle duplicate key error (already read)
            if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('UNIQUE constraint')) {
                return null;
            }
            throw err;
        }
    }
    /**
     * Get read receipts for a message.
     */
    async getReadReceipts(messageId) {
        return this.db('message_read_receipts')
            .where('message_id', messageId);
    }
    /**
     * Normalize pagination limit to be within bounds.
     */
    normalizePaginationLimit(limit) {
        if (limit === undefined || limit === null) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
    }
}
exports.ChatRepository = ChatRepository;
//# sourceMappingURL=chat.repository.js.map