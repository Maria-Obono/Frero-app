/**
 * WebRTC Call Signaling Service.
 *
 * Handles voice/video call signaling via Socket.IO, including:
 * - SDP offer/answer relay between peers
 * - ICE candidate exchange
 * - ICE candidate renegotiation (3 attempts, 5s between)
 * - Audio-only fallback on poor network quality
 * - Call lifecycle management (initiate, answer, end)
 *
 * Requirements covered:
 * - 17.1: WebRTC peer connection establishment within 10 seconds
 * - 17.4: ICE candidate renegotiation (3 attempts, 5s between)
 * - 17.6: Call termination within 3 seconds
 * - 17.7: Audio-only fallback on poor network quality
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

/** Maximum ICE renegotiation attempts */
export const MAX_ICE_RENEGOTIATION_ATTEMPTS = 3;

/** Delay between ICE renegotiation attempts in milliseconds */
export const ICE_RENEGOTIATION_DELAY_MS = 5000;

/** Call establishment timeout in milliseconds (10 seconds) */
export const CALL_ESTABLISHMENT_TIMEOUT_MS = 10_000;

/** Call termination timeout in milliseconds (3 seconds) */
export const CALL_TERMINATION_TIMEOUT_MS = 3000;

/** Minimum video bitrate threshold for audio-only fallback (kbps) */
export const MIN_VIDEO_BITRATE_KBPS = 100;

/**
 * Call types supported by the platform.
 */
export type CallType = 'voice' | 'video';

/**
 * Call states in the lifecycle.
 */
export type CallState = 'initiating' | 'ringing' | 'connected' | 'reconnecting' | 'ended';

/**
 * Reasons a call can end.
 */
export type CallEndReason =
  | 'completed'
  | 'declined'
  | 'timeout'
  | 'ice_failed'
  | 'network_error'
  | 'participant_left';

/**
 * SDP signal types for WebRTC negotiation.
 */
export type SignalType = 'offer' | 'answer' | 'ice-candidate' | 'renegotiate';

/**
 * WebRTC signal data relayed between peers.
 */
export interface RTCSignalData {
  type: SignalType;
  sdp?: string;
  candidate?: {
    candidate: string;
    sdpMid: string | null;
    sdpMLineIndex: number | null;
  };
}

/**
 * Active call record tracking state and participants.
 */
export interface ActiveCall {
  id: string;
  type: CallType;
  callerId: number;
  recipientId: number;
  state: CallState;
  audioOnly: boolean;
  iceRenegotiationAttempts: number;
  createdAt: number;
  connectedAt?: number;
  endedAt?: number;
  endReason?: CallEndReason;
}

/**
 * Socket emitter interface for dependency injection in tests.
 */
export interface SocketEmitter {
  to(room: string): { emit(event: string, data: unknown): void };
}

/**
 * Timer interface for dependency injection (enables testing without real timers).
 */
export interface TimerProvider {
  setTimeout(callback: () => void, ms: number): NodeJS.Timeout;
  clearTimeout(id: NodeJS.Timeout): void;
}

/** Default timer provider using real timers */
export const defaultTimerProvider: TimerProvider = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (id) => clearTimeout(id),
};

/**
 * CallService manages WebRTC signaling for voice/video calls.
 *
 * The actual WebRTC peer connections happen client-side.
 * This service only handles signaling (relaying SDP/ICE messages between peers).
 */
export class CallService {
  /** Map of active calls by call ID */
  private activeCalls: Map<string, ActiveCall> = new Map();

  /** Map of user ID to their active call ID */
  private userCalls: Map<number, string> = new Map();

  /** Map of call ID to establishment timeout */
  private establishmentTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /** Map of call ID to renegotiation timeout */
  private renegotiationTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /** Socket emitter for sending events to users */
  private emitter: SocketEmitter;

  /** Timer provider for testability */
  private timers: TimerProvider;

  constructor(emitter: SocketEmitter, timers: TimerProvider = defaultTimerProvider) {
    this.emitter = emitter;
    this.timers = timers;
  }

  /**
   * Initiate a voice or video call.
   *
   * Creates a call record, notifies the recipient, and starts
   * the establishment timeout (10 seconds).
   *
   * @returns The call ID if successful, null if the user is already in a call
   */
  initiateCall(callerId: number, recipientId: number, type: CallType): string | null {
    // Validate: caller cannot call themselves
    if (callerId === recipientId) {
      logger.warn('User attempted to call themselves', { callerId });
      return null;
    }

    // Validate: neither participant is already in a call
    if (this.userCalls.has(callerId)) {
      logger.warn('Caller is already in a call', { callerId });
      return null;
    }
    if (this.userCalls.has(recipientId)) {
      logger.warn('Recipient is already in a call', { recipientId });
      return null;
    }

    const callId = uuidv4();
    const call: ActiveCall = {
      id: callId,
      type,
      callerId,
      recipientId,
      state: 'ringing',
      audioOnly: type === 'voice',
      iceRenegotiationAttempts: 0,
      createdAt: Date.now(),
    };

    this.activeCalls.set(callId, call);
    this.userCalls.set(callerId, callId);
    this.userCalls.set(recipientId, callId);

    // Notify recipient of incoming call
    this.emitter.to(`user:${recipientId}`).emit('call:incoming', {
      callId,
      callerId: String(callerId),
      type,
    });

    // Start establishment timeout (Requirement 17.1: within 10 seconds)
    const timeout = this.timers.setTimeout(() => {
      this.handleEstablishmentTimeout(callId);
    }, CALL_ESTABLISHMENT_TIMEOUT_MS);
    this.establishmentTimeouts.set(callId, timeout);

    logger.info('Call initiated', { callId, callerId, recipientId, type });
    return callId;
  }

  /**
   * Handle a WebRTC signal (SDP offer/answer, ICE candidate).
   *
   * Relays the signal to the other participant in the call.
   *
   * @returns true if the signal was relayed, false if the call doesn't exist or user isn't a participant
   */
  handleSignal(callId: string, fromUserId: number, signal: RTCSignalData): boolean {
    const call = this.activeCalls.get(callId);
    if (!call) {
      logger.warn('Signal for non-existent call', { callId, fromUserId });
      return false;
    }

    // Verify the sender is a participant
    if (call.callerId !== fromUserId && call.recipientId !== fromUserId) {
      logger.warn('Signal from non-participant', { callId, fromUserId });
      return false;
    }

    // Determine the target user
    const targetUserId = call.callerId === fromUserId ? call.recipientId : call.callerId;

    // If this is an answer, the call is being connected
    if (signal.type === 'answer' && call.state === 'ringing') {
      call.state = 'connected';
      call.connectedAt = Date.now();

      // Clear establishment timeout
      const timeout = this.establishmentTimeouts.get(callId);
      if (timeout) {
        this.timers.clearTimeout(timeout);
        this.establishmentTimeouts.delete(callId);
      }
    }

    // Reset renegotiation attempts on successful ICE candidate
    if (signal.type === 'ice-candidate' && call.state === 'connected') {
      call.iceRenegotiationAttempts = 0;
      // Clear any pending renegotiation timeout
      const renego = this.renegotiationTimeouts.get(callId);
      if (renego) {
        this.timers.clearTimeout(renego);
        this.renegotiationTimeouts.delete(callId);
      }
    }

    // Relay signal to the other participant
    this.emitter.to(`user:${targetUserId}`).emit('call:signal', {
      callId,
      signal,
    });

    logger.debug('Signal relayed', { callId, fromUserId, targetUserId, signalType: signal.type });
    return true;
  }

  /**
   * Handle ICE connection failure and attempt renegotiation.
   *
   * Requirement 17.4: Attempt ICE candidate renegotiation up to 3 times
   * with 5 seconds between attempts.
   *
   * @returns true if renegotiation was initiated, false if max attempts reached
   */
  handleIceFailure(callId: string, reportingUserId: number): boolean {
    const call = this.activeCalls.get(callId);
    if (!call) {
      return false;
    }

    // Verify the reporter is a participant
    if (call.callerId !== reportingUserId && call.recipientId !== reportingUserId) {
      return false;
    }

    call.iceRenegotiationAttempts++;

    if (call.iceRenegotiationAttempts > MAX_ICE_RENEGOTIATION_ATTEMPTS) {
      // All attempts exhausted - terminate the call
      this.endCall(callId, reportingUserId, 'ice_failed');
      return false;
    }

    // Set state to reconnecting
    call.state = 'reconnecting';

    // Notify both participants to renegotiate
    const renegotiateSignal: RTCSignalData = { type: 'renegotiate' };

    this.emitter.to(`user:${call.callerId}`).emit('call:signal', {
      callId,
      signal: renegotiateSignal,
    });
    this.emitter.to(`user:${call.recipientId}`).emit('call:signal', {
      callId,
      signal: renegotiateSignal,
    });

    // Schedule next renegotiation attempt timeout
    const timeout = this.timers.setTimeout(() => {
      // If still reconnecting after delay, try again
      const currentCall = this.activeCalls.get(callId);
      if (currentCall && currentCall.state === 'reconnecting') {
        this.handleIceFailure(callId, reportingUserId);
      }
    }, ICE_RENEGOTIATION_DELAY_MS);
    this.renegotiationTimeouts.set(callId, timeout);

    logger.info('ICE renegotiation attempt', {
      callId,
      attempt: call.iceRenegotiationAttempts,
      maxAttempts: MAX_ICE_RENEGOTIATION_ATTEMPTS,
    });

    return true;
  }

  /**
   * Switch a video call to audio-only mode.
   *
   * Requirement 17.7: When video bitrate falls below minimum threshold,
   * switch to audio-only and notify participants.
   *
   * @returns true if switched, false if call doesn't exist or is already audio-only
   */
  switchToAudioOnly(callId: string, reportingUserId: number): boolean {
    const call = this.activeCalls.get(callId);
    if (!call) {
      return false;
    }

    // Verify the reporter is a participant
    if (call.callerId !== reportingUserId && call.recipientId !== reportingUserId) {
      return false;
    }

    // Already audio-only
    if (call.audioOnly) {
      return false;
    }

    call.audioOnly = true;

    // Notify both participants of the mode switch
    this.emitter.to(`user:${call.callerId}`).emit('call:signal', {
      callId,
      signal: { type: 'audio-only-fallback' as unknown as SignalType },
    });
    this.emitter.to(`user:${call.recipientId}`).emit('call:signal', {
      callId,
      signal: { type: 'audio-only-fallback' as unknown as SignalType },
    });

    logger.info('Call switched to audio-only', { callId, reportingUserId });
    return true;
  }

  /**
   * End a call.
   *
   * Requirement 17.6: Terminate peer connection for all participants
   * within 3 seconds and release resources.
   */
  endCall(callId: string, userId: number, reason: CallEndReason = 'completed'): boolean {
    const call = this.activeCalls.get(callId);
    if (!call) {
      return false;
    }

    // Verify the user is a participant
    if (call.callerId !== userId && call.recipientId !== userId) {
      return false;
    }

    call.state = 'ended';
    call.endedAt = Date.now();
    call.endReason = reason;

    // Notify both participants
    this.emitter.to(`user:${call.callerId}`).emit('call:ended', {
      callId,
      reason,
    });
    this.emitter.to(`user:${call.recipientId}`).emit('call:ended', {
      callId,
      reason,
    });

    // Clean up timeouts
    const estTimeout = this.establishmentTimeouts.get(callId);
    if (estTimeout) {
      this.timers.clearTimeout(estTimeout);
      this.establishmentTimeouts.delete(callId);
    }
    const renoTimeout = this.renegotiationTimeouts.get(callId);
    if (renoTimeout) {
      this.timers.clearTimeout(renoTimeout);
      this.renegotiationTimeouts.delete(callId);
    }

    // Remove from active maps
    this.activeCalls.delete(callId);
    this.userCalls.delete(call.callerId);
    this.userCalls.delete(call.recipientId);

    logger.info('Call ended', { callId, userId, reason });
    return true;
  }

  /**
   * Handle establishment timeout - call not connected within 10 seconds.
   */
  private handleEstablishmentTimeout(callId: string): void {
    const call = this.activeCalls.get(callId);
    if (!call || call.state === 'connected') {
      return;
    }

    logger.warn('Call establishment timeout', { callId });
    this.endCall(callId, call.callerId, 'timeout');
  }

  /**
   * Get an active call by ID.
   */
  getCall(callId: string): ActiveCall | undefined {
    return this.activeCalls.get(callId);
  }

  /**
   * Get the active call for a user.
   */
  getUserCall(userId: number): ActiveCall | undefined {
    const callId = this.userCalls.get(userId);
    if (!callId) return undefined;
    return this.activeCalls.get(callId);
  }

  /**
   * Get the number of active calls (for monitoring).
   */
  getActiveCallCount(): number {
    return this.activeCalls.size;
  }

  /**
   * Clean up all resources (for graceful shutdown).
   */
  cleanup(): void {
    for (const timeout of this.establishmentTimeouts.values()) {
      this.timers.clearTimeout(timeout);
    }
    for (const timeout of this.renegotiationTimeouts.values()) {
      this.timers.clearTimeout(timeout);
    }
    this.establishmentTimeouts.clear();
    this.renegotiationTimeouts.clear();
    this.activeCalls.clear();
    this.userCalls.clear();
  }
}
