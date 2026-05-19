/**
 * Notification repository for database access.
 *
 * Handles CRUD operations on the notifications table with:
 * - Cursor-based pagination in reverse chronological order (Requirement 8.8)
 * - Unread count queries (Requirement 8.9)
 * - Mark as read (single and batch) (Requirements 8.3, 8.4)
 */

import { Knex } from 'knex';
import { getDatabase } from '../../database/connection';
import {
  Notification,
  NotificationEventType,
  NotificationPreference,
  NotificationReferenceType,
  PaginatedNotifications,
} from './types';

/** Default page size for notification pagination (Requirement 8.8) */
const DEFAULT_PAGE_SIZE = 20;

/** Maximum page size for notification pagination (Requirement 8.8) */
const MAX_PAGE_SIZE = 50;

export class NotificationRepository {
  private readonly db: Knex;
  private readonly tableName = 'notifications';
  private readonly preferencesTable = 'notification_preferences';

  constructor(options?: { db?: Knex }) {
    this.db = options?.db || getDatabase();
  }

  /**
   * Insert a new notification record.
   * Returns the created notification with its generated ID and timestamp.
   */
  async create(data: {
    user_id: number;
    source_user_id: number | null;
    event_type: NotificationEventType;
    reference_id: number | null;
    reference_type: NotificationReferenceType | null;
  }): Promise<Notification> {
    const [id] = await this.db(this.tableName).insert({
      user_id: data.user_id,
      source_user_id: data.source_user_id,
      event_type: data.event_type,
      reference_id: data.reference_id,
      reference_type: data.reference_type,
      is_read: false,
    });

    const notification = await this.db(this.tableName).where('id', id).first();
    return notification as Notification;
  }

  /**
   * Find a notification by ID.
   */
  async findById(id: number): Promise<Notification | undefined> {
    const result = await this.db(this.tableName).where('id', id).first();
    return result as Notification | undefined;
  }

  /**
   * Get notifications for a user in reverse chronological order with cursor pagination.
   * Default page size: 20, max: 50 (Requirement 8.8).
   *
   * Cursor is based on the notification ID (descending order).
   */
  async getByUserId(
    userId: number,
    cursor?: string | null,
    limit?: number
  ): Promise<PaginatedNotifications> {
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

    const results = (await qb) as Notification[];
    const hasMore = results.length > pageSize;
    const data = hasMore ? results.slice(0, pageSize) : results;
    const nextCursor = data.length > 0 ? String(data[data.length - 1]!.id) : null;

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
  async markAsRead(notificationId: number, userId: number): Promise<number> {
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
  async markAllAsRead(userId: number): Promise<number> {
    return this.db(this.tableName)
      .where('user_id', userId)
      .where('is_read', false)
      .update({ is_read: true });
  }

  /**
   * Get the count of unread notifications for a user (Requirement 8.9).
   */
  async getUnreadCount(userId: number): Promise<number> {
    const result = await this.db(this.tableName)
      .where('user_id', userId)
      .where('is_read', false)
      .count('* as count')
      .first();

    return Number((result as any)?.count) || 0;
  }

  /**
   * Get all unread notifications for a user (for offline delivery on reconnection).
   * Returns notifications in reverse chronological order.
   */
  async getUndelivered(userId: number): Promise<Notification[]> {
    return this.db(this.tableName)
      .where('user_id', userId)
      .where('is_read', false)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc') as unknown as Notification[];
  }

  /**
   * Get notification preferences for a user (Requirement 8.7).
   * Returns all configured preferences for the user.
   */
  async getPreferences(userId: number): Promise<NotificationPreference[]> {
    return this.db(this.preferencesTable)
      .where('user_id', userId) as unknown as NotificationPreference[];
  }

  /**
   * Get a single preference for a user and event type.
   */
  async getPreference(
    userId: number,
    eventType: NotificationEventType
  ): Promise<NotificationPreference | undefined> {
    const result = await this.db(this.preferencesTable)
      .where('user_id', userId)
      .where('event_type', eventType)
      .first();
    return result as NotificationPreference | undefined;
  }

  /**
   * Upsert a notification preference for a user and event type (Requirement 8.7).
   * If a preference already exists for the user/event_type pair, it is updated.
   * Otherwise, a new record is created.
   */
  async upsertPreference(data: {
    user_id: number;
    event_type: NotificationEventType;
    in_app_enabled: boolean;
    push_enabled: boolean;
  }): Promise<NotificationPreference> {
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
      return updated as NotificationPreference;
    } else {
      const [id] = await this.db(this.preferencesTable).insert({
        user_id: data.user_id,
        event_type: data.event_type,
        in_app_enabled: data.in_app_enabled,
        push_enabled: data.push_enabled,
      });

      const created = await this.db(this.preferencesTable)
        .where('id', id)
        .first();
      return created as NotificationPreference;
    }
  }

  /**
   * Normalize pagination limit to be within bounds.
   * Default: 20, Min: 1, Max: 50.
   */
  private normalizePaginationLimit(limit?: number): number {
    if (limit === undefined || limit === null) {
      return DEFAULT_PAGE_SIZE;
    }
    return Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
  }
}
