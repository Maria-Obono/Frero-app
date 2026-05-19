"use strict";
/**
 * Notification repository for database access.
 *
 * Handles CRUD operations on the notifications table with:
 * - Cursor-based pagination in reverse chronological order (Requirement 8.8)
 * - Unread count queries (Requirement 8.9)
 * - Mark as read (single and batch) (Requirements 8.3, 8.4)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationRepository = void 0;
const connection_1 = require("../../database/connection");
/** Default page size for notification pagination (Requirement 8.8) */
const DEFAULT_PAGE_SIZE = 20;
/** Maximum page size for notification pagination (Requirement 8.8) */
const MAX_PAGE_SIZE = 50;
class NotificationRepository {
    db;
    tableName = 'notifications';
    preferencesTable = 'notification_preferences';
    constructor(options) {
        this.db = options?.db || (0, connection_1.getDatabase)();
    }
    /**
     * Insert a new notification record.
     * Returns the created notification with its generated ID and timestamp.
     */
    async create(data) {
        const [id] = await this.db(this.tableName).insert({
            user_id: data.user_id,
            source_user_id: data.source_user_id,
            event_type: data.event_type,
            reference_id: data.reference_id,
            reference_type: data.reference_type,
            is_read: false,
        });
        const notification = await this.db(this.tableName).where('id', id).first();
        return notification;
    }
    /**
     * Find a notification by ID.
     */
    async findById(id) {
        const result = await this.db(this.tableName).where('id', id).first();
        return result;
    }
    /**
     * Get notifications for a user in reverse chronological order with cursor pagination.
     * Default page size: 20, max: 50 (Requirement 8.8).
     *
     * Cursor is based on the notification ID (descending order).
     */
    async getByUserId(userId, cursor, limit) {
        const pageSize = this.normalizePaginationLimit(limit);
        const qb = this.db(this.tableName)
            .where('user_id', userId)
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc');
        if (cursor) {
            const cursorId = parseInt(cursor, 10);
            if (!isNaN(cursorId)) {
                qb.where('id', '<', cursorId);
            }
        }
        qb.limit(pageSize + 1);
        const results = (await qb);
        const hasMore = results.length > pageSize;
        const data = hasMore ? results.slice(0, pageSize) : results;
        const nextCursor = data.length > 0 ? String(data[data.length - 1].id) : null;
        return {
            data,
            cursor: hasMore ? nextCursor : null,
            hasMore,
        };
    }
    /**
     * Mark a single notification as read (Requirement 8.3).
     * Only marks if the notification belongs to the specified user.
     * Returns the number of affected rows.
     */
    async markAsRead(notificationId, userId) {
        return this.db(this.tableName)
            .where('id', notificationId)
            .where('user_id', userId)
            .where('is_read', false)
            .update({ is_read: true });
    }
    /**
     * Mark all unread notifications as read for a user (Requirement 8.4).
     * Returns the number of affected rows.
     */
    async markAllAsRead(userId) {
        return this.db(this.tableName)
            .where('user_id', userId)
            .where('is_read', false)
            .update({ is_read: true });
    }
    /**
     * Get the count of unread notifications for a user (Requirement 8.9).
     */
    async getUnreadCount(userId) {
        const result = await this.db(this.tableName)
            .where('user_id', userId)
            .where('is_read', false)
            .count('* as count')
            .first();
        return Number(result?.count) || 0;
    }
    /**
     * Get all unread notifications for a user (for offline delivery on reconnection).
     * Returns notifications in reverse chronological order.
     */
    async getUndelivered(userId) {
        return this.db(this.tableName)
            .where('user_id', userId)
            .where('is_read', false)
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc');
    }
    /**
     * Get notification preferences for a user (Requirement 8.7).
     * Returns all configured preferences for the user.
     */
    async getPreferences(userId) {
        return this.db(this.preferencesTable)
            .where('user_id', userId);
    }
    /**
     * Get a single preference for a user and event type.
     */
    async getPreference(userId, eventType) {
        const result = await this.db(this.preferencesTable)
            .where('user_id', userId)
            .where('event_type', eventType)
            .first();
        return result;
    }
    /**
     * Upsert a notification preference for a user and event type (Requirement 8.7).
     * If a preference already exists for the user/event_type pair, it is updated.
     * Otherwise, a new record is created.
     */
    async upsertPreference(data) {
        const existing = await this.db(this.preferencesTable)
            .where('user_id', data.user_id)
            .where('event_type', data.event_type)
            .first();
        if (existing) {
            await this.db(this.preferencesTable)
                .where('id', existing.id)
                .update({
                in_app_enabled: data.in_app_enabled,
                push_enabled: data.push_enabled,
                updated_at: this.db.fn.now(),
            });
            const updated = await this.db(this.preferencesTable)
                .where('id', existing.id)
                .first();
            return updated;
        }
        else {
            const [id] = await this.db(this.preferencesTable).insert({
                user_id: data.user_id,
                event_type: data.event_type,
                in_app_enabled: data.in_app_enabled,
                push_enabled: data.push_enabled,
            });
            const created = await this.db(this.preferencesTable)
                .where('id', id)
                .first();
            return created;
        }
    }
    /**
     * Normalize pagination limit to be within bounds.
     * Default: 20, Min: 1, Max: 50.
     */
    normalizePaginationLimit(limit) {
        if (limit === undefined || limit === null) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
    }
}
exports.NotificationRepository = NotificationRepository;
//# sourceMappingURL=notification.repository.js.map