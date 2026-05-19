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
import { Knex } from 'knex';
import { Chat, ChatParticipant, ChatType, Message, MessageReadReceipt, MessageType, PaginatedMessages, ParticipantRole } from './types';
export declare class ChatRepository {
    private readonly db;
    constructor(options?: {
        db?: Knex;
    });
    /**
     * Create a new chat room.
     */
    createChat(data: {
        type: ChatType;
        name: string | null;
        created_by: number;
        participant_count: number;
    }): Promise<Chat>;
    /**
     * Find a chat by ID.
     */
    findChatById(chatId: number): Promise<Chat | undefined>;
    /**
     * Find an existing private chat between two users.
     */
    findPrivateChat(userId1: number, userId2: number): Promise<Chat | undefined>;
    /**
     * Update participant count for a chat.
     */
    updateParticipantCount(chatId: number, count: number): Promise<void>;
    /**
     * Add participants to a chat.
     */
    addParticipants(chatId: number, participants: Array<{
        user_id: number;
        role: ParticipantRole;
    }>): Promise<void>;
    /**
     * Get all participants of a chat.
     */
    getParticipants(chatId: number): Promise<ChatParticipant[]>;
    /**
     * Check if a user is a participant of a chat.
     */
    isParticipant(chatId: number, userId: number): Promise<boolean>;
    /**
     * Get participant count for a chat.
     */
    getParticipantCount(chatId: number): Promise<number>;
    /**
     * Create a new message.
     */
    createMessage(data: {
        chat_id: number;
        sender_id: number;
        content_encrypted: string | null;
        type: MessageType;
        media_url: string | null;
    }): Promise<Message>;
    /**
     * Find a message by ID.
     */
    findMessageById(messageId: number): Promise<Message | undefined>;
    /**
     * Get messages for a chat with cursor-based pagination.
     * Returns messages in reverse chronological order (newest first).
     */
    getMessages(chatId: number, cursor?: string | null, limit?: number): Promise<PaginatedMessages>;
    /**
     * Get undelivered messages for a user (messages sent while they were offline).
     * Returns messages from all chats the user participates in that were sent
     * after their last read receipt.
     */
    getUndeliveredMessages(userId: number): Promise<Message[]>;
    /**
     * Create or update a read receipt.
     * Uses INSERT IGNORE to handle duplicate (message_id, user_id) pairs.
     */
    createReadReceipt(messageId: number, userId: number): Promise<MessageReadReceipt | null>;
    /**
     * Get read receipts for a message.
     */
    getReadReceipts(messageId: number): Promise<MessageReadReceipt[]>;
    /**
     * Normalize pagination limit to be within bounds.
     */
    private normalizePaginationLimit;
}
//# sourceMappingURL=chat.repository.d.ts.map