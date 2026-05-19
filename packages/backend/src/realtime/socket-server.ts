/**
 * Socket.IO server setup with Redis adapter for horizontal scaling.
 *
 * Provides real-time communication for chat, notifications, presence,
 * live feed updates, voice/video calls, and live streaming.
 * Uses Redis adapter for multi-instance pub/sub so that events are
 * broadcast across all server instances.
 *
 * Requirements covered:
 * - 15.4: Reconnection with exponential backoff (client-side)
 * - 15.5: Heartbeat pings every 30s, stale after 90s
 * - 18.4: Socket.IO with Redis adapter for multi-instance support
 * - 7.5: Online/offline presence tracking
 * - 8.2: Deliver queued notifications on reconnection
 * - 17.1: WebRTC signaling for voice/video calls
 * - 17.2: Live stream ingest and distribution
 * - 17.3: Stream viewer join/leave
 * - 17.4: ICE candidate renegotiation
 * - 17.5: Stream recording management
 * - 17.6: Call termination
 * - 17.7: Audio-only fallback
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

import { config } from '../config';
import { logger } from '../utils/logger';
import { setOnline, setOffline } from '../utils/redis-utils';
import { socketAuthMiddleware } from './socket-auth';
import { joinUserRoom, joinChatRoom, leaveChatRoom } from './room-manager';
import { AuthenticatedSocket, TypedSocketServer } from './types';
import { CallService, CallEndReason, RTCSignalData } from './call-service';
import { StreamService, BitrateQuality } from './stream-service';

/** Heartbeat ping interval in milliseconds (30 seconds) */
const PING_INTERVAL_MS = 30_000;

/** Connection timeout in milliseconds (90 seconds) */
const PING_TIMEOUT_MS = 90_000;

/**
 * Notification service interface for reconnection delivery.
 * Uses dependency injection to avoid circular imports.
 */
export interface ReconnectionDeliveryService {
  deliverOnReconnection(userId: number): Promise<unknown[]>;
}

/**
 * Create and configure the Socket.IO server with Redis adapter.
 *
 * @param httpServer - The HTTP server to attach Socket.IO to
 * @param notificationService - Optional notification service for reconnection delivery
 * @param callService - Optional call service for WebRTC signaling
 * @param streamService - Optional stream service for live streaming
 * @returns The configured Socket.IO server instance
 */
export function createSocketServer(
  httpServer: HttpServer,
  notificationService?: ReconnectionDeliveryService,
  callService?: CallService,
  streamService?: StreamService,
): TypedSocketServer {
  const io: TypedSocketServer = new SocketIOServer(httpServer, {
    // Heartbeat configuration (Requirement 15.5)
    pingInterval: PING_INTERVAL_MS,
    pingTimeout: PING_TIMEOUT_MS,

    // CORS configuration matching Express CORS settings
    cors: {
      origin: config.cors.origins,
      credentials: true,
      methods: ['GET', 'POST'],
    },

    // Connection settings
    transports: ['websocket', 'polling'],
    allowUpgrades: true,

    // Adapter will be set below
  });

  // Set up Redis adapter for multi-instance support (Requirement 18.4)
  setupRedisAdapter(io);

  // JWT authentication middleware
  io.use(socketAuthMiddleware);

  // Connection handler
  io.on('connection', (socket) => {
    handleConnection(socket as AuthenticatedSocket, notificationService, callService, streamService);
  });

  logger.info('Socket.IO server initialized', {
    pingInterval: PING_INTERVAL_MS,
    pingTimeout: PING_TIMEOUT_MS,
    transports: ['websocket', 'polling'],
  });

  return io;
}

/**
 * Set up the Redis adapter for Socket.IO pub/sub across instances.
 */
function setupRedisAdapter(io: TypedSocketServer): void {
  try {
    const pubClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      db: config.redis.db,
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        return Math.min(times * 200, 5000);
      },
    });

    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => {
      logger.error('Socket.IO Redis adapter pub client error', { error: err.message });
    });

    subClient.on('error', (err) => {
      logger.error('Socket.IO Redis adapter sub client error', { error: err.message });
    });

    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.IO Redis adapter configured');
  } catch (err) {
    logger.error('Failed to set up Socket.IO Redis adapter', {
      error: err instanceof Error ? err.message : String(err),
    });
    // Server will still work in single-instance mode without the adapter
  }
}

/**
 * Handle a new authenticated socket connection.
 */
function handleConnection(
  socket: AuthenticatedSocket,
  notificationService?: ReconnectionDeliveryService,
  callService?: CallService,
  streamService?: StreamService,
): void {
  const { userId, username } = socket.user;

  logger.info('Socket connected', {
    socketId: socket.id,
    userId,
    username,
  });

  // Record connection timestamp
  socket.data.connectedAt = Date.now();
  socket.data.lastHeartbeat = Date.now();

  // Join user-specific room for notifications
  joinUserRoom(socket);

  // Set user as online in Redis (Requirement 7.5)
  setOnline(String(userId)).catch((err) => {
    logger.error('Failed to set user online', { userId, error: err.message });
  });

  // Broadcast online status to contacts
  socket.broadcast.emit('user:status', { userId, status: 'online' });

  // Deliver queued notifications on reconnection (Requirement 8.2)
  if (notificationService) {
    deliverQueuedNotifications(socket, notificationService);
  }

  // Register event handlers
  registerChatRoomHandlers(socket);

  // Register call event handlers if call service is provided
  if (callService) {
    registerCallHandlers(socket, callService);
  }

  // Register stream event handlers if stream service is provided
  if (streamService) {
    registerStreamHandlers(socket, streamService);
  }

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    handleDisconnection(socket, reason);
  });
}

/**
 * Deliver queued notifications to a user on reconnection.
 */
async function deliverQueuedNotifications(
  socket: AuthenticatedSocket,
  notificationService: ReconnectionDeliveryService,
): Promise<void> {
  try {
    const notifications = await notificationService.deliverOnReconnection(socket.user.userId);
    if (notifications.length > 0) {
      logger.debug('Delivered queued notifications on reconnection', {
        userId: socket.user.userId,
        count: notifications.length,
      });
    }
  } catch (err) {
    logger.error('Failed to deliver queued notifications', {
      userId: socket.user.userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Register chat room join/leave event handlers.
 */
function registerChatRoomHandlers(socket: AuthenticatedSocket): void {
  socket.on('chat:join', (data) => {
    if (!data || !data.chatId) {
      socket.emit('error', { message: 'chatId is required', code: 'INVALID_PAYLOAD' });
      return;
    }
    const success = joinChatRoom(socket, data.chatId);
    if (!success) {
      socket.emit('error', { message: 'Invalid chat room ID', code: 'INVALID_CHAT_ID' });
    }
  });

  socket.on('chat:leave', (data) => {
    if (!data || !data.chatId) {
      socket.emit('error', { message: 'chatId is required', code: 'INVALID_PAYLOAD' });
      return;
    }
    const success = leaveChatRoom(socket, data.chatId);
    if (!success) {
      socket.emit('error', { message: 'Invalid chat room ID', code: 'INVALID_CHAT_ID' });
    }
  });
}

/**
 * Handle socket disconnection.
 * Sets user offline and broadcasts status change.
 */
function handleDisconnection(socket: AuthenticatedSocket, reason: string): void {
  const { userId, username } = socket.user;

  logger.info('Socket disconnected', {
    socketId: socket.id,
    userId,
    username,
    reason,
  });

  // Set user as offline in Redis
  setOffline(String(userId)).catch((err) => {
    logger.error('Failed to set user offline', { userId, error: err.message });
  });

  // Broadcast offline status to contacts
  socket.broadcast.emit('user:status', { userId, status: 'offline' });
}

/**
 * Register WebRTC call signaling event handlers.
 *
 * Requirements 17.1, 17.4, 17.6, 17.7
 */
function registerCallHandlers(socket: AuthenticatedSocket, callService: CallService): void {
  const userId = socket.user.userId;

  // Initiate a voice or video call (Requirement 17.1)
  socket.on('call:initiate', (data) => {
    if (!data || !data.recipientId || !data.type) {
      socket.emit('error', { message: 'recipientId and type are required', code: 'INVALID_PAYLOAD' });
      return;
    }

    const callId = callService.initiateCall(userId, data.recipientId, data.type);
    if (!callId) {
      socket.emit('error', { message: 'Unable to initiate call', code: 'CALL_FAILED' });
      return;
    }

    // Confirm call initiation to caller
    socket.emit('call:initiated', { callId });

    logger.debug('Call initiated via socket', { callId, callerId: userId, recipientId: data.recipientId });
  });

  // Relay WebRTC signal (SDP offer/answer, ICE candidate) (Requirement 17.1)
  socket.on('call:signal', (data) => {
    if (!data || !data.callId || !data.signal) {
      socket.emit('error', { message: 'callId and signal are required', code: 'INVALID_PAYLOAD' });
      return;
    }

    const relayed = callService.handleSignal(data.callId, userId, data.signal as RTCSignalData);
    if (!relayed) {
      socket.emit('error', { message: 'Unable to relay signal', code: 'SIGNAL_FAILED' });
    }
  });

  // Report ICE connection failure and trigger renegotiation (Requirement 17.4)
  socket.on('call:ice-failed', (data) => {
    if (!data || !data.callId) {
      socket.emit('error', { message: 'callId is required', code: 'INVALID_PAYLOAD' });
      return;
    }

    const renegotiating = callService.handleIceFailure(data.callId, userId);
    if (!renegotiating) {
      logger.debug('ICE renegotiation exhausted or call not found', { callId: data.callId, userId });
    }
  });

  // Request audio-only fallback (Requirement 17.7)
  socket.on('call:audio-only', (data) => {
    if (!data || !data.callId) {
      socket.emit('error', { message: 'callId is required', code: 'INVALID_PAYLOAD' });
      return;
    }

    const switched = callService.switchToAudioOnly(data.callId, userId);
    if (!switched) {
      logger.debug('Audio-only switch failed or already audio-only', { callId: data.callId, userId });
    }
  });

  // End a call (Requirement 17.6)
  socket.on('call:end', (data) => {
    if (!data || !data.callId) {
      socket.emit('error', { message: 'callId is required', code: 'INVALID_PAYLOAD' });
      return;
    }

    const reason = (data.reason as CallEndReason) || 'completed';
    callService.endCall(data.callId, userId, reason);
  });
}

/**
 * Register live streaming event handlers.
 *
 * Requirements 17.2, 17.3, 17.5
 */
function registerStreamHandlers(socket: AuthenticatedSocket, streamService: StreamService): void {
  const userId = socket.user.userId;

  // Start a new live stream (Requirement 17.2)
  socket.on('stream:start', (data) => {
    if (!data || !data.title) {
      socket.emit('error', { message: 'title is required', code: 'INVALID_PAYLOAD' });
      return;
    }

    const streamId = streamService.startStream(userId, data.title);
    if (!streamId) {
      socket.emit('error', { message: 'Unable to start stream', code: 'STREAM_FAILED' });
      return;
    }

    socket.emit('stream:started', { streamId });
    logger.debug('Stream started via socket', { streamId, streamerId: userId });
  });

  // Mark stream as live (media ingest has begun)
  socket.on('stream:live', (data) => {
    if (!data || !data.streamId) {
      socket.emit('error', { message: 'streamId is required', code: 'INVALID_PAYLOAD' });
      return;
    }

    streamService.setStreamLive(data.streamId);
  });

  // Join a live stream as a viewer (Requirement 17.3)
  socket.on('stream:join', (data) => {
    if (!data || !data.streamId) {
      socket.emit('error', { message: 'streamId is required', code: 'INVALID_PAYLOAD' });
      return;
    }

    const bitrateConfig = streamService.joinStream(data.streamId, userId);
    if (!bitrateConfig) {
      socket.emit('error', { message: 'Stream not found or not live', code: 'STREAM_NOT_FOUND' });
      return;
    }

    socket.emit('stream:quality-config', { streamId: data.streamId, config: bitrateConfig });
    logger.debug('Viewer joined stream via socket', { streamId: data.streamId, viewerId: userId });
  });

  // Leave a live stream
  socket.on('stream:leave', (data) => {
    if (!data || !data.streamId) {
      socket.emit('error', { message: 'streamId is required', code: 'INVALID_PAYLOAD' });
      return;
    }

    streamService.leaveStream(data.streamId, userId);
  });

  // Update viewer quality (adaptive bitrate)
  socket.on('stream:quality', (data) => {
    if (!data || !data.streamId || !data.quality) {
      socket.emit('error', { message: 'streamId and quality are required', code: 'INVALID_PAYLOAD' });
      return;
    }

    const config = streamService.updateViewerQuality(data.streamId, userId, data.quality as BitrateQuality);
    if (config) {
      socket.emit('stream:quality-config', { streamId: data.streamId, config });
    }
  });

  // End a live stream (Requirement 17.5)
  socket.on('stream:end', (data) => {
    if (!data || !data.streamId) {
      socket.emit('error', { message: 'streamId is required', code: 'INVALID_PAYLOAD' });
      return;
    }

    const recording = streamService.endStream(data.streamId, userId);
    if (!recording) {
      socket.emit('error', { message: 'Stream not found or not owned by user', code: 'STREAM_NOT_FOUND' });
    }
  });
}

export { PING_INTERVAL_MS, PING_TIMEOUT_MS };
