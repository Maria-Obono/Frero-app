/**
 * Unit tests for CallService - WebRTC signaling for voice/video calls.
 *
 * Tests cover:
 * - Call initiation and lifecycle (Requirement 17.1)
 * - SDP offer/answer and ICE candidate relay (Requirement 17.1)
 * - ICE candidate renegotiation (3 attempts, 5s between) (Requirement 17.4)
 * - Audio-only fallback on poor network quality (Requirement 17.7)
 * - Call termination within 3 seconds (Requirement 17.6)
 */

import {
  CallService,
  MAX_ICE_RENEGOTIATION_ATTEMPTS,
  ICE_RENEGOTIATION_DELAY_MS,
  CALL_ESTABLISHMENT_TIMEOUT_MS,
  RTCSignalData,
  SocketEmitter,
  TimerProvider,
} from '../../src/realtime/call-service';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CallService', () => {
  let callService: CallService;
  let mockEmitter: jest.Mocked<SocketEmitter>;
  let mockTimers: jest.Mocked<TimerProvider>;
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
    } as unknown as jest.Mocked<SocketEmitter>;

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

    callService = new CallService(mockEmitter, mockTimers);
  });

  afterEach(() => {
    callService.cleanup();
  });

  describe('Constants', () => {
    it('should have max ICE renegotiation attempts of 3', () => {
      expect(MAX_ICE_RENEGOTIATION_ATTEMPTS).toBe(3);
    });

    it('should have ICE renegotiation delay of 5000ms', () => {
      expect(ICE_RENEGOTIATION_DELAY_MS).toBe(5000);
    });

    it('should have call establishment timeout of 10000ms', () => {
      expect(CALL_ESTABLISHMENT_TIMEOUT_MS).toBe(10_000);
    });
  });

  describe('initiateCall', () => {
    it('should create a call and return a call ID', () => {
      const callId = callService.initiateCall(1, 2, 'video');

      expect(callId).not.toBeNull();
      expect(typeof callId).toBe('string');
    });

    it('should notify the recipient of an incoming call', () => {
      callService.initiateCall(1, 2, 'video');

      const incomingEvent = emittedEvents.find(
        (e) => e.room === 'user:2' && e.event === 'call:incoming',
      );
      expect(incomingEvent).toBeDefined();
      expect(incomingEvent!.data).toMatchObject({
        callerId: '1',
        type: 'video',
      });
    });

    it('should set the call state to ringing', () => {
      const callId = callService.initiateCall(1, 2, 'voice')!;
      const call = callService.getCall(callId);

      expect(call).toBeDefined();
      expect(call!.state).toBe('ringing');
    });

    it('should set audioOnly to true for voice calls', () => {
      const callId = callService.initiateCall(1, 2, 'voice')!;
      const call = callService.getCall(callId);

      expect(call!.audioOnly).toBe(true);
    });

    it('should set audioOnly to false for video calls', () => {
      const callId = callService.initiateCall(1, 2, 'video')!;
      const call = callService.getCall(callId);

      expect(call!.audioOnly).toBe(false);
    });

    it('should start an establishment timeout', () => {
      callService.initiateCall(1, 2, 'video');

      expect(mockTimers.setTimeout).toHaveBeenCalledWith(
        expect.any(Function),
        CALL_ESTABLISHMENT_TIMEOUT_MS,
      );
    });

    it('should return null if caller is already in a call', () => {
      callService.initiateCall(1, 2, 'video');
      const secondCall = callService.initiateCall(1, 3, 'video');

      expect(secondCall).toBeNull();
    });

    it('should return null if recipient is already in a call', () => {
      callService.initiateCall(1, 2, 'video');
      const secondCall = callService.initiateCall(3, 2, 'video');

      expect(secondCall).toBeNull();
    });

    it('should return null if caller tries to call themselves', () => {
      const callId = callService.initiateCall(1, 1, 'video');

      expect(callId).toBeNull();
    });

    it('should track the call for both users', () => {
      callService.initiateCall(1, 2, 'video');

      expect(callService.getUserCall(1)).toBeDefined();
      expect(callService.getUserCall(2)).toBeDefined();
    });

    it('should increment active call count', () => {
      expect(callService.getActiveCallCount()).toBe(0);
      callService.initiateCall(1, 2, 'video');
      expect(callService.getActiveCallCount()).toBe(1);
    });
  });

  describe('handleSignal', () => {
    let callId: string;

    beforeEach(() => {
      callId = callService.initiateCall(1, 2, 'video')!;
      emittedEvents = [];
    });

    it('should relay an SDP offer from caller to recipient', () => {
      const signal: RTCSignalData = { type: 'offer', sdp: 'v=0\r\n...' };

      const result = callService.handleSignal(callId, 1, signal);

      expect(result).toBe(true);
      const relayedEvent = emittedEvents.find(
        (e) => e.room === 'user:2' && e.event === 'call:signal',
      );
      expect(relayedEvent).toBeDefined();
      expect(relayedEvent!.data).toMatchObject({ callId, signal });
    });

    it('should relay an SDP answer from recipient to caller', () => {
      const signal: RTCSignalData = { type: 'answer', sdp: 'v=0\r\n...' };

      const result = callService.handleSignal(callId, 2, signal);

      expect(result).toBe(true);
      const relayedEvent = emittedEvents.find(
        (e) => e.room === 'user:1' && e.event === 'call:signal',
      );
      expect(relayedEvent).toBeDefined();
    });

    it('should relay ICE candidates between peers', () => {
      // First connect the call
      callService.handleSignal(callId, 2, { type: 'answer', sdp: 'v=0\r\n...' });
      emittedEvents = [];

      const iceCandidate: RTCSignalData = {
        type: 'ice-candidate',
        candidate: {
          candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 12345 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0,
        },
      };

      const result = callService.handleSignal(callId, 1, iceCandidate);

      expect(result).toBe(true);
      const relayedEvent = emittedEvents.find(
        (e) => e.room === 'user:2' && e.event === 'call:signal',
      );
      expect(relayedEvent).toBeDefined();
      expect(relayedEvent!.data).toMatchObject({ callId, signal: iceCandidate });
    });

    it('should transition call to connected state on answer', () => {
      const signal: RTCSignalData = { type: 'answer', sdp: 'v=0\r\n...' };

      callService.handleSignal(callId, 2, signal);

      const call = callService.getCall(callId);
      expect(call!.state).toBe('connected');
      expect(call!.connectedAt).toBeDefined();
    });

    it('should clear establishment timeout on answer', () => {
      const signal: RTCSignalData = { type: 'answer', sdp: 'v=0\r\n...' };

      callService.handleSignal(callId, 2, signal);

      expect(mockTimers.clearTimeout).toHaveBeenCalled();
    });

    it('should reset ICE renegotiation attempts on successful ICE candidate when connected', () => {
      // Connect the call
      callService.handleSignal(callId, 2, { type: 'answer', sdp: 'v=0\r\n...' });

      // Manually set renegotiation attempts (simulating a recovered connection)
      const call = callService.getCall(callId)!;
      call.iceRenegotiationAttempts = 2;

      // Successful ICE candidate resets attempts when state is connected
      callService.handleSignal(callId, 1, {
        type: 'ice-candidate',
        candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 },
      });

      const callAfter = callService.getCall(callId);
      expect(callAfter!.iceRenegotiationAttempts).toBe(0);
    });

    it('should return false for non-existent call', () => {
      const result = callService.handleSignal('non-existent', 1, { type: 'offer', sdp: 'test' });

      expect(result).toBe(false);
    });

    it('should return false for non-participant', () => {
      const result = callService.handleSignal(callId, 99, { type: 'offer', sdp: 'test' });

      expect(result).toBe(false);
    });
  });

  describe('handleIceFailure', () => {
    let callId: string;

    beforeEach(() => {
      callId = callService.initiateCall(1, 2, 'video')!;
      // Connect the call
      callService.handleSignal(callId, 2, { type: 'answer', sdp: 'v=0\r\n...' });
      emittedEvents = [];
    });

    it('should set call state to reconnecting', () => {
      callService.handleIceFailure(callId, 1);

      const call = callService.getCall(callId);
      expect(call!.state).toBe('reconnecting');
    });

    it('should increment renegotiation attempts', () => {
      callService.handleIceFailure(callId, 1);

      const call = callService.getCall(callId);
      expect(call!.iceRenegotiationAttempts).toBe(1);
    });

    it('should notify both participants to renegotiate', () => {
      callService.handleIceFailure(callId, 1);

      const callerEvent = emittedEvents.find(
        (e) => e.room === 'user:1' && e.event === 'call:signal',
      );
      const recipientEvent = emittedEvents.find(
        (e) => e.room === 'user:2' && e.event === 'call:signal',
      );

      expect(callerEvent).toBeDefined();
      expect(recipientEvent).toBeDefined();
      expect((callerEvent!.data as any).signal.type).toBe('renegotiate');
      expect((recipientEvent!.data as any).signal.type).toBe('renegotiate');
    });

    it('should schedule a renegotiation timeout of 5 seconds', () => {
      callService.handleIceFailure(callId, 1);

      const timer = scheduledTimers.find((t) => t.ms === ICE_RENEGOTIATION_DELAY_MS);
      expect(timer).toBeDefined();
    });

    it('should return true for first 3 attempts', () => {
      expect(callService.handleIceFailure(callId, 1)).toBe(true);
      expect(callService.handleIceFailure(callId, 1)).toBe(true);
      expect(callService.handleIceFailure(callId, 1)).toBe(true);
    });

    it('should end the call after exceeding max attempts', () => {
      // Exhaust all 3 attempts
      callService.handleIceFailure(callId, 1);
      callService.handleIceFailure(callId, 1);
      callService.handleIceFailure(callId, 1);

      // 4th attempt should fail and end the call
      const result = callService.handleIceFailure(callId, 1);

      expect(result).toBe(false);
      expect(callService.getCall(callId)).toBeUndefined();
    });

    it('should emit call:ended with ice_failed reason when max attempts exceeded', () => {
      callService.handleIceFailure(callId, 1);
      callService.handleIceFailure(callId, 1);
      callService.handleIceFailure(callId, 1);
      emittedEvents = [];

      callService.handleIceFailure(callId, 1);

      const endedEvents = emittedEvents.filter((e) => e.event === 'call:ended');
      expect(endedEvents.length).toBe(2); // Both participants notified
      expect((endedEvents[0]!.data as any).reason).toBe('ice_failed');
    });

    it('should return false for non-existent call', () => {
      const result = callService.handleIceFailure('non-existent', 1);
      expect(result).toBe(false);
    });

    it('should return false for non-participant', () => {
      const result = callService.handleIceFailure(callId, 99);
      expect(result).toBe(false);
    });

    it('should auto-retry when renegotiation timeout fires and still reconnecting', () => {
      callService.handleIceFailure(callId, 1);

      // Simulate the timeout firing
      const timer = scheduledTimers.find((t) => t.ms === ICE_RENEGOTIATION_DELAY_MS);
      timer!.callback();

      const call = callService.getCall(callId);
      expect(call!.iceRenegotiationAttempts).toBe(2);
    });
  });

  describe('switchToAudioOnly', () => {
    let callId: string;

    beforeEach(() => {
      callId = callService.initiateCall(1, 2, 'video')!;
      callService.handleSignal(callId, 2, { type: 'answer', sdp: 'v=0\r\n...' });
      emittedEvents = [];
    });

    it('should switch a video call to audio-only', () => {
      const result = callService.switchToAudioOnly(callId, 1);

      expect(result).toBe(true);
      const call = callService.getCall(callId);
      expect(call!.audioOnly).toBe(true);
    });

    it('should notify both participants of the mode switch', () => {
      callService.switchToAudioOnly(callId, 1);

      const callerEvent = emittedEvents.find(
        (e) => e.room === 'user:1' && e.event === 'call:signal',
      );
      const recipientEvent = emittedEvents.find(
        (e) => e.room === 'user:2' && e.event === 'call:signal',
      );

      expect(callerEvent).toBeDefined();
      expect(recipientEvent).toBeDefined();
    });

    it('should return false if already audio-only', () => {
      callService.switchToAudioOnly(callId, 1);
      const result = callService.switchToAudioOnly(callId, 1);

      expect(result).toBe(false);
    });

    it('should return false for voice calls (already audio-only)', () => {
      const voiceCallId = callService.initiateCall(3, 4, 'voice')!;
      const result = callService.switchToAudioOnly(voiceCallId, 3);

      expect(result).toBe(false);
    });

    it('should return false for non-existent call', () => {
      const result = callService.switchToAudioOnly('non-existent', 1);
      expect(result).toBe(false);
    });

    it('should return false for non-participant', () => {
      const result = callService.switchToAudioOnly(callId, 99);
      expect(result).toBe(false);
    });
  });

  describe('endCall', () => {
    let callId: string;

    beforeEach(() => {
      callId = callService.initiateCall(1, 2, 'video')!;
      emittedEvents = [];
    });

    it('should end the call and notify both participants', () => {
      const result = callService.endCall(callId, 1, 'completed');

      expect(result).toBe(true);

      const endedEvents = emittedEvents.filter((e) => e.event === 'call:ended');
      expect(endedEvents.length).toBe(2);
      expect((endedEvents[0]!.data as any).reason).toBe('completed');
    });

    it('should remove the call from active calls', () => {
      callService.endCall(callId, 1, 'completed');

      expect(callService.getCall(callId)).toBeUndefined();
      expect(callService.getActiveCallCount()).toBe(0);
    });

    it('should remove user call mappings', () => {
      callService.endCall(callId, 1, 'completed');

      expect(callService.getUserCall(1)).toBeUndefined();
      expect(callService.getUserCall(2)).toBeUndefined();
    });

    it('should clear establishment timeout', () => {
      callService.endCall(callId, 1, 'completed');

      expect(mockTimers.clearTimeout).toHaveBeenCalled();
    });

    it('should allow either participant to end the call', () => {
      const result = callService.endCall(callId, 2, 'participant_left');

      expect(result).toBe(true);
    });

    it('should return false for non-existent call', () => {
      const result = callService.endCall('non-existent', 1, 'completed');
      expect(result).toBe(false);
    });

    it('should return false for non-participant', () => {
      const result = callService.endCall(callId, 99, 'completed');
      expect(result).toBe(false);
    });

    it('should support declined reason', () => {
      callService.endCall(callId, 2, 'declined');

      const endedEvent = emittedEvents.find((e) => e.event === 'call:ended');
      expect((endedEvent!.data as any).reason).toBe('declined');
    });
  });

  describe('establishment timeout', () => {
    it('should end the call if not connected within timeout', () => {
      const callId = callService.initiateCall(1, 2, 'video')!;

      // Simulate timeout firing
      const timer = scheduledTimers.find((t) => t.ms === CALL_ESTABLISHMENT_TIMEOUT_MS);
      expect(timer).toBeDefined();
      timer!.callback();

      expect(callService.getCall(callId)).toBeUndefined();
    });

    it('should not end the call if already connected', () => {
      const callId = callService.initiateCall(1, 2, 'video')!;

      // Capture the timer callback before handleSignal clears it
      const timer = scheduledTimers.find((t) => t.ms === CALL_ESTABLISHMENT_TIMEOUT_MS);
      expect(timer).toBeDefined();
      const timerCallback = timer!.callback;

      callService.handleSignal(callId, 2, { type: 'answer', sdp: 'v=0\r\n...' });

      // Simulate timeout firing (should be a no-op since call is connected)
      timerCallback();

      // Call should still exist
      expect(callService.getCall(callId)).toBeDefined();
    });

    it('should emit call:ended with timeout reason', () => {
      callService.initiateCall(1, 2, 'video');
      emittedEvents = [];

      const timer = scheduledTimers.find((t) => t.ms === CALL_ESTABLISHMENT_TIMEOUT_MS);
      timer!.callback();

      const endedEvents = emittedEvents.filter((e) => e.event === 'call:ended');
      expect(endedEvents.length).toBe(2);
      expect((endedEvents[0]!.data as any).reason).toBe('timeout');
    });
  });

  describe('getUserCall', () => {
    it('should return undefined for user not in a call', () => {
      expect(callService.getUserCall(99)).toBeUndefined();
    });

    it('should return the active call for a user', () => {
      const callId = callService.initiateCall(1, 2, 'video')!;
      const call = callService.getUserCall(1);

      expect(call).toBeDefined();
      expect(call!.id).toBe(callId);
    });
  });

  describe('cleanup', () => {
    it('should clear all active calls and timeouts', () => {
      callService.initiateCall(1, 2, 'video');
      callService.initiateCall(3, 4, 'voice');

      callService.cleanup();

      expect(callService.getActiveCallCount()).toBe(0);
      expect(callService.getUserCall(1)).toBeUndefined();
      expect(callService.getUserCall(2)).toBeUndefined();
      expect(callService.getUserCall(3)).toBeUndefined();
      expect(callService.getUserCall(4)).toBeUndefined();
    });
  });
});
