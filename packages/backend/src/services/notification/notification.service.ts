/**
 * Notification service handling creation, delivery, and management of notifications.
 *
 * Requirements covered:
 * - 8.1: Create notification record and deliver via Socket.IO within 2 seconds
 * - 8.2: Queue for offline users, deliver on reconnection
 * - 8.3: Mark single notification as read
 * - 8.4: Batch mark all unread as read
 * - 8.5: Support push notifications using web push protocol
 * - 8.6: Retain notification in unread list if push fails after 3 retries
 * - 8.7: Suppress delivery based on user preferences (per event type, per channel)
 * - 8.8: Return in reverse chronological order with cursor pagination (default 20, max 50)
 * - 8.9: Return unread notification count
 */

import { NotificationRepository } from './notification.repository';
import {
  CreateNotificationDTO,
  Notification,
  NotificationError,
  NotificationPreference,
  NotificationPreferenceInput,
  NoOpPushAdapter,
  NoOpSocketAdapter,
  PaginatedNotifications,
  PushDeliveryAdapter,
  PushPayload,
  SocketDeliveryAdapter,
} from './types';

/** Maximum number of push delivery retry attempts (Requirement 8.6) */
const PUSH_MAX_RETRIES = 3;

export class NotificationService {
  private readonly repository: NotificationRepository;
  private readonly socketAdapter: SocketDeliveryAdapter;
  private readonly pushAdapter: PushDeliveryAdapter;

  constructor(options?: {
    repository?: NotificationRepository;
    socketAdapter?: SocketDeliveryAdapter;
    pushAdapter?: PushDeliveryAdapter;
  }) {
    this.repository = options?.repository || new NotificationRepository();
    this.socketAdapter = options?.socketAdapter || new NoOpSocketAdapter();
    this.pushAdapter = options?.pushAdapter || new NoOpPushAdapter();
  }

  /**
   * Create a notification for a triggering event and attempt real-time delivery.
   *
   * Creates a notification record containing the event type, source user identifier,
   * target user identifier, referenced content identifier, and timestamp.
   *
   * Before delivery, checks user preferences (Requirement 8.7):
   * - If in-app delivery is disabled for this event type, suppresses Socket.IO delivery
   * - If push delivery is disabled for this event type, suppresses push delivery
   *
   * Delivers via Socket.IO within 2 seconds if the user is connected and in-app is enabled.
   * Sends push notification if push is enabled for this event type.
   * If the user is offline, the notification is queued (stored in DB) for
   * delivery on reconnection.
   *
   * Requirement 8.1: Create and deliver notification
   * Requirement 8.2: Queue for offline users
   * Requirement 8.7: Suppress delivery based on preferences
   *
   * @param data - The notification creation data
   * @returns The created notification record
   */
  async create(data: CreateNotificationDTO): Promise<Notification> {
    // Validate required fields
    if (!data.userId) {
      throw new NotificationError('User ID is required', 400, {
        message: 'Target user ID must be provided',
      });
    }

    if (!data.eventType) {
      throw new NotificationError('Event type is required', 400, {
        message: 'Notification event type must be provided',
      });
    }

    // Check user preferences before delivery (Requirement 8.7)
    const preference = await this.repository.getPreference(data.userId, data.eventType);

    // Determine channel enablement (defaults to enabled if no preference set)
    const inAppEnabled = preference ? preference.in_app_enabled : true;
    const pushEnabled = preference ? preference.push_enabled : true;

    // If both channels are disabled, still create the record but suppress all delivery
    // The notification record is always created for audit/history purposes

    // Create the notification record in the database
    const notification = await this.repository.create({
      user_id: data.userId,
      source_user_id: data.sourceUserId ?? null,
      event_type: data.eventType,
      reference_id: data.referenceId ?? null,
      reference_type: data.referenceType ?? null,
    });

    // Attempt in-app delivery via Socket.IO (Requirement 8.1)
    // Suppressed if in-app is disabled for this event type (Requirement 8.7)
    if (inAppEnabled && this.socketAdapter.isUserConnected(data.userId)) {
      this.socketAdapter.deliverNotification(data.userId, notification);
    }

    // Attempt push delivery if enabled (Requirement 8.5)
    // Suppressed if push is disabled for this event type (Requirement 8.7)
    if (pushEnabled) {
      // Fire and forget - push delivery happens asynchronously with retries
      this.sendPush(data.userId, notification).catch(() => {
        // Push failure is handled internally (retained in unread list per Requirement 8.6)
      });
    }

    return notification;
  }

  /**
   * Get notifications for a user in reverse chronological order with cursor pagination.
   *
   * Default page size: 20, maximum: 50 (Requirement 8.8).
   * Uses cursor-based pagination where the cursor is the last notification ID.
   *
   * @param userId - The user whose notifications to retrieve
   * @param cursor - Optional cursor (notification ID) for pagination
   * @param limit - Optional page size (default 20, max 50)
   * @returns Paginated notifications in reverse chronological order
   */
  async getNotifications(
    userId: number,
    cursor?: string | null,
    limit?: number
  ): Promise<PaginatedNotifications> {
    if (!userId) {
      throw new NotificationError('User ID is required', 400, {
        message: 'User ID must be provided',
      });
    }

    return this.repository.getByUserId(userId, cursor, limit);
  }

  /**
   * Mark a single notification as read (Requirement 8.3).
   *
   * Updates the read status and returns confirmation.
   * Only the notification owner can mark it as read.
   *
   * @param notificationId - The notification to mark as read
   * @param userId - The user who owns the notification
   * @throws NotificationError if notification not found or doesn't belong to user
   */
  async markAsRead(notificationId: number, userId: number): Promise<void> {
    if (!notificationId) {
      throw new NotificationError('Notification ID is required', 400, {
        message: 'Notification ID must be provided',
      });
    }

    if (!userId) {
      throw new NotificationError('User ID is required', 400, {
        message: 'User ID must be provided',
      });
    }

    // Verify the notification exists and belongs to the user
    const notification = await this.repository.findById(notificationId);
    if (!notification) {
      throw new NotificationError('Notification not found', 404, {
        message: 'The specified notification does not exist',
      });
    }

    if (notification.user_id !== userId) {
      throw new NotificationError('Notification not found', 404, {
        message: 'The specified notification does not exist',
      });
    }

    await this.repository.markAsRead(notificationId, userId);
  }

  /**
   * Mark all unread notifications as read for a user (Requirement 8.4).
   *
   * Batch-updates all unread notifications belonging to the user to read status.
   *
   * @param userId - The user whose notifications to mark as read
   * @returns The number of notifications marked as read
   */
  async markAllAsRead(userId: number): Promise<number> {
    if (!userId) {
      throw new NotificationError('User ID is required', 400, {
        message: 'User ID must be provided',
      });
    }

    return this.repository.markAllAsRead(userId);
  }

  /**
   * Get the total number of unread notifications for a user (Requirement 8.9).
   *
   * @param userId - The user whose unread count to retrieve
   * @returns The count of unread notifications
   */
  async getUnreadCount(userId: number): Promise<number> {
    if (!userId) {
      throw new NotificationError('User ID is required', 400, {
        message: 'User ID must be provided',
      });
    }

    return this.repository.getUnreadCount(userId);
  }

  /**
   * Deliver queued notifications to a user on reconnection (Requirement 8.2).
   *
   * Called when a user reconnects via Socket.IO. Retrieves all unread
   * notifications and delivers them through the socket adapter.
   *
   * @param userId - The user who just reconnected
   * @returns The notifications that were delivered
   */
  async deliverOnReconnection(userId: number): Promise<Notification[]> {
    if (!userId) {
      return [];
    }

    const undelivered = await this.repository.getUndelivered(userId);

    for (const notification of undelivered) {
      this.socketAdapter.deliverNotification(userId, notification);
    }

    return undelivered;
  }

  /**
   * Update notification preferences for a user (Requirement 8.7).
   *
   * Allows the user to configure per-event-type, per-channel (in-app, push)
   * delivery preferences. When a channel is disabled for an event type,
   * the NotificationService will suppress delivery for that channel.
   *
   * @param userId - The user whose preferences to update
   * @param preferences - Array of preference settings per event type
   */
  async updatePreferences(
    userId: number,
    preferences: NotificationPreferenceInput[]
  ): Promise<NotificationPreference[]> {
    if (!userId) {
      throw new NotificationError('User ID is required', 400, {
        message: 'User ID must be provided',
      });
    }

    if (!preferences || preferences.length === 0) {
      throw new NotificationError('Preferences are required', 400, {
        message: 'At least one preference must be provided',
      });
    }

    const results: NotificationPreference[] = [];

    for (const pref of preferences) {
      if (!pref.eventType) {
        throw new NotificationError('Event type is required', 400, {
          message: 'Each preference must specify an event type',
        });
      }

      const result = await this.repository.upsertPreference({
        user_id: userId,
        event_type: pref.eventType,
        in_app_enabled: pref.inAppEnabled,
        push_enabled: pref.pushEnabled,
      });

      results.push(result);
    }

    return results;
  }

  /**
   * Get notification preferences for a user (Requirement 8.7).
   *
   * Returns all configured preferences. Event types without explicit
   * preferences default to enabled for all channels.
   *
   * @param userId - The user whose preferences to retrieve
   * @returns Array of notification preferences
   */
  async getPreferences(userId: number): Promise<NotificationPreference[]> {
    if (!userId) {
      throw new NotificationError('User ID is required', 400, {
        message: 'User ID must be provided',
      });
    }

    return this.repository.getPreferences(userId);
  }

  /**
   * Send a web push notification with 3-retry logic (Requirements 8.5, 8.6).
   *
   * Attempts to deliver a push notification to the user's registered device.
   * If delivery fails, retries up to 3 times total.
   * If all 3 attempts fail, the notification is retained in the user's
   * unread notification list for retrieval on next access.
   *
   * @param userId - The user to send the push notification to
   * @param notification - The notification to deliver via push
   * @returns true if push was delivered successfully, false if all retries failed
   */
  async sendPush(userId: number, notification: Notification): Promise<boolean> {
    if (!userId || !notification) {
      return false;
    }

    const payload: PushPayload = {
      title: this.getPushTitle(notification.event_type),
      body: this.getPushBody(notification.event_type),
      notificationId: notification.id,
      eventType: notification.event_type,
      referenceId: notification.reference_id,
      referenceType: notification.reference_type,
    };

    // Attempt delivery with 3 retries (Requirement 8.6)
    for (let attempt = 1; attempt <= PUSH_MAX_RETRIES; attempt++) {
      try {
        const success = await this.pushAdapter.sendPush(userId, payload);
        if (success) {
          return true;
        }
      } catch {
        // Continue to next retry attempt
      }

      // Don't wait after the last attempt
      if (attempt < PUSH_MAX_RETRIES) {
        await this.delay(attempt * 1000); // Simple linear backoff: 1s, 2s
      }
    }

    // All 3 attempts failed - notification remains in unread list (Requirement 8.6)
    // The notification is already persisted in the DB as unread, so it will be
    // available for retrieval on next access.
    return false;
  }

  /**
   * Generate a push notification title based on event type.
   */
  private getPushTitle(eventType: string): string {
    const titles: Record<string, string> = {
      like: 'New Like',
      comment: 'New Comment',
      message: 'New Message',
      follow: 'New Follower',
      mention: 'You were mentioned',
      friend_request: 'Friend Request',
    };
    return titles[eventType] || 'New Notification';
  }

  /**
   * Generate a push notification body based on event type.
   */
  private getPushBody(eventType: string): string {
    const bodies: Record<string, string> = {
      like: 'Someone liked your post',
      comment: 'Someone commented on your post',
      message: 'You have a new message',
      follow: 'Someone started following you',
      mention: 'You were mentioned in a post',
      friend_request: 'You have a new friend request',
    };
    return bodies[eventType] || 'You have a new notification';
  }

  /**
   * Delay utility for retry backoff.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
