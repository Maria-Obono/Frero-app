/**
 * Room management for Socket.IO chat rooms and user-specific notification rooms.
 *
 * Handles joining/leaving chat rooms and user-specific rooms for notifications.
 * Each user automatically joins a personal room (user:{userId}) on connection
 * for receiving targeted notifications and presence updates.
 *
 * Requirements covered:
 * - 7.1, 7.2: Chat room management for private and group messaging
 * - 8.1: User-specific rooms for notification delivery
 */

import { AuthenticatedSocket } from './types';
import { logger } from '../utils/logger';

/**
 * Get the user-specific room name for notifications and presence.
 */
export function getUserRoom(userId: number): string {
  return `user:${userId}`;
}

/**
 * Get the chat room name for a given chat ID.
 */
export function getChatRoom(chatId: string): string {
  return `chat:${chatId}`;
}

/**
 * Join a user to their personal notification room.
 * Called automatically on connection.
 */
export function joinUserRoom(socket: AuthenticatedSocket): void {
  const room = getUserRoom(socket.user.userId);
  socket.join(room);
  logger.debug('Socket joined user room', {
    socketId: socket.id,
    userId: socket.user.userId,
    room,
  });
}

/**
 * Leave the user's personal notification room.
 * Called automatically on disconnection (Socket.IO handles this).
 */
export function leaveUserRoom(socket: AuthenticatedSocket): void {
  const room = getUserRoom(socket.user.userId);
  socket.leave(room);
  logger.debug('Socket left user room', {
    socketId: socket.id,
    userId: socket.user.userId,
    room,
  });
}

/**
 * Join a socket to a chat room.
 * Validates that the chatId is provided and non-empty.
 *
 * @returns true if joined successfully, false if validation failed
 */
export function joinChatRoom(socket: AuthenticatedSocket, chatId: string): boolean {
  if (!chatId || typeof chatId !== 'string' || chatId.trim().length === 0) {
    logger.warn('Socket attempted to join invalid chat room', {
      socketId: socket.id,
      userId: socket.user.userId,
      chatId,
    });
    return false;
  }

  const room = getChatRoom(chatId.trim());
  socket.join(room);
  logger.debug('Socket joined chat room', {
    socketId: socket.id,
    userId: socket.user.userId,
    room,
  });
  return true;
}

/**
 * Leave a chat room.
 * Validates that the chatId is provided and non-empty.
 *
 * @returns true if left successfully, false if validation failed
 */
export function leaveChatRoom(socket: AuthenticatedSocket, chatId: string): boolean {
  if (!chatId || typeof chatId !== 'string' || chatId.trim().length === 0) {
    logger.warn('Socket attempted to leave invalid chat room', {
      socketId: socket.id,
      userId: socket.user.userId,
      chatId,
    });
    return false;
  }

  const room = getChatRoom(chatId.trim());
  socket.leave(room);
  logger.debug('Socket left chat room', {
    socketId: socket.id,
    userId: socket.user.userId,
    room,
  });
  return true;
}

/**
 * Get all chat rooms a socket is currently in.
 * Filters out the socket's own room and user room.
 */
export function getSocketChatRooms(socket: AuthenticatedSocket): string[] {
  const userRoom = getUserRoom(socket.user.userId);
  const rooms: string[] = [];

  for (const room of socket.rooms) {
    // Skip the socket's own room (socket.id) and user room
    if (room !== socket.id && room !== userRoom && room.startsWith('chat:')) {
      rooms.push(room.replace('chat:', ''));
    }
  }

  return rooms;
}
