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
/**
 * Get the user-specific room name for notifications and presence.
 */
export declare function getUserRoom(userId: number): string;
/**
 * Get the chat room name for a given chat ID.
 */
export declare function getChatRoom(chatId: string): string;
/**
 * Join a user to their personal notification room.
 * Called automatically on connection.
 */
export declare function joinUserRoom(socket: AuthenticatedSocket): void;
/**
 * Leave the user's personal notification room.
 * Called automatically on disconnection (Socket.IO handles this).
 */
export declare function leaveUserRoom(socket: AuthenticatedSocket): void;
/**
 * Join a socket to a chat room.
 * Validates that the chatId is provided and non-empty.
 *
 * @returns true if joined successfully, false if validation failed
 */
export declare function joinChatRoom(socket: AuthenticatedSocket, chatId: string): boolean;
/**
 * Leave a chat room.
 * Validates that the chatId is provided and non-empty.
 *
 * @returns true if left successfully, false if validation failed
 */
export declare function leaveChatRoom(socket: AuthenticatedSocket, chatId: string): boolean;
/**
 * Get all chat rooms a socket is currently in.
 * Filters out the socket's own room and user room.
 */
export declare function getSocketChatRooms(socket: AuthenticatedSocket): string[];
//# sourceMappingURL=room-manager.d.ts.map