"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_MESSAGE_TYPES = exports.MAX_PARTICIPANTS = exports.MIN_PARTICIPANTS = exports.MAX_MEDIA_SIZE_BYTES = exports.MAX_TEXT_LENGTH = exports.ChatError = exports.NoOpChatSocketAdapter = void 0;
/**
 * No-op socket adapter for testing or when Socket.IO is not configured.
 */
class NoOpChatSocketAdapter {
    emitMessage(_chatId, _message) { }
    emitTypingIndicator(_chatId, _userId, _isTyping) { }
    emitReadReceipt(_chatId, _messageId, _userId) { }
    emitPresenceStatus(_userId, _status) { }
    isUserConnected(_userId) {
        return false;
    }
}
exports.NoOpChatSocketAdapter = NoOpChatSocketAdapter;
/**
 * Chat service error class.
 */
class ChatError extends Error {
    statusCode;
    details;
    constructor(message, statusCode, details) {
        super(message);
        this.name = 'ChatError';
        this.statusCode = statusCode;
        this.details = details;
    }
}
exports.ChatError = ChatError;
/** Maximum text message length (Requirement 7.12) */
exports.MAX_TEXT_LENGTH = 5000;
/** Maximum media file size in bytes (25MB) (Requirement 7.6) */
exports.MAX_MEDIA_SIZE_BYTES = 25 * 1024 * 1024;
/** Minimum participants for a chat (Requirement 7.9) */
exports.MIN_PARTICIPANTS = 2;
/** Maximum participants for a group chat (Requirement 7.9) */
exports.MAX_PARTICIPANTS = 100;
/** Valid message types (Requirement 7.6) */
exports.VALID_MESSAGE_TYPES = ['text', 'image', 'video', 'audio', 'document'];
//# sourceMappingURL=types.js.map