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

import crypto from 'crypto';

import { ChatRepository } from './chat.repository';
import {
  Chat,
  ChatError,
  ChatSocketAdapter,
  CreateChatDTO,
  MAX_PARTICIPANTS,
  MAX_TEXT_LENGTH,
  Message,
  MessagePayload,
  MIN_PARTICIPANTS,
  NoOpChatSocketAdapter,
  PaginatedMessages,
  SendMessageDTO,
  VALID_MESSAGE_TYPES,
} from './types';
import { setTyping, clearTyping } from '../../utils/redis-utils';
import { logger } from '../../utils/logger';

/** Encryption algorithm for message content (Requirement 7.8) */
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/** IV length in bytes for AES-GCM */
const IV_LENGTH = 16;

export class ChatService {
  private readonly repository: ChatRepository;
  private readonly socketAdapter: ChatSocketAdapter;
  private readonly encryptionKey: Buffer;

  constructor(options?: {
    repository?: ChatRepository;
    socketAdapter?: ChatSocketAdapter;
    encryptionKey?: string;
  }) {
    this.repository = options?.repository || new ChatRepository();
    this.socketAdapter = options?.socketAdapter || new NoOpChatSocketAdapter();

    // Derive a 32-byte key from the provided key or use a default for development
    const keySource = options?.encryptionKey || process.env.CHAT_ENCRYPTION_KEY || 'dev-chat-encryption-key-32bytes!';
    this.encryptionKey = this.deriveKey(keySource);
  }

  // ─── Chat Creation ──────────────────────────────────────────────────────────

  /**
   * Create a new chat (private or group).
   *
   * For private chats: exactly 2 participants (creator + 1 other).
   * For group chats: 2-100 participants.
   *
   * Requirements: 7.1, 7.2, 7.9
   */
  async createChat(dto: CreateChatDTO): Promise<Chat> {
    const { creatorId, participants, type, name } = dto;

    // Validate creator
    if (!creatorId || creatorId <= 0) {
      throw new ChatError('Creator ID is required', 400);
    }

    // Validate type
    if (!type || !['private', 'group'].includes(type)) {
      throw new ChatError('Chat type must be "private" or "group"', 400);
    }

    // Validate participants array
    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      throw new ChatError('Participants array is required and must not be empty', 400);
    }

    // Ensure creator is included in participants
    const allParticipants = new Set([creatorId, ...participants]);

    // Validate participant count (Requirement 7.9)
    if (allParticipants.size < MIN_PARTICIPANTS) {
      throw new ChatError(
        `Chat must have at least ${MIN_PARTICIPANTS} participants`,
        400,
        { min: MIN_PARTICIPANTS, actual: allParticipants.size },
      );
    }

    if (allParticipants.size > MAX_PARTICIPANTS) {
      throw new ChatError(
        `Chat cannot exceed ${MAX_PARTICIPANTS} participants`,
        400,
        { max: MAX_PARTICIPANTS, actual: allParticipants.size },
      );
    }

    // Private chat specific validation
    if (type === 'private') {
      if (allParticipants.size !== 2) {
        throw new ChatError('Private chat must have exactly 2 participants', 400);
      }

      // Check if a private chat already exists between these users
      const participantArray = Array.from(allParticipants);
      const existingChat = await this.repository.findPrivateChat(
        participantArray[0]!,
        participantArray[1]!,
      );

      if (existingChat) {
        return existingChat;
      }
    }

    // Create the chat
    const chat = await this.repository.createChat({
      type,
      name: type === 'group' ? (name || null) : null,
      created_by: creatorId,
      participant_count: allParticipants.size,
    });

    // Add participants
    const participantRecords = Array.from(allParticipants).map((userId) => ({
      user_id: userId,
      role: userId === creatorId ? ('admin' as const) : ('member' as const),
    }));

    await this.repository.addParticipants(chat.id, participantRecords);

    logger.info('Chat created', {
      chatId: chat.id,
      type,
      creatorId,
      participantCount: allParticipants.size,
    });

    return chat;
  }

  // ─── Message Sending ────────────────────────────────────────────────────────

  /**
   * Send a message in a chat.
   *
   * Validates the sender is a participant, encrypts content,
   * persists the message, and delivers via Socket.IO.
   *
   * Requirements: 7.1, 7.2, 7.6, 7.8, 7.10, 7.12
   */
  async sendMessage(dto: SendMessageDTO): Promise<Message> {
    const { chatId, senderId, content, type, mediaUrl } = dto;

    // Validate inputs
    if (!chatId || chatId <= 0) {
      throw new ChatError('Chat ID is required', 400);
    }

    if (!senderId || senderId <= 0) {
      throw new ChatError('Sender ID is required', 400);
    }

    if (!type || !VALID_MESSAGE_TYPES.includes(type)) {
      throw new ChatError(
        `Message type must be one of: ${VALID_MESSAGE_TYPES.join(', ')}`,
        400,
      );
    }

    // Validate text content (Requirement 7.12)
    if (type === 'text') {
      if (!content || content.trim().length === 0) {
        throw new ChatError('Text message content cannot be empty', 400);
      }
      if (content.length > MAX_TEXT_LENGTH) {
        throw new ChatError(
          `Text message cannot exceed ${MAX_TEXT_LENGTH} characters`,
          400,
          { maxLength: MAX_TEXT_LENGTH, actualLength: content.length },
        );
      }
    }

    // Validate media messages require a media URL
    if (type !== 'text' && !mediaUrl) {
      throw new ChatError('Media messages require a media URL', 400);
    }

    // Verify chat exists
    const chat = await this.repository.findChatById(chatId);
    if (!chat) {
      throw new ChatError('Chat not found', 404);
    }

    // Verify sender is a participant
    const isParticipant = await this.repository.isParticipant(chatId, senderId);
    if (!isParticipant) {
      throw new ChatError('User is not a participant of this chat', 403);
    }

    // Encrypt message content (Requirement 7.8)
    const encryptedContent = content ? this.encryptContent(content) : null;

    // Persist message (Requirement 7.10)
    const message = await this.repository.createMessage({
      chat_id: chatId,
      sender_id: senderId,
      content_encrypted: encryptedContent,
      type,
      media_url: mediaUrl || null,
    });

    // Deliver via Socket.IO (Requirements 7.1, 7.2)
    const payload: MessagePayload = {
      chatId,
      messageId: message.id,
      senderId,
      content: content || '',
      type,
      mediaUrl: mediaUrl || null,
      createdAt: message.created_at.toISOString ? message.created_at.toISOString() : String(message.created_at),
    };

    this.socketAdapter.emitMessage(chatId, payload);

    logger.debug('Message sent', {
      chatId,
      messageId: message.id,
      senderId,
      type,
    });

    return message;
  }

  // ─── Read Receipts ──────────────────────────────────────────────────────────

  /**
   * Mark a message as read by a user.
   *
   * Creates a read receipt and notifies the sender via Socket.IO.
   *
   * Requirement: 7.4
   */
  async markAsRead(chatId: number, messageId: number, userId: number): Promise<void> {
    // Validate inputs
    if (!chatId || chatId <= 0) {
      throw new ChatError('Chat ID is required', 400);
    }
    if (!messageId || messageId <= 0) {
      throw new ChatError('Message ID is required', 400);
    }
    if (!userId || userId <= 0) {
      throw new ChatError('User ID is required', 400);
    }

    // Verify user is a participant
    const isParticipant = await this.repository.isParticipant(chatId, userId);
    if (!isParticipant) {
      throw new ChatError('User is not a participant of this chat', 403);
    }

    // Verify message exists and belongs to this chat
    const message = await this.repository.findMessageById(messageId);
    if (!message || message.chat_id !== chatId) {
      throw new ChatError('Message not found in this chat', 404);
    }

    // Don't create read receipt for own messages
    if (message.sender_id === userId) {
      return;
    }

    // Create read receipt
    await this.repository.createReadReceipt(messageId, userId);

    // Notify via Socket.IO (Requirement 7.4)
    this.socketAdapter.emitReadReceipt(chatId, messageId, userId);

    logger.debug('Message marked as read', { chatId, messageId, userId });
  }

  // ─── Message Retrieval ──────────────────────────────────────────────────────

  /**
   * Get messages for a chat with cursor-based pagination.
   * Decrypts message content before returning.
   *
   * Requirement: 7.10 (offline delivery - messages are persisted)
   */
  async getMessages(
    chatId: number,
    userId: number,
    cursor?: string | null,
    limit?: number,
  ): Promise<PaginatedMessages> {
    if (!chatId || chatId <= 0) {
      throw new ChatError('Chat ID is required', 400);
    }
    if (!userId || userId <= 0) {
      throw new ChatError('User ID is required', 400);
    }

    // Verify user is a participant
    const isParticipant = await this.repository.isParticipant(chatId, userId);
    if (!isParticipant) {
      throw new ChatError('User is not a participant of this chat', 403);
    }

    const result = await this.repository.getMessages(chatId, cursor, limit);

    // Decrypt message content for delivery
    const decryptedMessages = result.data.map((msg) => ({
      ...msg,
      content_encrypted: msg.content_encrypted
        ? this.decryptContent(msg.content_encrypted)
        : null,
    }));

    return {
      data: decryptedMessages,
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  }

  // ─── Typing Indicators ─────────────────────────────────────────────────────

  /**
   * Handle typing start event.
   * Sets typing indicator in Redis and broadcasts to chat participants.
   *
   * Requirement: 7.3 (broadcast within 500ms)
   */
  async startTyping(chatId: number, userId: number): Promise<void> {
    if (!chatId || chatId <= 0 || !userId || userId <= 0) {
      return;
    }

    // Set typing indicator in Redis (auto-expires after 5s)
    await setTyping(String(chatId), String(userId));

    // Broadcast to chat room via Socket.IO
    this.socketAdapter.emitTypingIndicator(chatId, userId, true);
  }

  /**
   * Handle typing stop event.
   * Clears typing indicator in Redis and broadcasts to chat participants.
   *
   * Requirement: 7.3
   */
  async stopTyping(chatId: number, userId: number): Promise<void> {
    if (!chatId || chatId <= 0 || !userId || userId <= 0) {
      return;
    }

    // Clear typing indicator in Redis
    await clearTyping(String(chatId), String(userId));

    // Broadcast to chat room via Socket.IO
    this.socketAdapter.emitTypingIndicator(chatId, userId, false);
  }

  // ─── Presence ───────────────────────────────────────────────────────────────

  /**
   * Broadcast user presence status change.
   *
   * Requirement: 7.5 (broadcast within 5s)
   */
  broadcastPresence(userId: number, status: 'online' | 'offline'): void {
    if (!userId || userId <= 0) {
      return;
    }

    this.socketAdapter.emitPresenceStatus(userId, status);
  }

  // ─── Offline Delivery ───────────────────────────────────────────────────────

  /**
   * Get undelivered messages for a user (for offline delivery on reconnection).
   *
   * Requirement: 7.10
   */
  async getUndeliveredMessages(userId: number): Promise<Message[]> {
    if (!userId || userId <= 0) {
      return [];
    }

    return this.repository.getUndeliveredMessages(userId);
  }

  // ─── Encryption ─────────────────────────────────────────────────────────────

  /**
   * Encrypt message content using AES-256-GCM.
   *
   * Requirement: 7.8
   *
   * Format: iv:authTag:ciphertext (all hex-encoded)
   */
  encryptContent(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt message content from AES-256-GCM encrypted format.
   *
   * Requirement: 7.8
   */
  decryptContent(encryptedData: string): string {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        // If not in expected format, return as-is (legacy unencrypted data)
        return encryptedData;
      }

      const iv = Buffer.from(parts[0]!, 'hex');
      const authTag = Buffer.from(parts[1]!, 'hex');
      const ciphertext = parts[2]!;

      const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (err) {
      logger.error('Failed to decrypt message content', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Return placeholder for corrupted data
      return '[encrypted message]';
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Derive a 32-byte encryption key from a string source.
   */
  private deriveKey(source: string): Buffer {
    // Use SHA-256 to derive a consistent 32-byte key
    return crypto.createHash('sha256').update(source).digest();
  }
}
