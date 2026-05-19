/**
 * Unit tests for StreamService - Live streaming management.
 *
 * Tests cover:
 * - Stream creation and lifecycle (Requirement 17.2)
 * - Viewer join/leave with adaptive bitrate (Requirement 17.3)
 * - Stream recording availability within 5 minutes (Requirement 17.5)
 * - Adaptive bitrate distribution
 */

import {
  StreamService,
  STREAM_START_TIMEOUT_MS,
  MAX_STREAM_LATENCY_MS,
  RECORDING_AVAILABILITY_MS,
  BITRATE_CONFIGS,
  StreamSocketEmitter,
  StreamTimerProvider,
  BitrateQuality,
} from '../../src/realtime/stream-service';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('StreamService', () => {
  let streamService: StreamService;
  let mockEmitter: jest.Mocked<StreamSocketEmitter>;
  let mockTimers: jest.Mocked<StreamTimerProvider>;
  let emittedEvents: Array<{ room: string; event: string; data: unknown }>;
  let scheduledTimers: Array<{ callback: () => void; ms: number; id: NodeJS.Timeout }>;
  let timerIdCounter: number;

  beforeEach(() => {
    emittedEvents = [];
    scheduledTimers = [];
    timerIdCounter = 0;

    const mockEmit = jest.fn((event: string, data: unknown) => {
      emittedEvents.push({ room: currentRoom, event, data });
    });

    let currentRoom = '';
    mockEmitter = {
      to: jest.fn((room: string) => {
        currentRoom = room;
        return { emit: mockEmit };
      }),
    } as unknown as jest.Mocked<StreamSocketEmitter>;

    mockTimers = {
      setTimeout: jest.fn((callback: () => void, ms: number) => {
        const id = { __timerId: timerIdCounter++ } as unknown as NodeJS.Timeout;
        scheduledTimers.push({ callback, ms, id });
        return id;
      }),
      clearTimeout: jest.fn((id: NodeJS.Timeout) => {
        scheduledTimers = scheduledTimers.filter((t) => t.id !== id);
      }),
    };

    streamService = new StreamService(mockEmitter, mockTimers);
  });

  afterEach(() => {
    streamService.cleanup();
  });

  describe('Constants', () => {
    it('should have stream start timeout of 10000ms', () => {
      expect(STREAM_START_TIMEOUT_MS).toBe(10_000);
    });

    it('should have max stream latency of 5000ms', () => {
      expect(MAX_STREAM_LATENCY_MS).toBe(5000);
    });

    it('should have recording availability of 5 minutes', () => {
      expect(RECORDING_AVAILABILITY_MS).toBe(5 * 60 * 1000);
    });

    it('should define bitrate configs for all quality levels', () => {
      expect(BITRATE_CONFIGS.high).toBeDefined();
      expect(BITRATE_CONFIGS.medium).toBeDefined();
      expect(BITRATE_CONFIGS.low).toBeDefined();
      expect(BITRATE_CONFIGS['audio-only']).toBeDefined();
    });

    it('should have decreasing video bitrates from high to low', () => {
      expect(BITRATE_CONFIGS.high.videoBitrateKbps).toBeGreaterThan(
        BITRATE_CONFIGS.medium.videoBitrateKbps,
      );
      expect(BITRATE_CONFIGS.medium.videoBitrateKbps).toBeGreaterThan(
        BITRATE_CONFIGS.low.videoBitrateKbps,
      );
      expect(BITRATE_CONFIGS.low.videoBitrateKbps).toBeGreaterThan(
        BITRATE_CONFIGS['audio-only'].videoBitrateKbps,
      );
    });
  });

  describe('startStream', () => {
    it('should create a stream and return a stream ID', () => {
      const streamId = streamService.startStream(1, 'My Live Stream');

      expect(streamId).not.toBeNull();
      expect(typeof streamId).toBe('string');
    });

    it('should set the stream state to starting', () => {
      const streamId = streamService.startStream(1, 'My Stream')!;
      const stream = streamService.getStream(streamId);

      expect(stream).toBeDefined();
      expect(stream!.state).toBe('starting');
    });

    it('should store the stream title', () => {
      const streamId = streamService.startStream(1, 'Test Title')!;
      const stream = streamService.getStream(streamId);

      expect(stream!.title).toBe('Test Title');
    });

    it('should start with zero viewers', () => {
      const streamId = streamService.startStream(1, 'My Stream')!;
      const stream = streamService.getStream(streamId);

      expect(stream!.viewerCount).toBe(0);
      expect(stream!.viewers.size).toBe(0);
    });

    it('should schedule a start timeout', () => {
      streamService.startStream(1, 'My Stream');

      expect(mockTimers.setTimeout).toHaveBeenCalledWith(
        expect.any(Function),
        STREAM_START_TIMEOUT_MS,
      );
    });

    it('should return null if user is already streaming', () => {
      streamService.startStream(1, 'First Stream');
      const secondStream = streamService.startStream(1, 'Second Stream');

      expect(secondStream).toBeNull();
    });

    it('should allow different users to stream simultaneously', () => {
      const stream1 = streamService.startStream(1, 'Stream 1');
      const stream2 = streamService.startStream(2, 'Stream 2');

      expect(stream1).not.toBeNull();
      expect(stream2).not.toBeNull();
      expect(streamService.getActiveStreamCount()).toBe(2);
    });
  });

  describe('setStreamLive', () => {
    it('should transition stream from starting to live', () => {
      const streamId = streamService.startStream(1, 'My Stream')!;

      const result = streamService.setStreamLive(streamId);

      expect(result).toBe(true);
      const stream = streamService.getStream(streamId);
      expect(stream!.state).toBe('live');
    });

    it('should clear the start timeout', () => {
      const streamId = streamService.startStream(1, 'My Stream')!;

      streamService.setStreamLive(streamId);

      expect(mockTimers.clearTimeout).toHaveBeenCalled();
    });

    it('should return false for non-existent stream', () => {
      const result = streamService.setStreamLive('non-existent');
      expect(result).toBe(false);
    });

    it('should return false if stream is already live', () => {
      const streamId = streamService.startStream(1, 'My Stream')!;
      streamService.setStreamLive(streamId);

      const result = streamService.setStreamLive(streamId);
      expect(result).toBe(false);
    });
  });

  describe('joinStream', () => {
    let streamId: string;

    beforeEach(() => {
      streamId = streamService.startStream(1, 'My Stream')!;
      streamService.setStreamLive(streamId);
      emittedEvents = [];
    });

    it('should add a viewer and return high quality bitrate config', () => {
      const config = streamService.joinStream(streamId, 2);

      expect(config).toEqual(BITRATE_CONFIGS.high);
    });

    it('should increment viewer count', () => {
      streamService.joinStream(streamId, 2);
      streamService.joinStream(streamId, 3);

      const stream = streamService.getStream(streamId);
      expect(stream!.viewerCount).toBe(2);
    });

    it('should notify the streamer of new viewer', () => {
      streamService.joinStream(streamId, 2);

      const event = emittedEvents.find(
        (e) => e.room === 'user:1' && e.event === 'stream:viewer-joined',
      );
      expect(event).toBeDefined();
      expect((event!.data as any).viewerId).toBe(2);
      expect((event!.data as any).viewerCount).toBe(1);
    });

    it('should return null for non-existent stream', () => {
      const config = streamService.joinStream('non-existent', 2);
      expect(config).toBeNull();
    });

    it('should return null for stream that is not live', () => {
      const startingStreamId = streamService.startStream(5, 'Starting')!;
      const config = streamService.joinStream(startingStreamId, 2);
      expect(config).toBeNull();
    });

    it('should not allow streamer to join as viewer', () => {
      const config = streamService.joinStream(streamId, 1);
      expect(config).toBeNull();
    });

    it('should return existing config if viewer already joined', () => {
      streamService.joinStream(streamId, 2);
      const config = streamService.joinStream(streamId, 2);

      expect(config).toEqual(BITRATE_CONFIGS.high);
      // Viewer count should not increase
      const stream = streamService.getStream(streamId);
      expect(stream!.viewerCount).toBe(1);
    });
  });

  describe('leaveStream', () => {
    let streamId: string;

    beforeEach(() => {
      streamId = streamService.startStream(1, 'My Stream')!;
      streamService.setStreamLive(streamId);
      streamService.joinStream(streamId, 2);
      streamService.joinStream(streamId, 3);
      emittedEvents = [];
    });

    it('should remove a viewer and decrement count', () => {
      const result = streamService.leaveStream(streamId, 2);

      expect(result).toBe(true);
      const stream = streamService.getStream(streamId);
      expect(stream!.viewerCount).toBe(1);
    });

    it('should notify the streamer', () => {
      streamService.leaveStream(streamId, 2);

      const event = emittedEvents.find(
        (e) => e.room === 'user:1' && e.event === 'stream:viewer-left',
      );
      expect(event).toBeDefined();
      expect((event!.data as any).viewerId).toBe(2);
    });

    it('should return false for non-existent stream', () => {
      const result = streamService.leaveStream('non-existent', 2);
      expect(result).toBe(false);
    });

    it('should return false if viewer is not in the stream', () => {
      const result = streamService.leaveStream(streamId, 99);
      expect(result).toBe(false);
    });
  });

  describe('updateViewerQuality', () => {
    let streamId: string;

    beforeEach(() => {
      streamId = streamService.startStream(1, 'My Stream')!;
      streamService.setStreamLive(streamId);
      streamService.joinStream(streamId, 2);
    });

    it('should update viewer quality and return new config', () => {
      const config = streamService.updateViewerQuality(streamId, 2, 'medium');

      expect(config).toEqual(BITRATE_CONFIGS.medium);
    });

    it('should support all quality levels', () => {
      const qualities: BitrateQuality[] = ['high', 'medium', 'low', 'audio-only'];

      for (const quality of qualities) {
        const config = streamService.updateViewerQuality(streamId, 2, quality);
        expect(config).toEqual(BITRATE_CONFIGS[quality]);
      }
    });

    it('should return null for non-existent stream', () => {
      const config = streamService.updateViewerQuality('non-existent', 2, 'low');
      expect(config).toBeNull();
    });

    it('should return null for non-viewer', () => {
      const config = streamService.updateViewerQuality(streamId, 99, 'low');
      expect(config).toBeNull();
    });
  });

  describe('endStream', () => {
    let streamId: string;

    beforeEach(() => {
      streamId = streamService.startStream(1, 'My Stream')!;
      streamService.setStreamLive(streamId);
      streamService.joinStream(streamId, 2);
      streamService.joinStream(streamId, 3);
      emittedEvents = [];
    });

    it('should end the stream and return recording metadata', () => {
      const recording = streamService.endStream(streamId, 1);

      expect(recording).not.toBeNull();
      expect(recording!.streamId).toBe(streamId);
      expect(recording!.streamerId).toBe(1);
      expect(recording!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should set recording availableAt to endedAt + 5 minutes', () => {
      const recording = streamService.endStream(streamId, 1)!;

      expect(recording.availableAt).toBe(recording.endedAt + RECORDING_AVAILABILITY_MS);
    });

    it('should notify all viewers that stream ended', () => {
      streamService.endStream(streamId, 1);

      const viewer2Event = emittedEvents.find(
        (e) => e.room === 'user:2' && e.event === 'stream:ended',
      );
      const viewer3Event = emittedEvents.find(
        (e) => e.room === 'user:3' && e.event === 'stream:ended',
      );

      expect(viewer2Event).toBeDefined();
      expect(viewer3Event).toBeDefined();
    });

    it('should include recording info in ended notification', () => {
      streamService.endStream(streamId, 1);

      const event = emittedEvents.find((e) => e.event === 'stream:ended');
      expect((event!.data as any).recording).toBeDefined();
      expect((event!.data as any).recording.availableAt).toBeDefined();
      expect((event!.data as any).recording.durationMs).toBeDefined();
    });

    it('should remove the stream from active streams', () => {
      streamService.endStream(streamId, 1);

      expect(streamService.getStream(streamId)).toBeUndefined();
      expect(streamService.getActiveStreamCount()).toBe(0);
    });

    it('should allow the streamer to start a new stream after ending', () => {
      streamService.endStream(streamId, 1);

      const newStreamId = streamService.startStream(1, 'New Stream');
      expect(newStreamId).not.toBeNull();
    });

    it('should return null if not the streamer', () => {
      const recording = streamService.endStream(streamId, 2);
      expect(recording).toBeNull();
    });

    it('should return null for non-existent stream', () => {
      const recording = streamService.endStream('non-existent', 1);
      expect(recording).toBeNull();
    });
  });

  describe('getRecording', () => {
    it('should return recording after stream ends', () => {
      const streamId = streamService.startStream(1, 'My Stream')!;
      streamService.setStreamLive(streamId);
      streamService.endStream(streamId, 1);

      const recording = streamService.getRecording(streamId);
      expect(recording).toBeDefined();
      expect(recording!.streamId).toBe(streamId);
    });

    it('should return undefined for non-existent recording', () => {
      const recording = streamService.getRecording('non-existent');
      expect(recording).toBeUndefined();
    });
  });

  describe('isRecordingAvailable', () => {
    it('should return false immediately after stream ends', () => {
      const streamId = streamService.startStream(1, 'My Stream')!;
      streamService.setStreamLive(streamId);
      streamService.endStream(streamId, 1);

      // Recording is not yet available (needs 5 minutes)
      const available = streamService.isRecordingAvailable(streamId);
      expect(available).toBe(false);
    });

    it('should return false for non-existent recording', () => {
      const available = streamService.isRecordingAvailable('non-existent');
      expect(available).toBe(false);
    });
  });

  describe('start timeout', () => {
    it('should clean up stream if not live within timeout', () => {
      const streamId = streamService.startStream(1, 'My Stream')!;

      // Simulate timeout firing
      const timer = scheduledTimers.find((t) => t.ms === STREAM_START_TIMEOUT_MS);
      expect(timer).toBeDefined();
      timer!.callback();

      expect(streamService.getStream(streamId)).toBeUndefined();
      expect(streamService.getActiveStreamCount()).toBe(0);
    });

    it('should notify streamer of failure on timeout', () => {
      streamService.startStream(1, 'My Stream');
      emittedEvents = [];

      const timer = scheduledTimers.find((t) => t.ms === STREAM_START_TIMEOUT_MS);
      timer!.callback();

      const errorEvent = emittedEvents.find(
        (e) => e.room === 'user:1' && e.event === 'stream:error',
      );
      expect(errorEvent).toBeDefined();
      expect((errorEvent!.data as any).error).toContain('10 seconds');
    });

    it('should not clean up if stream is already live', () => {
      const streamId = streamService.startStream(1, 'My Stream')!;

      // Capture the timer callback before setStreamLive clears it
      const timer = scheduledTimers.find((t) => t.ms === STREAM_START_TIMEOUT_MS);
      expect(timer).toBeDefined();
      const timerCallback = timer!.callback;

      streamService.setStreamLive(streamId);

      // Simulate timeout firing (should be no-op since stream is live)
      timerCallback();

      expect(streamService.getStream(streamId)).toBeDefined();
    });
  });

  describe('getStreamerStream', () => {
    it('should return the active stream for a streamer', () => {
      const streamId = streamService.startStream(1, 'My Stream')!;
      const stream = streamService.getStreamerStream(1);

      expect(stream).toBeDefined();
      expect(stream!.id).toBe(streamId);
    });

    it('should return undefined for user not streaming', () => {
      const stream = streamService.getStreamerStream(99);
      expect(stream).toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('should clear all active streams and timeouts', () => {
      streamService.startStream(1, 'Stream 1');
      streamService.startStream(2, 'Stream 2');

      streamService.cleanup();

      expect(streamService.getActiveStreamCount()).toBe(0);
      expect(streamService.getStreamerStream(1)).toBeUndefined();
      expect(streamService.getStreamerStream(2)).toBeUndefined();
    });
  });
});
