/**
 * Admin repository for database operations related to admin/moderation features.
 *
 * Requirements covered:
 * - 11.1: Dashboard analytics queries
 * - 11.2: Report creation
 * - 11.3: Report review/moderation
 * - 11.4: User search with activity history
 * - 11.6: User suspension
 */
import { Knex } from 'knex';
import { ReportRecord, ActivityEntry, ModerationAction, ReportReason, ContentType } from './types';
export declare class AdminRepository {
    private readonly db;
    constructor(options?: {
        db?: Knex;
    });
    /**
     * Get active users count (users who logged in at least once) in the given period.
     * Uses updated_at as a proxy for last activity.
     */
    getActiveUsersCount(since: Date): Promise<number>;
    /**
     * Get total posts created in the given period.
     */
    getPostsCount(since: Date): Promise<number>;
    /**
     * Get total comments created in the given period.
     */
    getCommentsCount(since: Date): Promise<number>;
    /**
     * Get total likes created in the given period.
     */
    getLikesCount(since: Date): Promise<number>;
    /**
     * Create a new content report.
     */
    createReport(data: {
        reporter_id: number;
        content_id: number;
        content_type: ContentType;
        reason: ReportReason;
    }): Promise<ReportRecord>;
    /**
     * Find a report by ID.
     */
    findReportById(reportId: number): Promise<ReportRecord | undefined>;
    /**
     * Update a report with moderation action.
     */
    updateReport(reportId: number, data: {
        moderator_id: number;
        action_taken: ModerationAction;
        status: 'reviewed' | 'dismissed';
        reviewed_at: Date;
    }): Promise<ReportRecord>;
    /**
     * Find a user by ID (including role info).
     */
    findUserById(userId: number): Promise<any | undefined>;
    /**
     * Search users by username or email (partial match).
     */
    searchUsers(query: string): Promise<any[]>;
    /**
     * Get the last 100 activity entries for a user (posts, comments, likes).
     */
    getUserActivity(userId: number): Promise<ActivityEntry[]>;
    /**
     * Get reports filed against a user's content.
     */
    getReportsForUser(userId: number): Promise<ReportRecord[]>;
    /**
     * Suspend a user by setting deleted_at (soft-delete approach for suspension).
     * We use a dedicated approach: set role to 'user' and locked_until to far future.
     */
    suspendUser(userId: number): Promise<void>;
    /**
     * Lift suspension by clearing locked_until.
     */
    liftSuspension(userId: number): Promise<void>;
    /**
     * Soft-delete content by ID and type.
     */
    removeContent(contentId: number, contentType: ContentType): Promise<void>;
    /**
     * Get the database table name for a content type.
     */
    private getTableForContentType;
    /**
     * Get the underlying Knex instance.
     */
    getDb(): Knex;
}
//# sourceMappingURL=admin.repository.d.ts.map