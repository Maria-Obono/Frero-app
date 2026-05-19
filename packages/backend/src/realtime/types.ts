/**
 * Type definitions for the real-time Socket.IO server.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';

/**
 * Decoded user payload attached to authenticated sockets.
 */
export interface SocketUser {
  userId: number;
  email: string;
  username: string;
  role: string;
  tokenId: string;
}

/**
 * Authenticated socket with user data.
 */
export interface AuthenticatedSocket extends Socket {
  user: SocketUser;
}

/**
 * Client-to-server events.
 */
export interface ClientToServerEvents {
  'message:send': (data: { chatId: string; content: string; type: string }) => void;
  'message:read': (data: { chatId: string; messageId: string }) => void;
  'typing:start': (data: { chatId: string }) => void;
  'typing:stop': (data: { chatId: string }) => void;
  'chat:join': (data: { chatId: string }) => void;
  'chat:leave': (data: { chatId: string }) => void;
  'call:initiate': (data: { recipientId: number; type: 'voice' | 'video' }) => void;
  'call:signal': (data: { callId: string; signal: unknown }) => void;
  'call:ice-failed': (data: { callId: string }) => void;
  'call:audio-only': (data: { callId: string }) => void;
  'call:end': (data: { callId: string; reason?: string }) => void;
  'stream:start': (data: { title: string }) => void;
  'stream:live': (data: { streamId: string }) => void;
  'stream:join': (data: { streamId: string }) => void;
  'stream:leave': (data: { streamId: string }) => void;
  'stream:quality': (data: { streamId: string; quality: string }) => void;
  'stream:end': (data: { streamId: string }) => void;
}

/**
 * Server-to-client events.
 */
export interface ServerToClientEvents {
  'message:new': (data: { chatId: string; messageId: string; senderId: number; content: string; type: string; createdAt: string }) => void;
  'message:read': (data: { chatId: string; messageId: string; readBy: number }) => void;
  'typing:indicator': (data: { chatId: string; userId: number; isTyping: boolean }) => void;
  'user:status': (data: { userId: number; status: 'online' | 'offline' }) => void;
  'notification:new': (data: unknown) => void;
  'feed:new-post': (data: { postId: string; authorId: string }) => void;
  'engagement:update': (data: { postId: string; type: 'like' | 'unlike' | 'comment' | 'share'; counts: { likes: number; comments: number; shares: number } }) => void;
  'call:incoming': (data: { callId: string; callerId: string; type: 'voice' | 'video' }) => void;
  'call:initiated': (data: { callId: string }) => void;
  'call:signal': (data: { callId: string; signal: unknown }) => void;
  'call:ended': (data: { callId: string; reason: string }) => void;
  'stream:started': (data: { streamId: string }) => void;
  'stream:viewer-joined': (data: { streamId: string; viewerId: number; viewerCount: number }) => void;
  'stream:viewer-left': (data: { streamId: string; viewerId: number; viewerCount: number }) => void;
  'stream:quality-config': (data: { streamId: string; config: unknown }) => void;
  'stream:ended': (data: { streamId: string; recording: unknown }) => void;
  'stream:error': (data: { streamId: string; error: string }) => void;
  'error': (data: { message: string; code?: string }) => void;
}

/**
 * Inter-server events (for Redis adapter pub/sub).
 */
export interface InterServerEvents {
  ping: () => void;
}

/**
 * Socket data stored per connection.
 */
export interface SocketData {
  user: SocketUser;
  connectedAt: number;
  lastHeartbeat: number;
}

/**
 * Typed Socket.IO server.
 */
export type TypedSocketServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
