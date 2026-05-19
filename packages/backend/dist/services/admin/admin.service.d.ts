/**
 * Admin service handling dashboard analytics, content moderation, and user management.
 *
 * Requirements covered:
 * - 11.1: Dashboard analytics (30-day: active users, posts, comments, likes)
 * - 11.2: Content reporting (reporter ID, content ID, reason, timestamp)
 * - 11.3: Moderation actions (dismiss, warn, remove content, suspend user)
 * - 11.4: Admin user search with activity history (last 100 entries)
 * - 11.5: Role enforcement (admin/moderator only)
 * - 11.6: User suspension with session invalidation (within 30s)
 */
import { AdminRepository } from './admin.repository';
import { DashboardAnalytics, ReportRecord, AdminUserView, ModerationAction, ReportReason, ContentType, UserRole } from './types';
export declare class AdminService {
    private readonly repository;
    private readonly invalidateSessions;
    constructor(options?: {
        repository?: AdminRepository;
        invalidateSessions?: (userId: string) => Promise<void>;
    });
    /**
     * Enforce that the requesting user has admin or moderator role.
     * Rejects with 403 if the user lacks sufficient permissions.
     *
     * Requirement 11.5: Non-admin/moderator users are rejected with insufficient permissions error.
     */
    enforceAdminRole(role: UserRole): void;
    /**
     * Get dashboard analytics for the trailing period (default 30 days).
     *
     * Requirement 11.1: Display platform analytics for the trailing 30-day period
     * including total active users, total posts, total comments, and total likes.
     */
    getDashboardAnalytics(role: UserRole, period?: number): Promise<DashboardAnalytics>;
    /**
     * Report content for moderation review.
     *
     * Requirement 11.2: Create a report record containing the reporter's user ID,
     * the reported content ID, a reason category, and a timestamp.
     */
    reportContent(reporterId: number, contentId: number, contentType: ContentType, reason: ReportReason): Promise<ReportRecord>;
    /**
     * Review a reported content item and take moderation action.
     *
     * Requirement 11.3: Allow actions: dismiss, warn user, remove content, or suspend user.
     * Record the moderator's ID, the action taken, and a timestamp on the report record.
     */
    reviewReport(reportId: number, moderatorId: number, action: ModerationAction, moderatorRole: UserRole): Promise<ReportRecord>;
    /**
     * Search for a user and return their profile, activity history, and reports.
     *
     * Requirement 11.4: Return the user's profile, the most recent 100 activity entries
     * (posts, comments, and likes), and any reports filed against them.
     */
    searchUser(query: string, role: UserRole): Promise<AdminUserView[]>;
    /**
     * Suspend a user account and invalidate all their sessions.
     *
     * Requirement 11.6: Record the suspension as indefinite until manually lifted,
     * and invalidate all active sessions within 30 seconds.
     */
    suspendUser(userId: number, adminId: number, adminRole: UserRole): Promise<void>;
    /**
     * Lift a user's suspension.
     *
     * Requirement 11.6: Suspension is indefinite until manually lifted.
     */
    liftSuspension(userId: number, _adminId: number, adminRole: UserRole): Promise<void>;
    /**
     * Get the owner user ID of a piece of content.
     */
    private getContentOwnerId;
}
//# sourceMappingURL=admin.service.d.ts.map