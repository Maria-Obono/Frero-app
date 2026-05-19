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
import { TypedSocketServer } from './types';
import { CallService } from './call-service';
import { StreamService } from './stream-service';
/** Heartbeat ping interval in milliseconds (30 seconds) */
declare const PING_INTERVAL_MS = 30000;
/** Connection timeout in milliseconds (90 seconds) */
declare const PING_TIMEOUT_MS = 90000;
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
export declare function createSocketServer(httpServer: HttpServer, notificationService?: ReconnectionDeliveryService, callService?: CallService, streamService?: StreamService): TypedSocketServer;
export { PING_INTERVAL_MS, PING_TIMEOUT_MS };
//# sourceMappingURL=socket-server.d.ts.map