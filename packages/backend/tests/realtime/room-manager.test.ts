/**
 * Unit tests for Socket.IO room management.
 *
 * Tests joining/leaving chat rooms and user-specific notification rooms.
 */

import {
  getUserRoom,
  getChatRoom,
  joinUserRoom,
  leaveUserRoom,
  joinChatRoom,
  leaveChatRoom,
  getSocketChatRooms,
} from '../../src/realtime/room-manager';
import { AuthenticatedSocket } from '../../src/realtime/types';

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Room Manager', () => {
  function createMockSocket(userId: number = 1): AuthenticatedSocket {
    const rooms = new Set<string>();
    const socket = {
      id: `socket-${userId}-${Date.now()}`,
      user: {
        userId,
        email: `user${userId}@example.com`,
        username: `user${userId}`,
        role: 'user',
        tokenId: `token-${userId}`,
      },
      rooms,
      join: jest.fn((room: string) => {
        rooms.add(room);
      }),
      leave: jest.fn((room: string) => {
        rooms.delete(room);
      }),
      data: {},
    } as unknown as AuthenticatedSocket;

    // Socket.IO automatically adds the socket's own ID to rooms
    rooms.add(socket.id);

    return socket;
  }

  describe('getUserRoom', () => {
    it('should return user room with correct format', () => {
      expect(getUserRoom(1)).toBe('user:1');
      expect(getUserRoom(42)).toBe('user:42');
      expect(getUserRoom(999)).toBe('user:999');
    });
  });

  describe('getChatRoom', () => {
    it('should return chat room with correct format', () => {
      expect(getChatRoom('abc-123')).toBe('chat:abc-123');
      expect(getChatRoom('room1')).toBe('chat:room1');
    });
  });

  describe('joinUserRoom', () => {
    it('should join the user to their personal room', () => {
      const socket = createMockSocket(42);

      joinUserRoom(socket);

      expect(socket.join).toHaveBeenCalledWith('user:42');
    });

    it('should use the userId from socket.user', () => {
      const socket = createMockSocket(7);

      joinUserRoom(socket);

      expect(socket.join).toHaveBeenCalledWith('user:7');
    });
  });

  describe('leaveUserRoom', () => {
    it('should leave the user personal room', () => {
      const socket = createMockSocket(42);

      leaveUserRoom(socket);

      expect(socket.leave).toHaveBeenCalledWith('user:42');
    });
  });

  describe('joinChatRoom', () => {
    it('should join a valid chat room and return true', () => {
      const socket = createMockSocket();

      const result = joinChatRoom(socket, 'chat-123');

      expect(result).toBe(true);
      expect(socket.join).toHaveBeenCalledWith('chat:chat-123');
    });

    it('should trim whitespace from chatId', () => {
      const socket = createMockSocket();

      const result = joinChatRoom(socket, '  room-1  ');

      expect(result).toBe(true);
      expect(socket.join).toHaveBeenCalledWith('chat:room-1');
    });

    it('should return false for empty string chatId', () => {
      const socket = createMockSocket();

      const result = joinChatRoom(socket, '');

      expect(result).toBe(false);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('should return false for whitespace-only chatId', () => {
      const socket = createMockSocket();

      const result = joinChatRoom(socket, '   ');

      expect(result).toBe(false);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('should return false for null chatId', () => {
      const socket = createMockSocket();

      const result = joinChatRoom(socket, null as any);

      expect(result).toBe(false);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('should return false for undefined chatId', () => {
      const socket = createMockSocket();

      const result = joinChatRoom(socket, undefined as any);

      expect(result).toBe(false);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('should return false for non-string chatId', () => {
      const socket = createMockSocket();

      const result = joinChatRoom(socket, 123 as any);

      expect(result).toBe(false);
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('leaveChatRoom', () => {
    it('should leave a valid chat room and return true', () => {
      const socket = createMockSocket();

      const result = leaveChatRoom(socket, 'chat-123');

      expect(result).toBe(true);
      expect(socket.leave).toHaveBeenCalledWith('chat:chat-123');
    });

    it('should trim whitespace from chatId', () => {
      const socket = createMockSocket();

      const result = leaveChatRoom(socket, '  room-1  ');

      expect(result).toBe(true);
      expect(socket.leave).toHaveBeenCalledWith('chat:room-1');
    });

    it('should return false for empty string chatId', () => {
      const socket = createMockSocket();

      const result = leaveChatRoom(socket, '');

      expect(result).toBe(false);
      expect(socket.leave).not.toHaveBeenCalled();
    });

    it('should return false for null chatId', () => {
      const socket = createMockSocket();

      const result = leaveChatRoom(socket, null as any);

      expect(result).toBe(false);
      expect(socket.leave).not.toHaveBeenCalled();
    });

    it('should return false for undefined chatId', () => {
      const socket = createMockSocket();

      const result = leaveChatRoom(socket, undefined as any);

      expect(result).toBe(false);
      expect(socket.leave).not.toHaveBeenCalled();
    });
  });

  describe('getSocketChatRooms', () => {
    it('should return empty array when socket is only in its own room', () => {
      const socket = createMockSocket(1);

      const rooms = getSocketChatRooms(socket);

      expect(rooms).toEqual([]);
    });

    it('should return chat room IDs without the "chat:" prefix', () => {
      const socket = createMockSocket(1);
      // Simulate joining chat rooms
      socket.rooms.add('chat:room-1');
      socket.rooms.add('chat:room-2');

      const rooms = getSocketChatRooms(socket);

      expect(rooms).toContain('room-1');
      expect(rooms).toContain('room-2');
      expect(rooms).toHaveLength(2);
    });

    it('should exclude the user room from results', () => {
      const socket = createMockSocket(42);
      socket.rooms.add('user:42');
      socket.rooms.add('chat:room-1');

      const rooms = getSocketChatRooms(socket);

      expect(rooms).toEqual(['room-1']);
    });

    it('should exclude the socket ID room from results', () => {
      const socket = createMockSocket(1);
      socket.rooms.add('chat:room-1');

      const rooms = getSocketChatRooms(socket);

      // socket.id is already in rooms from createMockSocket
      expect(rooms).not.toContain(socket.id);
      expect(rooms).toEqual(['room-1']);
    });

    it('should not include non-chat rooms', () => {
      const socket = createMockSocket(1);
      socket.rooms.add('chat:room-1');
      socket.rooms.add('some-other-room');

      const rooms = getSocketChatRooms(socket);

      expect(rooms).toEqual(['room-1']);
    });
  });
});
