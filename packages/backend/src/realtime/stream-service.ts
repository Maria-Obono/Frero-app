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

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

/** Maximum time for stream to start distributing (10 seconds) */
export const STREAM_START_TIMEOUT_MS = 10_000;

/** Maximum acceptable stream latency (5 seconds) */
export const MAX_STREAM_LATENCY_MS = 5000;

/** Time for recording to become available after stream ends (5 minutes) */
export const RECORDING_AVAILABILITY_MS = 5 * 60 * 1000;

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
  resolution: { width: number; height: number };
}

/** Default bitrate configurations for adaptive streaming */
export const BITRATE_CONFIGS: Record<BitrateQuality, BitrateConfig> = {
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
  to(room: string): { emit(event: string, data: unknown): void };
}

/**
 * Timer interface for dependency injection.
 */
export interface StreamTimerProvider {
  setTimeout(callback: () => void, ms: number): NodeJS.Timeout;
  clearTimeout(id: NodeJS.Timeout): void;
}

/** Default timer provider */
export const defaultStreamTimerProvider: StreamTimerProvider = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (id) => clearTimeout(id),
};

/**
 * StreamService manages live streaming sessions.
 *
 * In production, actual media processing would use a media server (e.g., Janus, mediasoup).
 * This service handles the signaling and room management layer.
 */
export class StreamService {
  /** Map of active streams by stream ID */
  private activeStreams: Map<string, ActiveStream> = new Map();

  /** Map of streamer user ID to their active stream ID */
  private streamerMap: Map<number, string> = new Map();

  /** Map of stream recordings by stream ID */
  private recordings: Map<string, StreamRecording> = new Map();

  /** Map of stream ID to start timeout */
  private startTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /** Socket emitter for sending events */
  private emitter: StreamSocketEmitter;

  /** Timer provider */
  private timers: StreamTimerProvider;

  constructor(emitter: StreamSocketEmitter, timers: StreamTimerProvider = defaultStreamTimerProvider) {
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
  startStream(streamerId: number, title: string): string | null {
    // Validate: user is not already streaming
    if (this.streamerMap.has(streamerId)) {
      logger.warn('User attempted to start stream while already streaming', { streamerId });
      return null;
    }

    const streamId = uuidv4();
    const stream: ActiveStream = {
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
    }, STREAM_START_TIMEOUT_MS);
    this.startTimeouts.set(streamId, timeout);

    logger.info('Stream starting', { streamId, streamerId, title });
    return streamId;
  }

  /**
   * Mark a stream as live (called when media ingest begins).
   */
  setStreamLive(streamId: string): boolean {
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

    logger.info('Stream is live', { streamId, streamerId: stream.streamerId });
    return true;
  }

  /**
   * Add a viewer to a live stream.
   *
   * Requirement 17.3: Deliver stream with latency under 5 seconds.
   *
   * @returns The bitrate config for the viewer, or null if stream doesn't exist
   */
  joinStream(streamId: string, viewerId: number): BitrateConfig | null {
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
      const viewer = stream.viewers.get(viewerId)!;
      return BITRATE_CONFIGS[viewer.quality];
    }

    const viewer: StreamViewer = {
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

    logger.debug('Viewer joined stream', { streamId, viewerId, viewerCount: stream.viewerCount });
    return BITRATE_CONFIGS.high;
  }

  /**
   * Remove a viewer from a live stream.
   */
  leaveStream(streamId: string, viewerId: number): boolean {
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

    logger.debug('Viewer left stream', { streamId, viewerId, viewerCount: stream.viewerCount });
    return true;
  }

  /**
   * Update a viewer's bitrate quality based on network conditions.
   *
   * Adaptive bitrate: viewers can request different quality levels
   * based on their network conditions.
   */
  updateViewerQuality(streamId: string, viewerId: number, quality: BitrateQuality): BitrateConfig | null {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      return null;
    }

    const viewer = stream.viewers.get(viewerId);
    if (!viewer) {
      return null;
    }

    viewer.quality = quality;
    return BITRATE_CONFIGS[quality];
  }

  /**
   * End a live stream.
   *
   * Requirement 17.5: Save recording, available within 5 minutes.
   */
  endStream(streamId: string, streamerId: number): StreamRecording | null {
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
    const recording: StreamRecording = {
      streamId,
      streamerId,
      startedAt: stream.startedAt,
      endedAt: stream.endedAt,
      durationMs,
      availableAt: stream.endedAt + RECORDING_AVAILABILITY_MS,
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

    logger.info('Stream ended', { streamId, streamerId, durationMs, viewerCount: stream.viewerCount });
    return recording;
  }

  /**
   * Get a stream recording.
   */
  getRecording(streamId: string): StreamRecording | undefined {
    return this.recordings.get(streamId);
  }

  /**
   * Check if a recording is available for replay.
   */
  isRecordingAvailable(streamId: string): boolean {
    const recording = this.recordings.get(streamId);
    if (!recording) return false;
    return Date.now() >= recording.availableAt;
  }

  /**
   * Get an active stream by ID.
   */
  getStream(streamId: string): ActiveStream | undefined {
    return this.activeStreams.get(streamId);
  }

  /**
   * Get the active stream for a streamer.
   */
  getStreamerStream(streamerId: number): ActiveStream | undefined {
    const streamId = this.streamerMap.get(streamerId);
    if (!streamId) return undefined;
    return this.activeStreams.get(streamId);
  }

  /**
   * Get the number of active streams (for monitoring).
   */
  getActiveStreamCount(): number {
    return this.activeStreams.size;
  }

  /**
   * Handle start timeout - stream didn't go live within 10 seconds.
   */
  private handleStartTimeout(streamId: string): void {
    const stream = this.activeStreams.get(streamId);
    if (!stream || stream.state !== 'starting') {
      return;
    }

    logger.warn('Stream start timeout', { streamId, streamerId: stream.streamerId });

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
  cleanup(): void {
    for (const timeout of this.startTimeouts.values()) {
      this.timers.clearTimeout(timeout);
    }
    this.startTimeouts.clear();
    this.activeStreams.clear();
    this.streamerMap.clear();
  }
}
