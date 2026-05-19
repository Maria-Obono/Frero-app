/**
 * Social service type definitions.
 *
 * Requirements covered:
 * - 3.4: Follow user with notification
 * - 3.5: Unfollow user (remove follower relationship)
 * - 3.6: Block user (remove all relationships, prevent future interactions)
 * - 3.7: Mutual friends count calculation
 * - 3.8: Paginated connections (cursor-based, default 20, max 100)
 */
export interface Follow {
    id: number;
    follower_id: number;
    followed_id: number;
    created_at: Date;
}
export interface Block {
    id: number;
    blocker_id: number;
    blocked_id: number;
    created_at: Date;
}
export interface ConnectionUser {
    id: number;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
}
export interface PaginatedConnections {
    data: ConnectionUser[];
    cursor: string | null;
    hasMore: boolean;
}
export type ConnectionType = 'friends' | 'followers' | 'following';
/** Default page size for connections (Requirement 3.8) */
export declare const DEFAULT_CONNECTIONS_PAGE_SIZE = 20;
/** Maximum page size for connections (Requirement 3.8) */
export declare const MAX_CONNECTIONS_PAGE_SIZE = 100;
export declare class SocialServiceError extends Error {
    readonly statusCode: number;
    readonly code: string;
    constructor(message: string, statusCode: number, code: string);
}
//# sourceMappingURL=types.d.ts.map