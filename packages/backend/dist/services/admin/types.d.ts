/**
 * Admin service type definitions.
 *
 * Requirements covered:
 * - 11.1: Dashboard analytics (active users, posts, comments, likes)
 * - 11.2: Content reporting (reporter ID, content ID, reason, timestamp)
 * - 11.3: Moderation actions (dismiss, warn, remove content, suspend user)
 * - 11.4: Admin user search with activity history
 * - 11.5: Role enforcement (admin/moderator only)
 * - 11.6: User suspension with session invalidation
 */
export type UserRole = 'user' | 'moderator' | 'admin';
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'violence' | 'misinformation' | 'other';
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';
export type ContentType = 'post' | 'reel' | 'comment' | 'story' | 'user' | 'message';
export type ModerationAction = 'dismiss' | 'warn' | 'remove_content' | 'suspend_user';
export interface DashboardAnalytics {
    period: number;
    activeUsers: number;
    totalPosts: number;
    totalComments: number;
    totalLikes: number;
}
export interface ReportRecord {
    id: number;
    reporter_id: number;
    content_id: number;
    content_type: ContentType;
    reason: ReportReason;
    status: ReportStatus;
    moderator_id: number | null;
    action_taken: ModerationAction | null;
    reviewed_at: Date | null;
    created_at: Date;
}
export interface ActivityEntry {
    id: number;
    type: 'post' | 'comment' | 'like';
    content_id: number;
    content_preview: string | null;
    created_at: Date;
}
export interface AdminUserView {
    id: number;
    email: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    role: UserRole;
    created_at: Date;
    is_suspended: boolean;
    activity: ActivityEntry[];
    reports: ReportRecord[];
}
export declare class AdminServiceError extends Error {
    readonly statusCode: number;
    readonly details?: Record<string, unknown>;
    constructor(message: string, statusCode: number, details?: Record<string, unknown>);
}
//# sourceMappingURL=types.d.ts.map