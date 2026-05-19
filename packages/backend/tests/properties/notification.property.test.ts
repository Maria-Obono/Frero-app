import * as fc from 'fast-check';
import { NotificationService } from '../../src/services/notification/notification.service';
import {
  Notification,
  NotificationEventType,
  NotificationPreference,
  NotificationReferenceType,
  PaginatedNotifications,
  PushDeliveryAdapter,
  PushPayload,
  SocketDeliveryAdapter,
} from '../../src/services/notification/types';

// ============================================================================
// Mock Helpers
// ============================================================================

const EVENT_TYPES: NotificationEventType[] = [
  'like',
  'comment',
  'message',
  'follow',
  'mention',
  'friend_request',
];

/**
 * In-memory mock for NotificationRepository.
 * Simulates database behavior for notifications and preferences.
 */
function createMockRepository() {
  let notificationIdCounter = 1;
  let preferenceIdCounter = 1;

  const notifications: Notification[] = [];
  const preferences: NotificationPreference[] = [];

  return {
    _notifications: notifications,
    _preferences: preferences,

    create: jest.fn(async (data: {
      user_id: number;
      source_user_id: number | null;
      event_type: NotificationEventType;
      reference_id: number | null;
      reference_type: NotificationReferenceType | null;
    }): Promise<Notification> => {
      const notification: Notification = {
        id: notificationIdCounter++,
        user_id: data.user_id,
        source_user_id: data.source_user_id,
        event_type: data.event_type,
        reference_id: data.reference_id,
        reference_type: data.reference_type,
        is_read: false,
        created_at: new Date(),
      };
      notifications.push(notification);
      return notification;
    }),

    findById: jest.fn(async (id: number): Promise<Notification | undefined> => {
      return notifications.find((n) => n.id === id);
    }),

    getByUserId: jest.fn(async (
      userId: number,
      cursor?: string | null,
      limit?: number
    ): Promise<PaginatedNotifications> => {
      const pageSize = Math.min(Math.max(limit || 20, 1), 50);

      // Filter by user and sort by created_at desc, then id desc
      let userNotifications = notifications
        .filter((n) => n.user_id === userId)
        .sort((a, b) => {
          const timeDiff = b.created_at.getTime() - a.created_at.getTime();
          if (timeDiff !== 0) return timeDiff;
          return b.id - a.id;
        });

      if (cursor) {
        const cursorId = parseInt(cursor, 10);
        if (!isNaN(cursorId)) {
          const cursorIndex = userNotifications.findIndex((n) => n.id === cursorId);
          if (cursorIndex >= 0) {
            userNotifications = userNotifications.slice(cursorIndex + 1);
          } else {
            // Cursor ID not found, filter by id < cursorId
            userNotifications = userNotifications.filter((n) => n.id < cursorId);
          }
        }
      }

      const hasMore = userNotifications.length > pageSize;
      const data = userNotifications.slice(0, pageSize);
      const nextCursor = data.length > 0 ? String(data[data.length - 1]!.id) : null;

      return {
        data,
        cursor: hasMore ? nextCursor : null,
        hasMore,
      };
    }),

    markAsRead: jest.fn(async (notificationId: number, userId: number): Promise<number> => {
      const notification = notifications.find(
        (n) => n.id === notificationId && n.user_id === userId && !n.is_read
      );
      if (notification) {
        notification.is_read = true;
        return 1;
      }
      return 0;
    }),

    markAllAsRead: jest.fn(async (userId: number): Promise<number> => {
      let count = 0;
      for (const n of notifications) {
        if (n.user_id === userId && !n.is_read) {
          n.is_read = true;
          count++;
        }
      }
      return count;
    }),

    getUnreadCount: jest.fn(async (userId: number): Promise<number> => {
      return notifications.filter((n) => n.user_id === userId && !n.is_read).length;
    }),

    getUndelivered: jest.fn(async (userId: number): Promise<Notification[]> => {
      return notifications
        .filter((n) => n.user_id === userId && !n.is_read)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    }),

    getPreferences: jest.fn(async (userId: number): Promise<NotificationPreference[]> => {
      return preferences.filter((p) => p.user_id === userId);
    }),

    getPreference: jest.fn(async (
      userId: number,
      eventType: NotificationEventType
    ): Promise<NotificationPreference | undefined> => {
      return preferences.find(
        (p) => p.user_id === userId && p.event_type === eventType
      );
    }),

    upsertPreference: jest.fn(async (data: {
      user_id: number;
      event_type: NotificationEventType;
      in_app_enabled: boolean;
      push_enabled: boolean;
    }): Promise<NotificationPreference> => {
      const existing = preferences.find(
        (p) => p.user_id === data.user_id && p.event_type === data.event_type
      );
      if (existing) {
        existing.in_app_enabled = data.in_app_enabled;
        existing.push_enabled = data.push_enabled;
        existing.updated_at = new Date();
        return existing;
      }
      const pref: NotificationPreference = {
        id: preferenceIdCounter++,
        user_id: data.user_id,
        event_type: data.event_type,
        in_app_enabled: data.in_app_enabled,
        push_enabled: data.push_enabled,
        updated_at: new Date(),
      };
      preferences.push(pref);
      return pref;
    }),
  };
}

/**
 * Mock Socket.IO adapter that tracks delivery attempts.
 */
function createMockSocketAdapter(connectedUsers: Set<number> = new Set()): SocketDeliveryAdapter & {
  deliveries: Array<{ userId: number; notification: Notification }>;
} {
  const deliveries: Array<{ userId: number; notification: Notification }> = [];
  return {
    deliveries,
    isUserConnected: (userId: number) => connectedUsers.has(userId),
    deliverNotification: (userId: number, notification: Notification) => {
      if (connectedUsers.has(userId)) {
        deliveries.push({ userId, notification });
        return true;
      }
      return false;
    },
  };
}

/**
 * Mock push adapter that tracks push delivery attempts.
 */
function createMockPushAdapter(shouldSucceed = true): PushDeliveryAdapter & {
  pushAttempts: Array<{ userId: number; payload: PushPayload }>;
} {
  const pushAttempts: Array<{ userId: number; payload: PushPayload }> = [];
  return {
    pushAttempts,
    sendPush: async (userId: number, payload: PushPayload) => {
      pushAttempts.push({ userId, payload });
      return shouldSucceed;
    },
  };
}

// ============================================================================
// fast-check Arbitraries
// ============================================================================

const eventTypeArb = fc.constantFrom(...EVENT_TYPES);
const userIdArb = fc.integer({ min: 1, max: 10000 });

// ============================================================================
// Property 27: Notification preference suppression
// ============================================================================

describe('Feature: frero-social-platform, Property 27: Notification preference suppression', () => {
  /**
   * **Validates: Requirements 8.7**
   *
   * For any user with notification preferences specifying disabled status for an
   * event type or delivery channel, the Notification_Service SHALL suppress
   * delivery for that event type or channel.
   */

  it('should suppress in-app delivery when in_app_enabled is false for the event type', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        eventTypeArb,
        userIdArb,
        async (userId, eventType, sourceUserId) => {
          // Setup
          const repo = createMockRepository();
          const connectedUsers = new Set([userId]);
          const socketAdapter = createMockSocketAdapter(connectedUsers);
          const pushAdapter = createMockPushAdapter(true);

          // Set preference: in-app disabled for this event type
          await repo.upsertPreference({
            user_id: userId,
            event_type: eventType,
            in_app_enabled: false,
            push_enabled: true,
          });

          const service = new NotificationService({
            repository: repo as any,
            socketAdapter,
            pushAdapter,
          });

          // Act: create a notification for the disabled event type
          await service.create({
            userId,
            sourceUserId,
            eventType,
            referenceId: 1,
            referenceType: 'post',
          });

          // Assert: notification record is still created (for history)
          expect(repo.create).toHaveBeenCalled();

          // Assert: in-app delivery via Socket.IO is suppressed
          expect(socketAdapter.deliveries.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should suppress push delivery when push_enabled is false for the event type', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        eventTypeArb,
        userIdArb,
        async (userId, eventType, sourceUserId) => {
          // Setup
          const repo = createMockRepository();
          const connectedUsers = new Set<number>();
          const socketAdapter = createMockSocketAdapter(connectedUsers);
          const pushAdapter = createMockPushAdapter(true);

          // Set preference: push disabled for this event type
          await repo.upsertPreference({
            user_id: userId,
            event_type: eventType,
            in_app_enabled: true,
            push_enabled: false,
          });

          const service = new NotificationService({
            repository: repo as any,
            socketAdapter,
            pushAdapter,
          });

          // Act: create a notification for the event type with push disabled
          await service.create({
            userId,
            sourceUserId,
            eventType,
            referenceId: 1,
            referenceType: 'post',
          });

          // Flush microtask queue for fire-and-forget push
          await new Promise((resolve) => setImmediate(resolve));

          // Assert: notification record is still created
          expect(repo.create).toHaveBeenCalled();

          // Assert: push delivery is suppressed (no push attempts)
          expect(pushAdapter.pushAttempts.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow delivery when preferences are enabled for the event type', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        eventTypeArb,
        userIdArb,
        async (userId, eventType, sourceUserId) => {
          // Setup
          const repo = createMockRepository();
          const connectedUsers = new Set([userId]);
          const socketAdapter = createMockSocketAdapter(connectedUsers);
          const pushAdapter = createMockPushAdapter(true);

          // Set preference: both channels enabled
          await repo.upsertPreference({
            user_id: userId,
            event_type: eventType,
            in_app_enabled: true,
            push_enabled: true,
          });

          const service = new NotificationService({
            repository: repo as any,
            socketAdapter,
            pushAdapter,
          });

          // Act
          await service.create({
            userId,
            sourceUserId,
            eventType,
            referenceId: 1,
            referenceType: 'post',
          });

          // Flush microtask queue for fire-and-forget push
          await new Promise((resolve) => setImmediate(resolve));

          // Assert: in-app delivery occurs (user is connected)
          expect(socketAdapter.deliveries.length).toBe(1);
          expect(socketAdapter.deliveries[0]!.userId).toBe(userId);

          // Assert: push delivery occurs
          expect(pushAdapter.pushAttempts.length).toBeGreaterThan(0);
          expect(pushAdapter.pushAttempts[0]!.userId).toBe(userId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should suppress both channels when both are disabled for the event type', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        eventTypeArb,
        userIdArb,
        async (userId, eventType, sourceUserId) => {
          // Setup
          const repo = createMockRepository();
          const connectedUsers = new Set([userId]);
          const socketAdapter = createMockSocketAdapter(connectedUsers);
          const pushAdapter = createMockPushAdapter(true);

          // Set preference: both channels disabled
          await repo.upsertPreference({
            user_id: userId,
            event_type: eventType,
            in_app_enabled: false,
            push_enabled: false,
          });

          const service = new NotificationService({
            repository: repo as any,
            socketAdapter,
            pushAdapter,
          });

          // Act
          await service.create({
            userId,
            sourceUserId,
            eventType,
            referenceId: 1,
            referenceType: 'post',
          });

          // Flush microtask queue for fire-and-forget push
          await new Promise((resolve) => setImmediate(resolve));

          // Assert: notification record is still created
          expect(repo.create).toHaveBeenCalled();

          // Assert: both delivery channels are suppressed
          expect(socketAdapter.deliveries.length).toBe(0);
          expect(pushAdapter.pushAttempts.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should default to enabled delivery when no preference is configured', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        eventTypeArb,
        userIdArb,
        async (userId, eventType, sourceUserId) => {
          // Setup: no preferences configured
          const repo = createMockRepository();
          const connectedUsers = new Set([userId]);
          const socketAdapter = createMockSocketAdapter(connectedUsers);
          const pushAdapter = createMockPushAdapter(true);

          const service = new NotificationService({
            repository: repo as any,
            socketAdapter,
            pushAdapter,
          });

          // Act
          await service.create({
            userId,
            sourceUserId,
            eventType,
            referenceId: 1,
            referenceType: 'post',
          });

          // Flush microtask queue for fire-and-forget push
          await new Promise((resolve) => setImmediate(resolve));

          // Assert: in-app delivery occurs (default enabled)
          expect(socketAdapter.deliveries.length).toBe(1);

          // Assert: push delivery occurs (default enabled)
          expect(pushAdapter.pushAttempts.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should respect per-event-type preferences independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.uniqueArray(eventTypeArb, { minLength: 2, maxLength: 6 }),
        async (userId, eventTypes) => {
          // Setup
          const repo = createMockRepository();
          const connectedUsers = new Set([userId]);
          const socketAdapter = createMockSocketAdapter(connectedUsers);
          const pushAdapter = createMockPushAdapter(true);

          // Disable in-app for the first event type, enable for the rest
          const disabledEventType = eventTypes[0]!;
          const enabledEventType = eventTypes[1]!;

          await repo.upsertPreference({
            user_id: userId,
            event_type: disabledEventType,
            in_app_enabled: false,
            push_enabled: true,
          });

          await repo.upsertPreference({
            user_id: userId,
            event_type: enabledEventType,
            in_app_enabled: true,
            push_enabled: true,
          });

          const service = new NotificationService({
            repository: repo as any,
            socketAdapter,
            pushAdapter,
          });

          // Act: create notification for disabled event type
          await service.create({
            userId,
            sourceUserId: 999,
            eventType: disabledEventType,
            referenceId: 1,
            referenceType: 'post',
          });

          // Assert: in-app suppressed for disabled event type
          expect(socketAdapter.deliveries.length).toBe(0);

          // Act: create notification for enabled event type
          await service.create({
            userId,
            sourceUserId: 999,
            eventType: enabledEventType,
            referenceId: 2,
            referenceType: 'post',
          });

          // Assert: in-app delivered for enabled event type
          expect(socketAdapter.deliveries.length).toBe(1);
          expect(socketAdapter.deliveries[0]!.notification.event_type).toBe(enabledEventType);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 28: Notifications reverse chronological ordering
// ============================================================================

describe('Feature: frero-social-platform, Property 28: Notifications reverse chronological ordering', () => {
  /**
   * **Validates: Requirements 8.8**
   *
   * The Notification_Service SHALL return notifications in reverse chronological
   * order with cursor-based pagination using a default page size of 20 and a
   * maximum page size of 50.
   */

  it('should return notifications in reverse chronological order', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 2, max: 30 }),
        async (userId, count) => {
          // Setup
          const repo = createMockRepository();
          const service = new NotificationService({
            repository: repo as any,
            socketAdapter: createMockSocketAdapter(),
            pushAdapter: createMockPushAdapter(false),
          });

          // Create notifications with distinct timestamps
          const baseTime = Date.now();
          for (let i = 0; i < count; i++) {
            const notification: Notification = {
              id: i + 1,
              user_id: userId,
              source_user_id: i + 100,
              event_type: EVENT_TYPES[i % EVENT_TYPES.length]!,
              reference_id: i + 1,
              reference_type: 'post',
              is_read: false,
              created_at: new Date(baseTime + i * 1000), // Each 1 second apart
            };
            repo._notifications.push(notification);
          }

          // Act
          const result = await service.getNotifications(userId);

          // Assert: notifications are in reverse chronological order
          for (let i = 0; i < result.data.length - 1; i++) {
            const current = result.data[i]!;
            const next = result.data[i + 1]!;
            expect(current.created_at.getTime()).toBeGreaterThanOrEqual(
              next.created_at.getTime()
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should use default page size of 20 when no limit is specified', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 21, max: 60 }),
        async (userId, count) => {
          // Setup
          const repo = createMockRepository();
          const service = new NotificationService({
            repository: repo as any,
            socketAdapter: createMockSocketAdapter(),
            pushAdapter: createMockPushAdapter(false),
          });

          // Create more than 20 notifications
          const baseTime = Date.now();
          for (let i = 0; i < count; i++) {
            const notification: Notification = {
              id: i + 1,
              user_id: userId,
              source_user_id: i + 100,
              event_type: EVENT_TYPES[i % EVENT_TYPES.length]!,
              reference_id: i + 1,
              reference_type: 'post',
              is_read: false,
              created_at: new Date(baseTime + i * 1000),
            };
            repo._notifications.push(notification);
          }

          // Act: no limit specified
          const result = await service.getNotifications(userId);

          // Assert: default page size is 20
          expect(result.data.length).toBe(20);
          expect(result.hasMore).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should cap page size at maximum of 50', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 51, max: 200 }),
        fc.integer({ min: 51, max: 500 }),
        async (userId, count, requestedLimit) => {
          // Setup
          const repo = createMockRepository();
          const service = new NotificationService({
            repository: repo as any,
            socketAdapter: createMockSocketAdapter(),
            pushAdapter: createMockPushAdapter(false),
          });

          // Create more than 50 notifications
          const baseTime = Date.now();
          for (let i = 0; i < count; i++) {
            const notification: Notification = {
              id: i + 1,
              user_id: userId,
              source_user_id: i + 100,
              event_type: EVENT_TYPES[i % EVENT_TYPES.length]!,
              reference_id: i + 1,
              reference_type: 'post',
              is_read: false,
              created_at: new Date(baseTime + i * 1000),
            };
            repo._notifications.push(notification);
          }

          // Act: request more than max page size
          const result = await service.getNotifications(userId, null, requestedLimit);

          // Assert: page size is capped at 50
          expect(result.data.length).toBeLessThanOrEqual(50);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should support cursor-based pagination without duplicates or gaps', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 5, max: 50 }),
        fc.integer({ min: 2, max: 10 }),
        async (userId, totalCount, pageSize) => {
          // Setup
          const repo = createMockRepository();
          const service = new NotificationService({
            repository: repo as any,
            socketAdapter: createMockSocketAdapter(),
            pushAdapter: createMockPushAdapter(false),
          });

          // Create notifications
          const baseTime = Date.now();
          for (let i = 0; i < totalCount; i++) {
            const notification: Notification = {
              id: i + 1,
              user_id: userId,
              source_user_id: i + 100,
              event_type: EVENT_TYPES[i % EVENT_TYPES.length]!,
              reference_id: i + 1,
              reference_type: 'post',
              is_read: false,
              created_at: new Date(baseTime + i * 1000),
            };
            repo._notifications.push(notification);
          }

          // Act: paginate through all notifications
          const allFetched: Notification[] = [];
          let cursor: string | null = null;
          let iterations = 0;
          const maxIterations = Math.ceil(totalCount / pageSize) + 1;

          do {
            const result = await service.getNotifications(userId, cursor, pageSize);
            allFetched.push(...result.data);
            cursor = result.cursor;
            iterations++;

            if (!result.hasMore) break;
          } while (cursor && iterations < maxIterations);

          // Assert: all notifications are fetched
          expect(allFetched.length).toBe(totalCount);

          // Assert: no duplicates
          const ids = allFetched.map((n) => n.id);
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(totalCount);

          // Assert: all in reverse chronological order
          for (let i = 0; i < allFetched.length - 1; i++) {
            expect(allFetched[i]!.created_at.getTime()).toBeGreaterThanOrEqual(
              allFetched[i + 1]!.created_at.getTime()
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return empty result for user with no notifications', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        // Setup: empty repository
        const repo = createMockRepository();
        const service = new NotificationService({
          repository: repo as any,
          socketAdapter: createMockSocketAdapter(),
          pushAdapter: createMockPushAdapter(false),
        });

        // Act
        const result = await service.getNotifications(userId);

        // Assert
        expect(result.data.length).toBe(0);
        expect(result.hasMore).toBe(false);
        expect(result.cursor).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('should respect custom page size within valid range (1-50)', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 100 }),
        async (userId, requestedLimit, totalCount) => {
          // Setup
          const repo = createMockRepository();
          const service = new NotificationService({
            repository: repo as any,
            socketAdapter: createMockSocketAdapter(),
            pushAdapter: createMockPushAdapter(false),
          });

          // Create notifications
          const baseTime = Date.now();
          for (let i = 0; i < totalCount; i++) {
            const notification: Notification = {
              id: i + 1,
              user_id: userId,
              source_user_id: i + 100,
              event_type: EVENT_TYPES[i % EVENT_TYPES.length]!,
              reference_id: i + 1,
              reference_type: 'post',
              is_read: false,
              created_at: new Date(baseTime + i * 1000),
            };
            repo._notifications.push(notification);
          }

          // Act
          const result = await service.getNotifications(userId, null, requestedLimit);

          // Assert: returned count is at most the requested limit
          const expectedCount = Math.min(requestedLimit, totalCount);
          expect(result.data.length).toBe(expectedCount);

          // Assert: hasMore is correct
          if (totalCount > requestedLimit) {
            expect(result.hasMore).toBe(true);
          } else {
            expect(result.hasMore).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
