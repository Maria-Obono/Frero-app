/**
 * Notification service type definitions.
 *
 * Requirements covered:
 * - 8.1: Notification record with event_type, source_user_id, user_id, reference_id, timestamp
 * - 8.2: Queue for offline users, deliver on reconnection
 * - 8.3: Mark as read (single)
 * - 8.4: Mark all as read (batch)
 * - 8.8: Reverse chronological order, cursor pagination (default 20, max 50)
 * - 8.9: Unread count
 */

export type NotificationEventType =
  | 'like'
  | 'comment'
  | 'message'
  | 'follow'
  | 'mention'
  | 'friend_request';

export type NotificationReferenceType =
  | 'post'
  | 'reel'
  | 'comment'
  | 'story'
  | 'chat'
  | 'user';

/**
 * A notification record as stored in the database.
 */
export interface Notification {
  id: number;
  /** The user who receives this notification */
  user_id: number;
  /** The user who triggered this notification (nullable for system events) */
  source_user_id: number | null;
  event_type: NotificationEventType;
  /** ID of the related content (post, comment, chat, etc.) */
  reference_id: number | null;
  reference_type: NotificationReferenceType | null;
  is_read: boolean;
  created_at: Date;
}

/**
 * Input data for creating a new notification.
 */
export interface CreateNotificationDTO {
  /** The user who receives this notification */
  userId: number;
  /** The user who triggered this notification */
  sourceUserId?: number | null;
  eventType: NotificationEventType;
  /** ID of the related content */
  referenceId?: number | null;
  referenceType?: NotificationReferenceType | null;
}

/**
 * Paginated result for notification queries.
 */
export interface PaginatedNotifications {
  data: Notification[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Notification preference for a specific event type and delivery channels.
 * Requirement 8.7: Per event type, per channel (in-app, push) preferences.
 */
export interface NotificationPreference {
  id?: number;
  user_id: number;
  event_type: NotificationEventType;
  in_app_enabled: boolean;
  push_enabled: boolean;
  updated_at?: Date;
}

/**
 * Input for updating notification preferences.
 * Each entry specifies the event type and which channels are enabled.
 */
export interface NotificationPreferenceInput {
  eventType: NotificationEventType;
  inAppEnabled: boolean;
  pushEnabled: boolean;
}

/**
 * Interface for web push delivery adapter.
 * Requirement 8.5: Support push notifications using web push protocol.
 * Requirement 8.6: 3-retry logic for push delivery.
 */
export interface PushDeliveryAdapter {
  /**
   * Send a push notification to a user's registered device.
   * Returns true if delivery succeeded, false otherwise.
   */
  sendPush(userId: number, payload: PushPayload): Promise<boolean>;
}

/**
 * Payload for a web push notification.
 */
export interface PushPayload {
  title: string;
  body: string;
  notificationId: number;
  eventType: NotificationEventType;
  referenceId?: number | null;
  referenceType?: NotificationReferenceType | null;
}

/**
 * A no-op push adapter used when web push is not configured.
 */
export class NoOpPushAdapter implements PushDeliveryAdapter {
  async sendPush(_userId: number, _payload: PushPayload): Promise<boolean> {
    return false;
  }
}

/**
 * Interface for the Socket.IO delivery adapter.
 * The actual Socket.IO integration is implemented in task 13.1.
 * This interface allows the NotificationService to be tested independently.
 */
export interface SocketDeliveryAdapter {
  /**
   * Check if a user is currently connected via Socket.IO.
   */
  isUserConnected(userId: number): boolean;

  /**
   * Deliver a notification to a connected user via Socket.IO.
   * Returns true if delivery was attempted (user was connected).
   */
  deliverNotification(userId: number, notification: Notification): boolean;
}

/**
 * A no-op delivery adapter used when Socket.IO is not yet configured.
 * All notifications are treated as queued (offline delivery).
 */
export class NoOpSocketAdapter implements SocketDeliveryAdapter {
  isUserConnected(_userId: number): boolean {
    return false;
  }

  deliverNotification(_userId: number, _notification: Notification): boolean {
    return false;
  }
}

/**
 * Delivery channels for notifications (Requirement 8.7).
 */
export type NotificationChannel = 'in_app' | 'push';

/**
 * Input for updating notification preferences.
 */
export interface NotificationPreferenceUpdate {
  eventType: NotificationEventType;
  inAppEnabled: boolean;
  pushEnabled: boolean;
}

/**
 * Full notification preferences for a user (all event types).
 */
export interface NotificationPreferences {
  preferences: NotificationPreferenceUpdate[];
}

/**
 * Interface for the notification preference repository.
 * Allows the service to be tested with mocked repositories.
 */
export interface INotificationPreferenceRepository {
  /**
   * Get all preferences for a user.
   */
  getByUserId(userId: number): Promise<NotificationPreference[]>;

  /**
   * Get preference for a specific user and event type.
   */
  getByUserAndEventType(
    userId: number,
    eventType: NotificationEventType
  ): Promise<NotificationPreference | undefined>;

  /**
   * Upsert a preference for a user and event type.
   */
  upsert(
    userId: number,
    eventType: NotificationEventType,
    inAppEnabled: boolean,
    pushEnabled: boolean
  ): Promise<NotificationPreference>;
}

export class NotificationError extends Error {
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'NotificationError';
    this.statusCode = statusCode;
    this.details = details;
  }
}
