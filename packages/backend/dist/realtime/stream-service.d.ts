/**
 * Live Streaming Service.
 *
 * Handles live stream lifecycle management including:
 * - Stream creation and viewer management
 * - Adaptive bitrate distribution signaling
 * - Stream recording management (available within 5 minutes)
 * - Viewer join/leave with latency tracking
 *
 * Requirements covered:
 * - 17.2: Video stream ingest and adaptive bitrate distribution within 10 seconds
 * - 17.3: Stream delivery with latency under 5 seconds
 * - 17.5: Save recording, available as replay within 5 minutes
 */
/** Maximum time for stream to start distributing (10 seconds) */
export declare const STREAM_START_TIMEOUT_MS = 10000;
/** Maximum acceptable stream latency (5 seconds) */
export declare const MAX_STREAM_LATENCY_MS = 5000;
/** Time for recording to become available after stream ends (5 minutes) */
export declare const RECORDING_AVAILABILITY_MS: number;
/**
 * Adaptive bitrate quality levels.
 */
export type BitrateQuality = 'high' | 'medium' | 'low' | 'audio-only';
/**
 * Stream states in the lifecycle.
 */
export type StreamState = 'starting' | 'live' | 'ending' | 'ended';
/**
 * Bitrate configuration for adaptive streaming.
 */
export interface BitrateConfig {
    quality: BitrateQuality;
    videoBitrateKbps: number;
    audioBitrateKbps: number;
    resolution: {
        width: number;
        height: number;
    };
}
/** Default bitrate configurations for adaptive streaming */
export declare const BITRATE_CONFIGS: Record<BitrateQuality, BitrateConfig>;
/**
 * Viewer record for a live stream.
 */
export interface StreamViewer {
    userId: number;
    joinedAt: number;
    quality: BitrateQuality;
}
/**
 * Stream recording metadata.
 */
export interface StreamRecording {
    streamId: string;
    streamerId: number;
    startedAt: number;
    endedAt: number;
    durationMs: number;
    availableAt: number;
    url?: string;
}
/**
 * Active stream record.
 */
export interface ActiveStream {
    id: string;
    streamerId: number;
    title: string;
    state: StreamState;
    viewers: Map<number, StreamViewer>;
    viewerCount: number;
    startedAt: number;
    endedAt?: number;
    recording?: StreamRecording;
}
/**
 * Socket emitter interface for dependency injection.
 */
export interface StreamSocketEmitter {
    to(room: string): {
        emit(event: string, data: unknown): void;
    };
}
/**
 * Timer interface for dependency injection.
 */
export interface StreamTimerProvider {
    setTimeout(callback: () => void, ms: number): NodeJS.Timeout;
    clearTimeout(id: NodeJS.Timeout): void;
}
/** Default timer provider */
export declare const defaultStreamTimerProvider: StreamTimerProvider;
/**
 * StreamService manages live streaming sessions.
 *
 * In production, actual media processing would use a media server (e.g., Janus, mediasoup).
 * This service handles the signaling and room management layer.
 */
export declare class StreamService {
    /** Map of active streams by stream ID */
    private activeStreams;
    /** Map of streamer user ID to their active stream ID */
    private streamerMap;
    /** Map of stream recordings by stream ID */
    private recordings;
    /** Map of stream ID to start timeout */
    private startTimeouts;
    /** Socket emitter for sending events */
    private emitter;
    /** Timer provider */
    private timers;
    constructor(emitter: StreamSocketEmitter, timers?: StreamTimerProvider);
    /**
     * Start a new live stream.
     *
     * Requirement 17.2: Begin distributing within 10 seconds of initiation.
     *
     * @returns The stream ID if successful, null if the user is already streaming
     */
    startStream(streamerId: number, title: string): string | null;
    /**
     * Mark a stream as live (called when media ingest begins).
     */
    setStreamLive(streamId: string): boolean;
    /**
     * Add a viewer to a live stream.
     *
     * Requirement 17.3: Deliver stream with latency under 5 seconds.
     *
     * @returns The bitrate config for the viewer, or null if stream doesn't exist
     */
    joinStream(streamId: string, viewerId: number): BitrateConfig | null;
    /**
     * Remove a viewer from a live stream.
     */
    leaveStream(streamId: string, viewerId: number): boolean;
    /**
     * Update a viewer's bitrate quality based on network conditions.
     *
     * Adaptive bitrate: viewers can request different quality levels
     * based on their network conditions.
     */
    updateViewerQuality(streamId: string, viewerId: number, quality: BitrateQuality): BitrateConfig | null;
    /**
     * End a live stream.
     *
     * Requirement 17.5: Save recording, available within 5 minutes.
     */
    endStream(streamId: string, streamerId: number): StreamRecording | null;
    /**
     * Get a stream recording.
     */
    getRecording(streamId: string): StreamRecording | undefined;
    /**
     * Check if a recording is available for replay.
     */
    isRecordingAvailable(streamId: string): boolean;
    /**
     * Get an active stream by ID.
     */
    getStream(streamId: string): ActiveStream | undefined;
    /**
     * Get the active stream for a streamer.
     */
    getStreamerStream(streamerId: number): ActiveStream | undefined;
    /**
     * Get the number of active streams (for monitoring).
     */
    getActiveStreamCount(): number;
    /**
     * Handle start timeout - stream didn't go live within 10 seconds.
     */
    private handleStartTimeout;
    /**
     * Clean up all resources (for graceful shutdown).
     */
    cleanup(): void;
}
//# sourceMappingURL=stream-service.d.ts.map