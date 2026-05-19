/**
 * Chat service type definitions.
 *
 * Requirements covered:
 * - 7.1: Private chat messaging (delivery within 2s)
 * - 7.2: Group chat messaging (delivery within 2s)
 * - 7.3: Typing indicators (broadcast within 500ms)
 * - 7.4: Read receipts
 * - 7.5: Online/offline presence (broadcast within 5s)
 * - 7.6: Media messages (image, video, audio, document, max 25MB)
 * - 7.8: Encrypt message content before storage
 * - 7.9: Group chats support 2-100 participants
 * - 7.10: Persist messages for offline delivery
 * - 7.12: Text messages max 5000 characters
 */

export type ChatType = 'private' | 'group';
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document';
export type ParticipantRole = 'admin' | 'member';

/**
 * Chat record as stored in the database.
 */
export interface Chat {
  id: number;
  type: ChatType;
  name: string | null;
  created_by: number;
  participant_count: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Chat participant record.
 */
export interface ChatParticipant {
  id: number;
  chat_id: number;
  user_id: number;
  role: ParticipantRole;
  joined_at: Date;
}

/**
 * Message record as stored in the database.
 */
export interface Message {
  id: number;
  chat_id: number;
  sender_id: number;
  content_encrypted: string | null;
  type: MessageType;
  media_url: string | null;
  deleted_at: Date | null;
  created_at: Date;
}

/**
 * Message read receipt record.
 */
export interface MessageReadReceipt {
  id: number;
  message_id: number;
  user_id: number;
  read_at: Date;
}

/**
 * Input for creating a new chat.
 */
export interface CreateChatDTO {
  creatorId: number;
  participants: number[];
  type: ChatType;
  name?: string;
}

/**
 * Input for sending a message.
 */
export interface SendMessageDTO {
  chatId: number;
  senderId: number;
  content: string;
  type: MessageType;
  mediaUrl?: string;
}

/**
 * Paginated result for message queries.
 */
export interface PaginatedMessages {
  data: Message[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Socket delivery adapter interface for chat events.
 * Allows the ChatService to be tested independently of Socket.IO.
 */
export interface ChatSocketAdapter {
  /**
   * Emit a new message to a chat room.
   */
  emitMessage(chatId: number, message: MessagePayload): void;

  /**
   * Emit a typing indicator to a chat room.
   */
  emitTypingIndicator(chatId: number, userId: number, isTyping: boolean): void;

  /**
   * Emit a read receipt to a chat room.
   */
  emitReadReceipt(chatId: number, messageId: number, userId: number): void;

  /**
   * Emit online/offline status to a user's contacts.
   */
  emitPresenceStatus(userId: number, status: 'online' | 'offline'): void;

  /**
   * Check if a user is currently connected.
   */
  isUserConnected(userId: number): boolean;
}

/**
 * Message payload emitted via Socket.IO.
 */
export interface MessagePayload {
  chatId: number;
  messageId: number;
  senderId: number;
  content: string;
  type: MessageType;
  mediaUrl?: string | null;
  createdAt: string;
}

/**
 * No-op socket adapter for testing or when Socket.IO is not configured.
 */
export class NoOpChatSocketAdapter implements ChatSocketAdapter {
  emitMessage(_chatId: number, _message: MessagePayload): void {}
  emitTypingIndicator(_chatId: number, _userId: number, _isTyping: boolean): void {}
  emitReadReceipt(_chatId: number, _messageId: number, _userId: number): void {}
  emitPresenceStatus(_userId: number, _status: 'online' | 'offline'): void {}
  isUserConnected(_userId: number): boolean {
    return false;
  }
}

/**
 * Chat service error class.
 */
export class ChatError extends Error {
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ChatError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/** Maximum text message length (Requirement 7.12) */
export const MAX_TEXT_LENGTH = 5000;

/** Maximum media file size in bytes (25MB) (Requirement 7.6) */
export const MAX_MEDIA_SIZE_BYTES = 25 * 1024 * 1024;

/** Minimum participants for a chat (Requirement 7.9) */
export const MIN_PARTICIPANTS = 2;

/** Maximum participants for a group chat (Requirement 7.9) */
export const MAX_PARTICIPANTS = 100;

/** Valid message types (Requirement 7.6) */
export const VALID_MESSAGE_TYPES: MessageType[] = ['text', 'image', 'video', 'audio', 'document'];
