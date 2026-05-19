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
import { CreateNotificationDTO, Notification, NotificationPreference, NotificationPreferenceInput, PaginatedNotifications, PushDeliveryAdapter, SocketDeliveryAdapter } from './types';
export declare class NotificationService {
    private readonly repository;
    private readonly socketAdapter;
    private readonly pushAdapter;
    constructor(options?: {
        repository?: NotificationRepository;
        socketAdapter?: SocketDeliveryAdapter;
        pushAdapter?: PushDeliveryAdapter;
    });
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
    create(data: CreateNotificationDTO): Promise<Notification>;
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
    getNotifications(userId: number, cursor?: string | null, limit?: number): Promise<PaginatedNotifications>;
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
    markAsRead(notificationId: number, userId: number): Promise<void>;
    /**
     * Mark all unread notifications as read for a user (Requirement 8.4).
     *
     * Batch-updates all unread notifications belonging to the user to read status.
     *
     * @param userId - The user whose notifications to mark as read
     * @returns The number of notifications marked as read
     */
    markAllAsRead(userId: number): Promise<number>;
    /**
     * Get the total number of unread notifications for a user (Requirement 8.9).
     *
     * @param userId - The user whose unread count to retrieve
     * @returns The count of unread notifications
     */
    getUnreadCount(userId: number): Promise<number>;
    /**
     * Deliver queued notifications to a user on reconnection (Requirement 8.2).
     *
     * Called when a user reconnects via Socket.IO. Retrieves all unread
     * notifications and delivers them through the socket adapter.
     *
     * @param userId - The user who just reconnected
     * @returns The notifications that were delivered
     */
    deliverOnReconnection(userId: number): Promise<Notification[]>;
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
    updatePreferences(userId: number, preferences: NotificationPreferenceInput[]): Promise<NotificationPreference[]>;
    /**
     * Get notification preferences for a user (Requirement 8.7).
     *
     * Returns all configured preferences. Event types without explicit
     * preferences default to enabled for all channels.
     *
     * @param userId - The user whose preferences to retrieve
     * @returns Array of notification preferences
     */
    getPreferences(userId: number): Promise<NotificationPreference[]>;
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
    sendPush(userId: number, notification: Notification): Promise<boolean>;
    /**
     * Generate a push notification title based on event type.
     */
    private getPushTitle;
    /**
     * Generate a push notification body based on event type.
     */
    private getPushBody;
    /**
     * Delay utility for retry backoff.
     */
    private delay;
}
//# sourceMappingURL=notification.service.d.ts.map