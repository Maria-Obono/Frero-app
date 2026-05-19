/**
 * Real-time module entry point.
 *
 * Exports the Socket.IO server setup, authentication, room management,
 * call signaling, and live streaming services.
 */
export { createSocketServer, PING_INTERVAL_MS, PING_TIMEOUT_MS } from './socket-server';
export type { ReconnectionDeliveryService } from './socket-server';
export { socketAuthMiddleware, extractToken, verifySocketToken } from './socket-auth';
export { joinUserRoom, leaveUserRoom, joinChatRoom, leaveChatRoom, getUserRoom, getChatRoom, getSocketChatRooms } from './room-manager';
export { CallService, MAX_ICE_RENEGOTIATION_ATTEMPTS, ICE_RENEGOTIATION_DELAY_MS, CALL_ESTABLISHMENT_TIMEOUT_MS, CALL_TERMINATION_TIMEOUT_MS, MIN_VIDEO_BITRATE_KBPS, defaultTimerProvider } from './call-service';
export type { CallType, CallState, CallEndReason, SignalType, RTCSignalData, ActiveCall, SocketEmitter, TimerProvider } from './call-service';
export { StreamService, STREAM_START_TIMEOUT_MS, MAX_STREAM_LATENCY_MS, RECORDING_AVAILABILITY_MS, BITRATE_CONFIGS, defaultStreamTimerProvider } from './stream-service';
export type { BitrateQuality, StreamState, BitrateConfig, StreamViewer, StreamRecording, ActiveStream, StreamSocketEmitter, StreamTimerProvider } from './stream-service';
export type { AuthenticatedSocket, SocketUser, TypedSocketServer, ClientToServerEvents, ServerToClientEvents } from './types';
//# sourceMappingURL=index.d.ts.map