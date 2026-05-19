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
/** Maximum ICE renegotiation attempts */
export declare const MAX_ICE_RENEGOTIATION_ATTEMPTS = 3;
/** Delay between ICE renegotiation attempts in milliseconds */
export declare const ICE_RENEGOTIATION_DELAY_MS = 5000;
/** Call establishment timeout in milliseconds (10 seconds) */
export declare const CALL_ESTABLISHMENT_TIMEOUT_MS = 10000;
/** Call termination timeout in milliseconds (3 seconds) */
export declare const CALL_TERMINATION_TIMEOUT_MS = 3000;
/** Minimum video bitrate threshold for audio-only fallback (kbps) */
export declare const MIN_VIDEO_BITRATE_KBPS = 100;
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
export type CallEndReason = 'completed' | 'declined' | 'timeout' | 'ice_failed' | 'network_error' | 'participant_left';
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
    to(room: string): {
        emit(event: string, data: unknown): void;
    };
}
/**
 * Timer interface for dependency injection (enables testing without real timers).
 */
export interface TimerProvider {
    setTimeout(callback: () => void, ms: number): NodeJS.Timeout;
    clearTimeout(id: NodeJS.Timeout): void;
}
/** Default timer provider using real timers */
export declare const defaultTimerProvider: TimerProvider;
/**
 * CallService manages WebRTC signaling for voice/video calls.
 *
 * The actual WebRTC peer connections happen client-side.
 * This service only handles signaling (relaying SDP/ICE messages between peers).
 */
export declare class CallService {
    /** Map of active calls by call ID */
    private activeCalls;
    /** Map of user ID to their active call ID */
    private userCalls;
    /** Map of call ID to establishment timeout */
    private establishmentTimeouts;
    /** Map of call ID to renegotiation timeout */
    private renegotiationTimeouts;
    /** Socket emitter for sending events to users */
    private emitter;
    /** Timer provider for testability */
    private timers;
    constructor(emitter: SocketEmitter, timers?: TimerProvider);
    /**
     * Initiate a voice or video call.
     *
     * Creates a call record, notifies the recipient, and starts
     * the establishment timeout (10 seconds).
     *
     * @returns The call ID if successful, null if the user is already in a call
     */
    initiateCall(callerId: number, recipientId: number, type: CallType): string | null;
    /**
     * Handle a WebRTC signal (SDP offer/answer, ICE candidate).
     *
     * Relays the signal to the other participant in the call.
     *
     * @returns true if the signal was relayed, false if the call doesn't exist or user isn't a participant
     */
    handleSignal(callId: string, fromUserId: number, signal: RTCSignalData): boolean;
    /**
     * Handle ICE connection failure and attempt renegotiation.
     *
     * Requirement 17.4: Attempt ICE candidate renegotiation up to 3 times
     * with 5 seconds between attempts.
     *
     * @returns true if renegotiation was initiated, false if max attempts reached
     */
    handleIceFailure(callId: string, reportingUserId: number): boolean;
    /**
     * Switch a video call to audio-only mode.
     *
     * Requirement 17.7: When video bitrate falls below minimum threshold,
     * switch to audio-only and notify participants.
     *
     * @returns true if switched, false if call doesn't exist or is already audio-only
     */
    switchToAudioOnly(callId: string, reportingUserId: number): boolean;
    /**
     * End a call.
     *
     * Requirement 17.6: Terminate peer connection for all participants
     * within 3 seconds and release resources.
     */
    endCall(callId: string, userId: number, reason?: CallEndReason): boolean;
    /**
     * Handle establishment timeout - call not connected within 10 seconds.
     */
    private handleEstablishmentTimeout;
    /**
     * Get an active call by ID.
     */
    getCall(callId: string): ActiveCall | undefined;
    /**
     * Get the active call for a user.
     */
    getUserCall(userId: number): ActiveCall | undefined;
    /**
     * Get the number of active calls (for monitoring).
     */
    getActiveCallCount(): number;
    /**
     * Clean up all resources (for graceful shutdown).
     */
    cleanup(): void;
}
//# sourceMappingURL=call-service.d.ts.map