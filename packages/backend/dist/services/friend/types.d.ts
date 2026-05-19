/**
 * Friend service type definitions.
 *
 * Requirements covered:
 * - 3.1: Send friend request with max 500 pending outbound
 * - 3.2: Accept friend request with mutual friendship (max 5000 friends)
 * - 3.3: Decline friend request without notification
 * - 3.9: Reject self-request, blocked users, existing friendship/pending
 * - 3.10: Mutual pending request auto-accept
 */
export interface FriendRequest {
    id: number;
    sender_id: number;
    recipient_id: number;
    status: FriendRequestStatus;
    created_at: Date;
    updated_at: Date;
}
export interface Friendship {
    id: number;
    user_id_1: number;
    user_id_2: number;
    created_at: Date;
}
export interface Block {
    id: number;
    blocker_id: number;
    blocked_id: number;
    created_at: Date;
}
export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';
export declare class FriendServiceError extends Error {
    readonly statusCode: number;
    readonly code: string;
    constructor(message: string, statusCode: number, code: string);
}
/** Maximum pending outbound friend requests per user (Requirement 3.1) */
export declare const MAX_PENDING_OUTBOUND_REQUESTS = 500;
/** Maximum total friends per user (Requirement 3.2) */
export declare const MAX_FRIENDS_PER_USER = 5000;
//# sourceMappingURL=types.d.ts.map