/**
 * Notification repository for database access.
 *
 * Handles CRUD operations on the notifications table with:
 * - Cursor-based pagination in reverse chronological order (Requirement 8.8)
 * - Unread count queries (Requirement 8.9)
 * - Mark as read (single and batch) (Requirements 8.3, 8.4)
 */
import { Knex } from 'knex';
import { Notification, NotificationEventType, NotificationPreference, NotificationReferenceType, PaginatedNotifications } from './types';
export declare class NotificationRepository {
    private readonly db;
    private readonly tableName;
    private readonly preferencesTable;
    constructor(options?: {
        db?: Knex;
    });
    /**
     * Insert a new notification record.
     * Returns the created notification with its generated ID and timestamp.
     */
    create(data: {
        user_id: number;
        source_user_id: number | null;
        event_type: NotificationEventType;
        reference_id: number | null;
        reference_type: NotificationReferenceType | null;
    }): Promise<Notification>;
    /**
     * Find a notification by ID.
     */
    findById(id: number): Promise<Notification | undefined>;
    /**
     * Get notifications for a user in reverse chronological order with cursor pagination.
     * Default page size: 20, max: 50 (Requirement 8.8).
     *
     * Cursor is based on the notification ID (descending order).
     */
    getByUserId(userId: number, cursor?: string | null, limit?: number): Promise<PaginatedNotifications>;
    /**
     * Mark a single notification as read (Requirement 8.3).
     * Only marks if the notification belongs to the specified user.
     * Returns the number of affected rows.
     */
    markAsRead(notificationId: number, userId: number): Promise<number>;
    /**
     * Mark all unread notifications as read for a user (Requirement 8.4).
     * Returns the number of affected rows.
     */
    markAllAsRead(userId: number): Promise<number>;
    /**
     * Get the count of unread notifications for a user (Requirement 8.9).
     */
    getUnreadCount(userId: number): Promise<number>;
    /**
     * Get all unread notifications for a user (for offline delivery on reconnection).
     * Returns notifications in reverse chronological order.
     */
    getUndelivered(userId: number): Promise<Notification[]>;
    /**
     * Get notification preferences for a user (Requirement 8.7).
     * Returns all configured preferences for the user.
     */
    getPreferences(userId: number): Promise<NotificationPreference[]>;
    /**
     * Get a single preference for a user and event type.
     */
    getPreference(userId: number, eventType: NotificationEventType): Promise<NotificationPreference | undefined>;
    /**
     * Upsert a notification preference for a user and event type (Requirement 8.7).
     * If a preference already exists for the user/event_type pair, it is updated.
     * Otherwise, a new record is created.
     */
    upsertPreference(data: {
        user_id: number;
        event_type: NotificationEventType;
        in_app_enabled: boolean;
        push_enabled: boolean;
    }): Promise<NotificationPreference>;
    /**
     * Normalize pagination limit to be within bounds.
     * Default: 20, Min: 1, Max: 50.
     */
    private normalizePaginationLimit;
}
//# sourceMappingURL=notification.repository.d.ts.map