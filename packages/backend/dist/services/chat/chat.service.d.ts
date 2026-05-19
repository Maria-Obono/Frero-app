/**
 * Chat service for real-time messaging.
 *
 * Handles private and group chat creation, message sending with encryption,
 * typing indicators, read receipts, and presence tracking.
 *
 * Requirements covered:
 * - 7.1: Private chat messaging (delivery within 2s via Socket.IO)
 * - 7.2: Group chat messaging (delivery within 2s via Socket.IO)
 * - 7.3: Typing indicators (broadcast within 500ms)
 * - 7.4: Read receipts
 * - 7.5: Online/offline presence (broadcast within 5s)
 * - 7.6: Media messages (image, video, audio, document, max 25MB)
 * - 7.8: Encrypt message content before storage
 * - 7.9: Group chats support 2-100 participants
 * - 7.10: Persist messages for offline delivery
 * - 7.12: Text messages max 5000 characters
 */
import { ChatRepository } from './chat.repository';
import { Chat, ChatSocketAdapter, CreateChatDTO, Message, PaginatedMessages, SendMessageDTO } from './types';
export declare class ChatService {
    private readonly repository;
    private readonly socketAdapter;
    private readonly encryptionKey;
    constructor(options?: {
        repository?: ChatRepository;
        socketAdapter?: ChatSocketAdapter;
        encryptionKey?: string;
    });
    /**
     * Create a new chat (private or group).
     *
     * For private chats: exactly 2 participants (creator + 1 other).
     * For group chats: 2-100 participants.
     *
     * Requirements: 7.1, 7.2, 7.9
     */
    createChat(dto: CreateChatDTO): Promise<Chat>;
    /**
     * Send a message in a chat.
     *
     * Validates the sender is a participant, encrypts content,
     * persists the message, and delivers via Socket.IO.
     *
     * Requirements: 7.1, 7.2, 7.6, 7.8, 7.10, 7.12
     */
    sendMessage(dto: SendMessageDTO): Promise<Message>;
    /**
     * Mark a message as read by a user.
     *
     * Creates a read receipt and notifies the sender via Socket.IO.
     *
     * Requirement: 7.4
     */
    markAsRead(chatId: number, messageId: number, userId: number): Promise<void>;
    /**
     * Get messages for a chat with cursor-based pagination.
     * Decrypts message content before returning.
     *
     * Requirement: 7.10 (offline delivery - messages are persisted)
     */
    getMessages(chatId: number, userId: number, cursor?: string | null, limit?: number): Promise<PaginatedMessages>;
    /**
     * Handle typing start event.
     * Sets typing indicator in Redis and broadcasts to chat participants.
     *
     * Requirement: 7.3 (broadcast within 500ms)
     */
    startTyping(chatId: number, userId: number): Promise<void>;
    /**
     * Handle typing stop event.
     * Clears typing indicator in Redis and broadcasts to chat participants.
     *
     * Requirement: 7.3
     */
    stopTyping(chatId: number, userId: number): Promise<void>;
    /**
     * Broadcast user presence status change.
     *
     * Requirement: 7.5 (broadcast within 5s)
     */
    broadcastPresence(userId: number, status: 'online' | 'offline'): void;
    /**
     * Get undelivered messages for a user (for offline delivery on reconnection).
     *
     * Requirement: 7.10
     */
    getUndeliveredMessages(userId: number): Promise<Message[]>;
    /**
     * Encrypt message content using AES-256-GCM.
     *
     * Requirement: 7.8
     *
     * Format: iv:authTag:ciphertext (all hex-encoded)
     */
    encryptContent(plaintext: string): string;
    /**
     * Decrypt message content from AES-256-GCM encrypted format.
     *
     * Requirement: 7.8
     */
    decryptContent(encryptedData: string): string;
    /**
     * Derive a 32-byte encryption key from a string source.
     */
    private deriveKey;
}
//# sourceMappingURL=chat.service.d.ts.map