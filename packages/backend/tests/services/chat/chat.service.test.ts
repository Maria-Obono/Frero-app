/**
 * Unit tests for ChatService.
 *
 * Tests cover:
 * - Requirement 7.1: Private chat messaging (delivery within 2s via Socket.IO)
 * - Requirement 7.2: Group chat messaging (delivery within 2s via Socket.IO)
 * - Requirement 7.3: Typing indicators (broadcast within 500ms)
 * - Requirement 7.4: Read receipts
 * - Requirement 7.5: Online/offline presence (broadcast within 5s)
 * - Requirement 7.6: Media messages (image, video, audio, document, max 25MB)
 * - Requirement 7.8: Encrypt message content before storage
 * - Requirement 7.9: Group chats support 2-100 participants
 * - Requirement 7.10: Persist messages for offline delivery
 * - Requirement 7.12: Text messages max 5000 characters
 */

import { ChatService } from '../../../src/services/chat/chat.service';
import { ChatRepository } from '../../../src/services/chat/chat.repository';
import {
  Chat,
  ChatError,
  ChatSocketAdapter,
  Message,
} from '../../../src/services/chat/types';

// Mock the database connection
jest.mock('../../../src/database/connection', () => ({
  getDatabase: jest.fn(),
}));

// Mock redis-utils
jest.mock('../../../src/utils/redis-utils', () => ({
  setTyping: jest.fn().mockResolvedValue(undefined),
  clearTyping: jest.fn().mockResolvedValue(undefined),
}));

import { setTyping, clearTyping } from '../../../src/utils/redis-utils';

describe('ChatService', () => {
  let service: ChatService;
  let mockRepository: jest.Mocked<ChatRepository>;
  let mockSocketAdapter: jest.Mocked<ChatSocketAdapter>;

  const sampleChat: Chat = {
    id: 1,
    type: 'private',
    name: null,
    created_by: 10,
    participant_count: 2,
    created_at: new Date('2024-01-15T10:00:00Z'),
    updated_at: new Date('2024-01-15T10:00:00Z'),
  };

  const sampleGroupChat: Chat = {
    id: 2,
    type: 'group',
    name: 'Test Group',
    created_by: 10,
    participant_count: 5,
    created_at: new Date('2024-01-15T10:00:00Z'),
    updated_at: new Date('2024-01-15T10:00:00Z'),
  };

  const sampleMessage: Message = {
    id: 1,
    chat_id: 1,
    sender_id: 10,
    content_encrypted: null,
    type: 'text',
    media_url: null,
    deleted_at: null,
    created_at: new Date('2024-01-15T10:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockRepository = {
      createChat: jest.fn(),
      findChatById: jest.fn(),
      findPrivateChat: jest.fn(),
      updateParticipantCount: jest.fn(),
      addParticipants: jest.fn(),
      getParticipants: jest.fn(),
      isParticipant: jest.fn(),
      getParticipantCount: jest.fn(),
      createMessage: jest.fn(),
      findMessageById: jest.fn(),
      getMessages: jest.fn(),
      getUndeliveredMessages: jest.fn(),
      createReadReceipt: jest.fn(),
      getReadReceipts: jest.fn(),
    } as unknown as jest.Mocked<ChatRepository>;

    mockSocketAdapter = {
      emitMessage: jest.fn(),
      emitTypingIndicator: jest.fn(),
      emitReadReceipt: jest.fn(),
      emitPresenceStatus: jest.fn(),
      isUserConnected: jest.fn(),
    };

    service = new ChatService({
      repository: mockRepository,
      socketAdapter: mockSocketAdapter,
      encryptionKey: 'test-encryption-key-for-unit-tests',
    });
  });

  // ─── createChat() ──────────────────────────────────────────────────────────

  describe('createChat()', () => {
    it('should create a private chat with 2 participants (Requirement 7.1)', async () => {
      mockRepository.findPrivateChat.mockResolvedValue(undefined);
      mockRepository.createChat.mockResolvedValue(sampleChat);
      mockRepository.addParticipants.mockResolvedValue(undefined);

      const result = await service.createChat({
        creatorId: 10,
        participants: [20],
        type: 'private',
      });

      expect(result).toEqual(sampleChat);
      expect(mockRepository.createChat).toHaveBeenCalledWith({
        type: 'private',
        name: null,
        created_by: 10,
        participant_count: 2,
      });
      expect(mockRepository.addParticipants).toHaveBeenCalledWith(1, [
        { user_id: 10, role: 'admin' },
        { user_id: 20, role: 'member' },
      ]);
    });

    it('should return existing private chat if one already exists', async () => {
      mockRepository.findPrivateChat.mockResolvedValue(sampleChat);

      const result = await service.createChat({
        creatorId: 10,
        participants: [20],
        type: 'private',
      });

      expect(result).toEqual(sampleChat);
      expect(mockRepository.createChat).not.toHaveBeenCalled();
    });

    it('should create a group chat with multiple participants (Requirement 7.9)', async () => {
      mockRepository.createChat.mockResolvedValue(sampleGroupChat);
      mockRepository.addParticipants.mockResolvedValue(undefined);

      const result = await service.createChat({
        creatorId: 10,
        participants: [20, 30, 40, 50],
        type: 'group',
        name: 'Test Group',
      });

      expect(result).toEqual(sampleGroupChat);
      expect(mockRepository.createChat).toHaveBeenCalledWith({
        type: 'group',
        name: 'Test Group',
        created_by: 10,
        participant_count: 5,
      });
    });

    it('should reject private chat with more than 2 participants', async () => {
      await expect(
        service.createChat({
          creatorId: 10,
          participants: [20, 30],
          type: 'private',
        }),
      ).rejects.toThrow(ChatError);
      await expect(
        service.createChat({
          creatorId: 10,
          participants: [20, 30],
          type: 'private',
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('should reject group chat with more than 100 participants (Requirement 7.9)', async () => {
      const tooManyParticipants = Array.from({ length: 101 }, (_, i) => i + 2);

      await expect(
        service.createChat({
          creatorId: 1,
          participants: tooManyParticipants,
          type: 'group',
        }),
      ).rejects.toThrow(ChatError);
    });

    it('should reject chat with fewer than 2 participants', async () => {
      await expect(
        service.createChat({
          creatorId: 10,
          participants: [],
          type: 'group',
        }),
      ).rejects.toThrow(ChatError);
    });

    it('should reject when creatorId is missing', async () => {
      await expect(
        service.createChat({
          creatorId: 0,
          participants: [20],
          type: 'private',
        }),
      ).rejects.toThrow(ChatError);
    });

    it('should reject invalid chat type', async () => {
      await expect(
        service.createChat({
          creatorId: 10,
          participants: [20],
          type: 'invalid' as any,
        }),
      ).rejects.toThrow(ChatError);
    });

    it('should deduplicate participants', async () => {
      mockRepository.findPrivateChat.mockResolvedValue(undefined);
      mockRepository.createChat.mockResolvedValue(sampleChat);
      mockRepository.addParticipants.mockResolvedValue(undefined);

      await service.createChat({
        creatorId: 10,
        participants: [20, 20, 20],
        type: 'private',
      });

      expect(mockRepository.createChat).toHaveBeenCalledWith(
        expect.objectContaining({ participant_count: 2 }),
      );
    });

    it('should include creator in participants even if not in array', async () => {
      mockRepository.findPrivateChat.mockResolvedValue(undefined);
      mockRepository.createChat.mockResolvedValue(sampleChat);
      mockRepository.addParticipants.mockResolvedValue(undefined);

      await service.createChat({
        creatorId: 10,
        participants: [20],
        type: 'private',
      });

      expect(mockRepository.addParticipants).toHaveBeenCalledWith(
        1,
        expect.arrayContaining([
          expect.objectContaining({ user_id: 10, role: 'admin' }),
        ]),
      );
    });
  });

  // ─── sendMessage() ─────────────────────────────────────────────────────────

  describe('sendMessage()', () => {
    beforeEach(() => {
      mockRepository.findChatById.mockResolvedValue(sampleChat);
      mockRepository.isParticipant.mockResolvedValue(true);
    });

    it('should send a text message and deliver via Socket.IO (Requirement 7.1)', async () => {
      const createdMessage = { ...sampleMessage, content_encrypted: 'encrypted-data' };
      mockRepository.createMessage.mockResolvedValue(createdMessage);

      const result = await service.sendMessage({
        chatId: 1,
        senderId: 10,
        content: 'Hello, world!',
        type: 'text',
      });

      expect(result).toEqual(createdMessage);
      expect(mockRepository.createMessage).toHaveBeenCalledWith({
        chat_id: 1,
        sender_id: 10,
        content_encrypted: expect.any(String),
        type: 'text',
        media_url: null,
      });
      expect(mockSocketAdapter.emitMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          chatId: 1,
          senderId: 10,
          content: 'Hello, world!',
          type: 'text',
        }),
      );
    });

    it('should encrypt message content before storage (Requirement 7.8)', async () => {
      mockRepository.createMessage.mockResolvedValue(sampleMessage);

      await service.sendMessage({
        chatId: 1,
        senderId: 10,
        content: 'Secret message',
        type: 'text',
      });

      const createCall = mockRepository.createMessage.mock.calls[0]![0];
      expect(createCall.content_encrypted).not.toBe('Secret message');
      expect(createCall.content_encrypted).toContain(':'); // iv:authTag:ciphertext format
    });

    it('should send media messages with URL (Requirement 7.6)', async () => {
      const mediaMessage = { ...sampleMessage, type: 'image' as const, media_url: 'https://s3.example.com/image.jpg' };
      mockRepository.createMessage.mockResolvedValue(mediaMessage);

      const result = await service.sendMessage({
        chatId: 1,
        senderId: 10,
        content: 'Check this out',
        type: 'image',
        mediaUrl: 'https://s3.example.com/image.jpg',
      });

      expect(result.type).toBe('image');
      expect(mockRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'image',
          media_url: 'https://s3.example.com/image.jpg',
        }),
      );
    });

    it('should support all media types: image, video, audio, document (Requirement 7.6)', async () => {
      const mediaTypes = ['image', 'video', 'audio', 'document'] as const;

      for (const mediaType of mediaTypes) {
        mockRepository.createMessage.mockResolvedValue({
          ...sampleMessage,
          type: mediaType,
          media_url: `https://s3.example.com/file.${mediaType}`,
        });

        await service.sendMessage({
          chatId: 1,
          senderId: 10,
          content: '',
          type: mediaType,
          mediaUrl: `https://s3.example.com/file.${mediaType}`,
        });

        expect(mockRepository.createMessage).toHaveBeenCalledWith(
          expect.objectContaining({ type: mediaType }),
        );
      }
    });

    it('should reject text messages exceeding 5000 characters (Requirement 7.12)', async () => {
      const longContent = 'a'.repeat(5001);

      await expect(
        service.sendMessage({
          chatId: 1,
          senderId: 10,
          content: longContent,
          type: 'text',
        }),
      ).rejects.toThrow(ChatError);
      await expect(
        service.sendMessage({
          chatId: 1,
          senderId: 10,
          content: longContent,
          type: 'text',
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('should accept text messages at exactly 5000 characters', async () => {
      const maxContent = 'a'.repeat(5000);
      mockRepository.createMessage.mockResolvedValue(sampleMessage);

      await expect(
        service.sendMessage({
          chatId: 1,
          senderId: 10,
          content: maxContent,
          type: 'text',
        }),
      ).resolves.toBeDefined();
    });

    it('should reject empty text messages', async () => {
      await expect(
        service.sendMessage({
          chatId: 1,
          senderId: 10,
          content: '',
          type: 'text',
        }),
      ).rejects.toThrow(ChatError);
    });

    it('should reject whitespace-only text messages', async () => {
      await expect(
        service.sendMessage({
          chatId: 1,
          senderId: 10,
          content: '   ',
          type: 'text',
        }),
      ).rejects.toThrow(ChatError);
    });

    it('should reject media messages without a media URL', async () => {
      await expect(
        service.sendMessage({
          chatId: 1,
          senderId: 10,
          content: 'image',
          type: 'image',
        }),
      ).rejects.toThrow(ChatError);
    });

    it('should reject when chat does not exist', async () => {
      mockRepository.findChatById.mockResolvedValue(undefined);

      await expect(
        service.sendMessage({
          chatId: 999,
          senderId: 10,
          content: 'Hello',
          type: 'text',
        }),
      ).rejects.toThrow(ChatError);
      await expect(
        service.sendMessage({
          chatId: 999,
          senderId: 10,
          content: 'Hello',
          type: 'text',
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('should reject when sender is not a participant', async () => {
      mockRepository.isParticipant.mockResolvedValue(false);

      await expect(
        service.sendMessage({
          chatId: 1,
          senderId: 99,
          content: 'Hello',
          type: 'text',
        }),
      ).rejects.toThrow(ChatError);
      await expect(
        service.sendMessage({
          chatId: 1,
          senderId: 99,
          content: 'Hello',
          type: 'text',
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('should reject invalid message type', async () => {
      await expect(
        service.sendMessage({
          chatId: 1,
          senderId: 10,
          content: 'Hello',
          type: 'invalid' as any,
        }),
      ).rejects.toThrow(ChatError);
    });

    it('should reject when chatId is missing', async () => {
      await expect(
        service.sendMessage({
          chatId: 0,
          senderId: 10,
          content: 'Hello',
          type: 'text',
        }),
      ).rejects.toThrow(ChatError);
    });

    it('should reject when senderId is missing', async () => {
      await expect(
        service.sendMessage({
          chatId: 1,
          senderId: 0,
          content: 'Hello',
          type: 'text',
        }),
      ).rejects.toThrow(ChatError);
    });

    it('should deliver message to group chat via Socket.IO (Requirement 7.2)', async () => {
      mockRepository.findChatById.mockResolvedValue(sampleGroupChat);
      mockRepository.createMessage.mockResolvedValue({
        ...sampleMessage,
        chat_id: 2,
      });

      await service.sendMessage({
        chatId: 2,
        senderId: 10,
        content: 'Hello group!',
        type: 'text',
      });

      expect(mockSocketAdapter.emitMessage).toHaveBeenCalledWith(
        2,
        expect.objectContaining({
          chatId: 2,
          content: 'Hello group!',
        }),
      );
    });
  });

  // ─── markAsRead() ──────────────────────────────────────────────────────────

  describe('markAsRead()', () => {
    it('should create a read receipt and notify via Socket.IO (Requirement 7.4)', async () => {
      mockRepository.isParticipant.mockResolvedValue(true);
      mockRepository.findMessageById.mockResolvedValue({
        ...sampleMessage,
        sender_id: 20, // different from reader
      });
      mockRepository.createReadReceipt.mockResolvedValue({
        id: 1,
        message_id: 1,
        user_id: 10,
        read_at: new Date(),
      });

      await service.markAsRead(1, 1, 10);

      expect(mockRepository.createReadReceipt).toHaveBeenCalledWith(1, 10);
      expect(mockSocketAdapter.emitReadReceipt).toHaveBeenCalledWith(1, 1, 10);
    });

    it('should not create read receipt for own messages', async () => {
      mockRepository.isParticipant.mockResolvedValue(true);
      mockRepository.findMessageById.mockResolvedValue({
        ...sampleMessage,
        sender_id: 10, // same as reader
      });

      await service.markAsRead(1, 1, 10);

      expect(mockRepository.createReadReceipt).not.toHaveBeenCalled();
      expect(mockSocketAdapter.emitReadReceipt).not.toHaveBeenCalled();
    });

    it('should reject when user is not a participant', async () => {
      mockRepository.isParticipant.mockResolvedValue(false);

      await expect(service.markAsRead(1, 1, 99)).rejects.toThrow(ChatError);
      await expect(service.markAsRead(1, 1, 99)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('should reject when message does not exist', async () => {
      mockRepository.isParticipant.mockResolvedValue(true);
      mockRepository.findMessageById.mockResolvedValue(undefined);

      await expect(service.markAsRead(1, 999, 10)).rejects.toThrow(ChatError);
      await expect(service.markAsRead(1, 999, 10)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('should reject when message belongs to different chat', async () => {
      mockRepository.isParticipant.mockResolvedValue(true);
      mockRepository.findMessageById.mockResolvedValue({
        ...sampleMessage,
        chat_id: 99, // different chat
      });

      await expect(service.markAsRead(1, 1, 10)).rejects.toThrow(ChatError);
    });

    it('should reject when chatId is missing', async () => {
      await expect(service.markAsRead(0, 1, 10)).rejects.toThrow(ChatError);
    });

    it('should reject when messageId is missing', async () => {
      await expect(service.markAsRead(1, 0, 10)).rejects.toThrow(ChatError);
    });

    it('should reject when userId is missing', async () => {
      await expect(service.markAsRead(1, 1, 0)).rejects.toThrow(ChatError);
    });
  });

  // ─── getMessages() ─────────────────────────────────────────────────────────

  describe('getMessages()', () => {
    it('should return paginated messages with decrypted content', async () => {
      // Encrypt a message to test decryption
      const encrypted = service.encryptContent('Hello, world!');

      mockRepository.isParticipant.mockResolvedValue(true);
      mockRepository.getMessages.mockResolvedValue({
        data: [{ ...sampleMessage, content_encrypted: encrypted }],
        cursor: null,
        hasMore: false,
      });

      const result = await service.getMessages(1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.content_encrypted).toBe('Hello, world!');
      expect(result.hasMore).toBe(false);
    });

    it('should pass cursor and limit to repository', async () => {
      mockRepository.isParticipant.mockResolvedValue(true);
      mockRepository.getMessages.mockResolvedValue({
        data: [],
        cursor: null,
        hasMore: false,
      });

      await service.getMessages(1, 10, '50', 10);

      expect(mockRepository.getMessages).toHaveBeenCalledWith(1, '50', 10);
    });

    it('should reject when user is not a participant', async () => {
      mockRepository.isParticipant.mockResolvedValue(false);

      await expect(service.getMessages(1, 99)).rejects.toThrow(ChatError);
      await expect(service.getMessages(1, 99)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('should reject when chatId is missing', async () => {
      await expect(service.getMessages(0, 10)).rejects.toThrow(ChatError);
    });

    it('should reject when userId is missing', async () => {
      await expect(service.getMessages(1, 0)).rejects.toThrow(ChatError);
    });

    it('should handle messages with null content', async () => {
      mockRepository.isParticipant.mockResolvedValue(true);
      mockRepository.getMessages.mockResolvedValue({
        data: [{ ...sampleMessage, content_encrypted: null }],
        cursor: null,
        hasMore: false,
      });

      const result = await service.getMessages(1, 10);

      expect(result.data[0]!.content_encrypted).toBeNull();
    });
  });

  // ─── Typing Indicators ─────────────────────────────────────────────────────

  describe('startTyping()', () => {
    it('should set typing indicator in Redis and broadcast (Requirement 7.3)', async () => {
      await service.startTyping(1, 10);

      expect(setTyping).toHaveBeenCalledWith('1', '10');
      expect(mockSocketAdapter.emitTypingIndicator).toHaveBeenCalledWith(1, 10, true);
    });

    it('should not throw for invalid inputs', async () => {
      await expect(service.startTyping(0, 10)).resolves.toBeUndefined();
      await expect(service.startTyping(1, 0)).resolves.toBeUndefined();
      expect(setTyping).not.toHaveBeenCalled();
    });
  });

  describe('stopTyping()', () => {
    it('should clear typing indicator in Redis and broadcast (Requirement 7.3)', async () => {
      await service.stopTyping(1, 10);

      expect(clearTyping).toHaveBeenCalledWith('1', '10');
      expect(mockSocketAdapter.emitTypingIndicator).toHaveBeenCalledWith(1, 10, false);
    });

    it('should not throw for invalid inputs', async () => {
      await expect(service.stopTyping(0, 10)).resolves.toBeUndefined();
      await expect(service.stopTyping(1, 0)).resolves.toBeUndefined();
      expect(clearTyping).not.toHaveBeenCalled();
    });
  });

  // ─── Presence ───────────────────────────────────────────────────────────────

  describe('broadcastPresence()', () => {
    it('should broadcast online status (Requirement 7.5)', () => {
      service.broadcastPresence(10, 'online');

      expect(mockSocketAdapter.emitPresenceStatus).toHaveBeenCalledWith(10, 'online');
    });

    it('should broadcast offline status (Requirement 7.5)', () => {
      service.broadcastPresence(10, 'offline');

      expect(mockSocketAdapter.emitPresenceStatus).toHaveBeenCalledWith(10, 'offline');
    });

    it('should not broadcast for invalid userId', () => {
      service.broadcastPresence(0, 'online');

      expect(mockSocketAdapter.emitPresenceStatus).not.toHaveBeenCalled();
    });
  });

  // ─── Offline Delivery ───────────────────────────────────────────────────────

  describe('getUndeliveredMessages()', () => {
    it('should return undelivered messages for offline delivery (Requirement 7.10)', async () => {
      const undelivered = [
        { ...sampleMessage, id: 3 },
        { ...sampleMessage, id: 2 },
        { ...sampleMessage, id: 1 },
      ];
      mockRepository.getUndeliveredMessages.mockResolvedValue(undelivered);

      const result = await service.getUndeliveredMessages(10);

      expect(result).toHaveLength(3);
      expect(mockRepository.getUndeliveredMessages).toHaveBeenCalledWith(10);
    });

    it('should return empty array for invalid userId', async () => {
      const result = await service.getUndeliveredMessages(0);

      expect(result).toHaveLength(0);
      expect(mockRepository.getUndeliveredMessages).not.toHaveBeenCalled();
    });
  });

  // ─── Encryption ─────────────────────────────────────────────────────────────

  describe('encryption', () => {
    it('should encrypt and decrypt content correctly (Requirement 7.8)', () => {
      const plaintext = 'Hello, this is a secret message!';

      const encrypted = service.encryptContent(plaintext);
      const decrypted = service.decryptContent(encrypted);

      expect(encrypted).not.toBe(plaintext);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'Same message';

      const encrypted1 = service.encryptContent(plaintext);
      const encrypted2 = service.encryptContent(plaintext);

      expect(encrypted1).not.toBe(encrypted2);

      // Both should decrypt to the same value
      expect(service.decryptContent(encrypted1)).toBe(plaintext);
      expect(service.decryptContent(encrypted2)).toBe(plaintext);
    });

    it('should handle unicode content', () => {
      const plaintext = '¡Hola! 你好 🎉 مرحبا';

      const encrypted = service.encryptContent(plaintext);
      const decrypted = service.decryptContent(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty string encryption', () => {
      const plaintext = '';

      const encrypted = service.encryptContent(plaintext);
      const decrypted = service.decryptContent(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long messages', () => {
      const plaintext = 'a'.repeat(5000);

      const encrypted = service.encryptContent(plaintext);
      const decrypted = service.decryptContent(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should return placeholder for corrupted encrypted data', () => {
      const corrupted = 'invalid:data:here';

      const result = service.decryptContent(corrupted);

      expect(result).toBe('[encrypted message]');
    });

    it('should return data as-is if not in expected format', () => {
      const legacy = 'plain text without colons';

      const result = service.decryptContent(legacy);

      expect(result).toBe(legacy);
    });
  });
});
