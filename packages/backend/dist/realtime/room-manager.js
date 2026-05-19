"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserRoom = getUserRoom;
exports.getChatRoom = getChatRoom;
exports.joinUserRoom = joinUserRoom;
exports.leaveUserRoom = leaveUserRoom;
exports.joinChatRoom = joinChatRoom;
exports.leaveChatRoom = leaveChatRoom;
exports.getSocketChatRooms = getSocketChatRooms;
const logger_1 = require("../utils/logger");
/**
 * Get the user-specific room name for notifications and presence.
 */
function getUserRoom(userId) {
    return `user:${userId}`;
}
/**
 * Get the chat room name for a given chat ID.
 */
function getChatRoom(chatId) {
    return `chat:${chatId}`;
}
/**
 * Join a user to their personal notification room.
 * Called automatically on connection.
 */
function joinUserRoom(socket) {
    const room = getUserRoom(socket.user.userId);
    socket.join(room);
    logger_1.logger.debug('Socket joined user room', {
        socketId: socket.id,
        userId: socket.user.userId,
        room,
    });
}
/**
 * Leave the user's personal notification room.
 * Called automatically on disconnection (Socket.IO handles this).
 */
function leaveUserRoom(socket) {
    const room = getUserRoom(socket.user.userId);
    socket.leave(room);
    logger_1.logger.debug('Socket left user room', {
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
function joinChatRoom(socket, chatId) {
    if (!chatId || typeof chatId !== 'string' || chatId.trim().length === 0) {
        logger_1.logger.warn('Socket attempted to join invalid chat room', {
            socketId: socket.id,
            userId: socket.user.userId,
            chatId,
        });
        return false;
    }
    const room = getChatRoom(chatId.trim());
    socket.join(room);
    logger_1.logger.debug('Socket joined chat room', {
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
function leaveChatRoom(socket, chatId) {
    if (!chatId || typeof chatId !== 'string' || chatId.trim().length === 0) {
        logger_1.logger.warn('Socket attempted to leave invalid chat room', {
            socketId: socket.id,
            userId: socket.user.userId,
            chatId,
        });
        return false;
    }
    const room = getChatRoom(chatId.trim());
    socket.leave(room);
    logger_1.logger.debug('Socket left chat room', {
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
function getSocketChatRooms(socket) {
    const userRoom = getUserRoom(socket.user.userId);
    const rooms = [];
    for (const room of socket.rooms) {
        // Skip the socket's own room (socket.id) and user room
        if (room !== socket.id && room !== userRoom && room.startsWith('chat:')) {
            rooms.push(room.replace('chat:', ''));
        }
    }
    return rooms;
}
//# sourceMappingURL=room-manager.js.map