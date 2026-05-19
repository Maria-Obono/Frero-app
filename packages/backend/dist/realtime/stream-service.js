"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamService = exports.defaultStreamTimerProvider = exports.BITRATE_CONFIGS = exports.RECORDING_AVAILABILITY_MS = exports.MAX_STREAM_LATENCY_MS = exports.STREAM_START_TIMEOUT_MS = void 0;
const uuid_1 = require("uuid");
const logger_1 = require("../utils/logger");
/** Maximum time for stream to start distributing (10 seconds) */
exports.STREAM_START_TIMEOUT_MS = 10_000;
/** Maximum acceptable stream latency (5 seconds) */
exports.MAX_STREAM_LATENCY_MS = 5000;
/** Time for recording to become available after stream ends (5 minutes) */
exports.RECORDING_AVAILABILITY_MS = 5 * 60 * 1000;
/** Default bitrate configurations for adaptive streaming */
exports.BITRATE_CONFIGS = {
    high: {
        quality: 'high',
        videoBitrateKbps: 4000,
        audioBitrateKbps: 128,
        resolution: { width: 1920, height: 1080 },
    },
    medium: {
        quality: 'medium',
        videoBitrateKbps: 2000,
        audioBitrateKbps: 128,
        resolution: { width: 1280, height: 720 },
    },
    low: {
        quality: 'low',
        videoBitrateKbps: 800,
        audioBitrateKbps: 96,
        resolution: { width: 854, height: 480 },
    },
    'audio-only': {
        quality: 'audio-only',
        videoBitrateKbps: 0,
        audioBitrateKbps: 64,
        resolution: { width: 0, height: 0 },
    },
};
/** Default timer provider */
exports.defaultStreamTimerProvider = {
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    clearTimeout: (id) => clearTimeout(id),
};
/**
 * StreamService manages live streaming sessions.
 *
 * In production, actual media processing would use a media server (e.g., Janus, mediasoup).
 * This service handles the signaling and room management layer.
 */
class StreamService {
    /** Map of active streams by stream ID */
    activeStreams = new Map();
    /** Map of streamer user ID to their active stream ID */
    streamerMap = new Map();
    /** Map of stream recordings by stream ID */
    recordings = new Map();
    /** Map of stream ID to start timeout */
    startTimeouts = new Map();
    /** Socket emitter for sending events */
    emitter;
    /** Timer provider */
    timers;
    constructor(emitter, timers = exports.defaultStreamTimerProvider) {
        this.emitter = emitter;
        this.timers = timers;
    }
    /**
     * Start a new live stream.
     *
     * Requirement 17.2: Begin distributing within 10 seconds of initiation.
     *
     * @returns The stream ID if successful, null if the user is already streaming
     */
    startStream(streamerId, title) {
        // Validate: user is not already streaming
        if (this.streamerMap.has(streamerId)) {
            logger_1.logger.warn('User attempted to start stream while already streaming', { streamerId });
            return null;
        }
        const streamId = (0, uuid_1.v4)();
        const stream = {
            id: streamId,
            streamerId,
            title,
            state: 'starting',
            viewers: new Map(),
            viewerCount: 0,
            startedAt: Date.now(),
        };
        this.activeStreams.set(streamId, stream);
        this.streamerMap.set(streamerId, streamId);
        // Set timeout for stream to go live (10 seconds)
        const timeout = this.timers.setTimeout(() => {
            this.handleStartTimeout(streamId);
        }, exports.STREAM_START_TIMEOUT_MS);
        this.startTimeouts.set(streamId, timeout);
        logger_1.logger.info('Stream starting', { streamId, streamerId, title });
        return streamId;
    }
    /**
     * Mark a stream as live (called when media ingest begins).
     */
    setStreamLive(streamId) {
        const stream = this.activeStreams.get(streamId);
        if (!stream || stream.state !== 'starting') {
            return false;
        }
        stream.state = 'live';
        // Clear start timeout
        const timeout = this.startTimeouts.get(streamId);
        if (timeout) {
            this.timers.clearTimeout(timeout);
            this.startTimeouts.delete(streamId);
        }
        logger_1.logger.info('Stream is live', { streamId, streamerId: stream.streamerId });
        return true;
    }
    /**
     * Add a viewer to a live stream.
     *
     * Requirement 17.3: Deliver stream with latency under 5 seconds.
     *
     * @returns The bitrate config for the viewer, or null if stream doesn't exist
     */
    joinStream(streamId, viewerId) {
        const stream = this.activeStreams.get(streamId);
        if (!stream || stream.state !== 'live') {
            return null;
        }
        // Don't allow streamer to join as viewer
        if (stream.streamerId === viewerId) {
            return null;
        }
        // Already viewing
        if (stream.viewers.has(viewerId)) {
            const viewer = stream.viewers.get(viewerId);
            return exports.BITRATE_CONFIGS[viewer.quality];
        }
        const viewer = {
            userId: viewerId,
            joinedAt: Date.now(),
            quality: 'high', // Start with highest quality
        };
        stream.viewers.set(viewerId, viewer);
        stream.viewerCount = stream.viewers.size;
        // Notify streamer of new viewer
        this.emitter.to(`user:${stream.streamerId}`).emit('stream:viewer-joined', {
            streamId,
            viewerId,
            viewerCount: stream.viewerCount,
        });
        logger_1.logger.debug('Viewer joined stream', { streamId, viewerId, viewerCount: stream.viewerCount });
        return exports.BITRATE_CONFIGS.high;
    }
    /**
     * Remove a viewer from a live stream.
     */
    leaveStream(streamId, viewerId) {
        const stream = this.activeStreams.get(streamId);
        if (!stream) {
            return false;
        }
        if (!stream.viewers.has(viewerId)) {
            return false;
        }
        stream.viewers.delete(viewerId);
        stream.viewerCount = stream.viewers.size;
        // Notify streamer
        this.emitter.to(`user:${stream.streamerId}`).emit('stream:viewer-left', {
            streamId,
            viewerId,
            viewerCount: stream.viewerCount,
        });
        logger_1.logger.debug('Viewer left stream', { streamId, viewerId, viewerCount: stream.viewerCount });
        return true;
    }
    /**
     * Update a viewer's bitrate quality based on network conditions.
     *
     * Adaptive bitrate: viewers can request different quality levels
     * based on their network conditions.
     */
    updateViewerQuality(streamId, viewerId, quality) {
        const stream = this.activeStreams.get(streamId);
        if (!stream) {
            return null;
        }
        const viewer = stream.viewers.get(viewerId);
        if (!viewer) {
            return null;
        }
        viewer.quality = quality;
        return exports.BITRATE_CONFIGS[quality];
    }
    /**
     * End a live stream.
     *
     * Requirement 17.5: Save recording, available within 5 minutes.
     */
    endStream(streamId, streamerId) {
        const stream = this.activeStreams.get(streamId);
        if (!stream) {
            return null;
        }
        // Only the streamer can end their stream
        if (stream.streamerId !== streamerId) {
            return null;
        }
        stream.state = 'ended';
        stream.endedAt = Date.now();
        const durationMs = stream.endedAt - stream.startedAt;
        // Create recording metadata (available within 5 minutes)
        const recording = {
            streamId,
            streamerId,
            startedAt: stream.startedAt,
            endedAt: stream.endedAt,
            durationMs,
            availableAt: stream.endedAt + exports.RECORDING_AVAILABILITY_MS,
        };
        stream.recording = recording;
        this.recordings.set(streamId, recording);
        // Notify all viewers that stream has ended
        for (const viewer of stream.viewers.values()) {
            this.emitter.to(`user:${viewer.userId}`).emit('stream:ended', {
                streamId,
                recording: {
                    availableAt: recording.availableAt,
                    durationMs: recording.durationMs,
                },
            });
        }
        // Clean up
        const timeout = this.startTimeouts.get(streamId);
        if (timeout) {
            this.timers.clearTimeout(timeout);
            this.startTimeouts.delete(streamId);
        }
        this.activeStreams.delete(streamId);
        this.streamerMap.delete(streamerId);
        logger_1.logger.info('Stream ended', { streamId, streamerId, durationMs, viewerCount: stream.viewerCount });
        return recording;
    }
    /**
     * Get a stream recording.
     */
    getRecording(streamId) {
        return this.recordings.get(streamId);
    }
    /**
     * Check if a recording is available for replay.
     */
    isRecordingAvailable(streamId) {
        const recording = this.recordings.get(streamId);
        if (!recording)
            return false;
        return Date.now() >= recording.availableAt;
    }
    /**
     * Get an active stream by ID.
     */
    getStream(streamId) {
        return this.activeStreams.get(streamId);
    }
    /**
     * Get the active stream for a streamer.
     */
    getStreamerStream(streamerId) {
        const streamId = this.streamerMap.get(streamerId);
        if (!streamId)
            return undefined;
        return this.activeStreams.get(streamId);
    }
    /**
     * Get the number of active streams (for monitoring).
     */
    getActiveStreamCount() {
        return this.activeStreams.size;
    }
    /**
     * Handle start timeout - stream didn't go live within 10 seconds.
     */
    handleStartTimeout(streamId) {
        const stream = this.activeStreams.get(streamId);
        if (!stream || stream.state !== 'starting') {
            return;
        }
        logger_1.logger.warn('Stream start timeout', { streamId, streamerId: stream.streamerId });
        // Notify streamer of failure
        this.emitter.to(`user:${stream.streamerId}`).emit('stream:error', {
            streamId,
            error: 'Stream failed to start within 10 seconds',
        });
        // Clean up
        this.activeStreams.delete(streamId);
        this.streamerMap.delete(stream.streamerId);
        this.startTimeouts.delete(streamId);
    }
    /**
     * Clean up all resources (for graceful shutdown).
     */
    cleanup() {
        for (const timeout of this.startTimeouts.values()) {
            this.timers.clearTimeout(timeout);
        }
        this.startTimeouts.clear();
        this.activeStreams.clear();
        this.streamerMap.clear();
    }
}
exports.StreamService = StreamService;
//# sourceMappingURL=stream-service.js.map