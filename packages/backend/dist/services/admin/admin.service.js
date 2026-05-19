"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const admin_repository_1 = require("./admin.repository");
const redis_utils_1 = require("../../utils/redis-utils");
const types_1 = require("./types");
const VALID_REASONS = [
    'spam',
    'harassment',
    'inappropriate',
    'violence',
    'misinformation',
    'other',
];
const VALID_ACTIONS = ['dismiss', 'warn', 'remove_content', 'suspend_user'];
const VALID_CONTENT_TYPES = [
    'post',
    'reel',
    'comment',
    'story',
    'user',
    'message',
];
const ADMIN_ROLES = ['admin', 'moderator'];
class AdminService {
    repository;
    invalidateSessions;
    constructor(options) {
        this.repository = options?.repository || new admin_repository_1.AdminRepository();
        this.invalidateSessions = options?.invalidateSessions || redis_utils_1.deleteAllUserSessions;
    }
    /**
     * Enforce that the requesting user has admin or moderator role.
     * Rejects with 403 if the user lacks sufficient permissions.
     *
     * Requirement 11.5: Non-admin/moderator users are rejected with insufficient permissions error.
     */
    enforceAdminRole(role) {
        if (!ADMIN_ROLES.includes(role)) {
            throw new types_1.AdminServiceError('Insufficient permissions', 403, {
                message: 'Access denied. Admin or moderator role required.',
                code: 'INSUFFICIENT_PERMISSIONS',
            });
        }
    }
    /**
     * Get dashboard analytics for the trailing period (default 30 days).
     *
     * Requirement 11.1: Display platform analytics for the trailing 30-day period
     * including total active users, total posts, total comments, and total likes.
     */
    async getDashboardAnalytics(role, period = 30) {
        this.enforceAdminRole(role);
        if (period < 1 || period > 365) {
            throw new types_1.AdminServiceError('Invalid period', 400, {
                message: 'Period must be between 1 and 365 days',
                code: 'INVALID_PERIOD',
            });
        }
        const since = new Date();
        since.setDate(since.getDate() - period);
        const [activeUsers, totalPosts, totalComments, totalLikes] = await Promise.all([
            this.repository.getActiveUsersCount(since),
            this.repository.getPostsCount(since),
            this.repository.getCommentsCount(since),
            this.repository.getLikesCount(since),
        ]);
        return {
            period,
            activeUsers,
            totalPosts,
            totalComments,
            totalLikes,
        };
    }
    /**
     * Report content for moderation review.
     *
     * Requirement 11.2: Create a report record containing the reporter's user ID,
     * the reported content ID, a reason category, and a timestamp.
     */
    async reportContent(reporterId, contentId, contentType, reason) {
        // Validate reason
        if (!VALID_REASONS.includes(reason)) {
            throw new types_1.AdminServiceError('Invalid report reason', 400, {
                message: `Reason must be one of: ${VALID_REASONS.join(', ')}`,
                code: 'INVALID_REASON',
            });
        }
        // Validate content type
        if (!VALID_CONTENT_TYPES.includes(contentType)) {
            throw new types_1.AdminServiceError('Invalid content type', 400, {
                message: `Content type must be one of: ${VALID_CONTENT_TYPES.join(', ')}`,
                code: 'INVALID_CONTENT_TYPE',
            });
        }
        if (!reporterId || reporterId <= 0) {
            throw new types_1.AdminServiceError('Invalid reporter ID', 400, {
                message: 'Reporter ID must be a positive integer',
                code: 'INVALID_REPORTER_ID',
            });
        }
        if (!contentId || contentId <= 0) {
            throw new types_1.AdminServiceError('Invalid content ID', 400, {
                message: 'Content ID must be a positive integer',
                code: 'INVALID_CONTENT_ID',
            });
        }
        const report = await this.repository.createReport({
            reporter_id: reporterId,
            content_id: contentId,
            content_type: contentType,
            reason,
        });
        return report;
    }
    /**
     * Review a reported content item and take moderation action.
     *
     * Requirement 11.3: Allow actions: dismiss, warn user, remove content, or suspend user.
     * Record the moderator's ID, the action taken, and a timestamp on the report record.
     */
    async reviewReport(reportId, moderatorId, action, moderatorRole) {
        this.enforceAdminRole(moderatorRole);
        // Validate action
        if (!VALID_ACTIONS.includes(action)) {
            throw new types_1.AdminServiceError('Invalid moderation action', 400, {
                message: `Action must be one of: ${VALID_ACTIONS.join(', ')}`,
                code: 'INVALID_ACTION',
            });
        }
        // Find the report
        const report = await this.repository.findReportById(reportId);
        if (!report) {
            throw new types_1.AdminServiceError('Report not found', 404, {
                message: 'The specified report does not exist',
                code: 'REPORT_NOT_FOUND',
            });
        }
        if (report.status !== 'pending') {
            throw new types_1.AdminServiceError('Report already reviewed', 409, {
                message: 'This report has already been reviewed',
                code: 'REPORT_ALREADY_REVIEWED',
            });
        }
        // Determine status based on action
        const status = action === 'dismiss' ? 'dismissed' : 'reviewed';
        // Execute the moderation action
        if (action === 'remove_content') {
            await this.repository.removeContent(report.content_id, report.content_type);
        }
        else if (action === 'suspend_user') {
            // Need to find the content owner to suspend them
            const contentOwnerUserId = await this.getContentOwnerId(report.content_id, report.content_type);
            if (contentOwnerUserId) {
                await this.repository.suspendUser(contentOwnerUserId);
                await this.invalidateSessions(String(contentOwnerUserId));
            }
        }
        // Update the report record
        const updatedReport = await this.repository.updateReport(reportId, {
            moderator_id: moderatorId,
            action_taken: action,
            status,
            reviewed_at: new Date(),
        });
        return updatedReport;
    }
    /**
     * Search for a user and return their profile, activity history, and reports.
     *
     * Requirement 11.4: Return the user's profile, the most recent 100 activity entries
     * (posts, comments, and likes), and any reports filed against them.
     */
    async searchUser(query, role) {
        this.enforceAdminRole(role);
        if (!query || query.trim().length === 0) {
            throw new types_1.AdminServiceError('Search query required', 400, {
                message: 'A search query is required',
                code: 'QUERY_REQUIRED',
            });
        }
        const users = await this.repository.searchUsers(query.trim());
        const results = await Promise.all(users.map(async (user) => {
            const [activity, reports] = await Promise.all([
                this.repository.getUserActivity(user.id),
                this.repository.getReportsForUser(user.id),
            ]);
            return {
                id: user.id,
                email: user.email,
                username: user.username,
                display_name: user.display_name,
                avatar_url: user.avatar_url,
                role: user.role,
                created_at: user.created_at,
                is_suspended: user.locked_until
                    ? new Date(user.locked_until) > new Date()
                    : false,
                activity,
                reports,
            };
        }));
        return results;
    }
    /**
     * Suspend a user account and invalidate all their sessions.
     *
     * Requirement 11.6: Record the suspension as indefinite until manually lifted,
     * and invalidate all active sessions within 30 seconds.
     */
    async suspendUser(userId, adminId, adminRole) {
        this.enforceAdminRole(adminRole);
        // Verify the target user exists
        const user = await this.repository.findUserById(userId);
        if (!user) {
            throw new types_1.AdminServiceError('User not found', 404, {
                message: 'The specified user does not exist',
                code: 'USER_NOT_FOUND',
            });
        }
        // Prevent suspending other admins (only admins can suspend moderators)
        if (user.role === 'admin' && adminRole !== 'admin') {
            throw new types_1.AdminServiceError('Cannot suspend admin', 403, {
                message: 'Only admins can suspend other admin accounts',
                code: 'CANNOT_SUSPEND_ADMIN',
            });
        }
        // Cannot suspend yourself
        if (userId === adminId) {
            throw new types_1.AdminServiceError('Cannot suspend self', 400, {
                message: 'You cannot suspend your own account',
                code: 'CANNOT_SUSPEND_SELF',
            });
        }
        // Suspend the user
        await this.repository.suspendUser(userId);
        // Invalidate all sessions within 30s (immediate execution)
        await this.invalidateSessions(String(userId));
    }
    /**
     * Lift a user's suspension.
     *
     * Requirement 11.6: Suspension is indefinite until manually lifted.
     */
    async liftSuspension(userId, _adminId, adminRole) {
        this.enforceAdminRole(adminRole);
        // Verify the target user exists
        const user = await this.repository.findUserById(userId);
        if (!user) {
            throw new types_1.AdminServiceError('User not found', 404, {
                message: 'The specified user does not exist',
                code: 'USER_NOT_FOUND',
            });
        }
        // Lift the suspension
        await this.repository.liftSuspension(userId);
    }
    /**
     * Get the owner user ID of a piece of content.
     */
    async getContentOwnerId(contentId, contentType) {
        const db = this.repository.getDb();
        switch (contentType) {
            case 'post': {
                const post = await db('posts').where('id', contentId).select('user_id').first();
                return post?.user_id || null;
            }
            case 'reel': {
                const reel = await db('reels').where('id', contentId).select('user_id').first();
                return reel?.user_id || null;
            }
            case 'comment': {
                const comment = await db('comments').where('id', contentId).select('user_id').first();
                return comment?.user_id || null;
            }
            case 'story': {
                const story = await db('stories').where('id', contentId).select('user_id').first();
                return story?.user_id || null;
            }
            case 'message': {
                const message = await db('messages').where('id', contentId).select('sender_id').first();
                return message?.sender_id || null;
            }
            case 'user':
                return contentId;
            default:
                return null;
        }
    }
}
exports.AdminService = AdminService;
//# sourceMappingURL=admin.service.js.map