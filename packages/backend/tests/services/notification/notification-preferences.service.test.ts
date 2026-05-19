/**
 * Unit tests for NotificationService - Preferences and Push Notifications.
 *
 * Tests cover:
 * - Requirement 8.5: Web push notifications using web push protocol
 * - Requirement 8.6: Retain notification in unread list if push fails after 3 retries
 * - Requirement 8.7: Suppress delivery based on user preferences (per event type, per channel)
 */

import { NotificationService } from '../../../src/services/notification/notification.service';
import { NotificationRepository } from '../../../src/services/notification/notification.repository';
import {
  Notification,
  NotificationError,
  NotificationPreference,
  PushDeliveryAdapter,
  SocketDeliveryAdapter,
} from '../../../src/services/notification/types';

// Mock the database connection so the repository doesn't try to connect
jest.mock('../../../src/database/connection', () => ({
  getDatabase: jest.fn(),
}));

describe('NotificationService - Preferences and Push', () => {
  let service: NotificationService;
  let mockRepository: jest.Mocked<NotificationRepository>;
  let mockSocketAdapter: jest.Mocked<SocketDeliveryAdapter>;
  let mockPushAdapter: jest.Mocked<PushDeliveryAdapter>;

  const sampleNotification: Notification = {
    id: 1,
    user_id: 100,
    source_user_id: 200,
    event_type: 'like',
    reference_id: 50,
    reference_type: 'post',
    is_read: false,
    created_at: new Date('2024-01-15T10:00:00Z'),
  };

  const samplePreference: NotificationPreference = {
    id: 1,
    user_id: 100,
    event_type: 'like',
    in_app_enabled: true,
    push_enabled: true,
    updated_at: new Date('2024-01-15T10:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      getByUserId: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      getUnreadCount: jest.fn(),
      getUndelivered: jest.fn(),
      getPreferences: jest.fn(),
      getPreference: jest.fn(),
      upsertPreference: jest.fn(),
    } as unknown as jest.Mocked<NotificationRepository>;

    mockSocketAdapter = {
      isUserConnected: jest.fn(),
      deliverNotification: jest.fn(),
    };

    mockPushAdapter = {
      sendPush: jest.fn(),
    };

    service = new NotificationService({
      repository: mockRepository,
      socketAdapter: mockSocketAdapter,
      pushAdapter: mockPushAdapter,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('updatePreferences()', () => {
    it('should update preferences for a single event type', async () => {
      mockRepository.upsertPreference.mockResolvedValue(samplePreference);

      const result = await service.updatePreferences(100, [
        { eventType: 'like', inAppEnabled: true, pushEnabled: false },
      ]);

      expect(result).toHaveLength(1);
      expect(mockRepository.upsertPreference).toHaveBeenCalledWith({
        user_id: 100,
        event_type: 'like',
        in_app_enabled: true,
        push_enabled: false,
      });
    });

    it('should update preferences for multiple event types', async () => {
      mockRepository.upsertPreference
        .mockResolvedValueOnce({ ...samplePreference, event_type: 'like' })
        .mockResolvedValueOnce({ ...samplePreference, event_type: 'comment' })
        .mockResolvedValueOnce({ ...samplePreference, event_type: 'follow' });

      const result = await service.updatePreferences(100, [
        { eventType: 'like', inAppEnabled: true, pushEnabled: false },
        { eventType: 'comment', inAppEnabled: false, pushEnabled: true },
        { eventType: 'follow', inAppEnabled: false, pushEnabled: false },
      ]);

      expect(result).toHaveLength(3);
      expect(mockRepository.upsertPreference).toHaveBeenCalledTimes(3);
    });

    it('should throw error when userId is missing', async () => {
      await expect(
        service.updatePreferences(0, [
          { eventType: 'like', inAppEnabled: true, pushEnabled: true },
        ])
      ).rejects.toThrow(NotificationError);
    });

    it('should throw error when preferences array is empty', async () => {
      await expect(service.updatePreferences(100, [])).rejects.toThrow(
        NotificationError
      );
    });

    it('should throw error when preferences is null/undefined', async () => {
      await expect(
        service.updatePreferences(100, null as any)
      ).rejects.toThrow(NotificationError);
    });

    it('should throw error when a preference has no event type', async () => {
      await expect(
        service.updatePreferences(100, [
          { eventType: '' as any, inAppEnabled: true, pushEnabled: true },
        ])
      ).rejects.toThrow(NotificationError);
    });
  });

  describe('getPreferences()', () => {
    it('should return all preferences for a user', async () => {
      const preferences: NotificationPreference[] = [
        { ...samplePreference, event_type: 'like' },
        { ...samplePreference, event_type: 'comment', push_enabled: false },
      ];
      mockRepository.getPreferences.mockResolvedValue(preferences);

      const result = await service.getPreferences(100);

      expect(result).toHaveLength(2);
      expect(mockRepository.getPreferences).toHaveBeenCalledWith(100);
    });

    it('should return empty array when no preferences are configured', async () => {
      mockRepository.getPreferences.mockResolvedValue([]);

      const result = await service.getPreferences(100);

      expect(result).toHaveLength(0);
    });

    it('should throw error when userId is missing', async () => {
      await expect(service.getPreferences(0)).rejects.toThrow(
        NotificationError
      );
    });
  });

  describe('create() with preference suppression (Requirement 8.7)', () => {
    it('should suppress in-app delivery when in_app_enabled is false', async () => {
      mockRepository.getPreference.mockResolvedValue({
        ...samplePreference,
        in_app_enabled: false,
        push_enabled: false,
      });
      mockRepository.create.mockResolvedValue(sampleNotification);
      mockSocketAdapter.isUserConnected.mockReturnValue(true);

      await service.create({
        userId: 100,
        sourceUserId: 200,
        eventType: 'like',
        referenceId: 50,
        referenceType: 'post',
      });

      // Socket delivery should NOT be called because in-app is disabled
      expect(mockSocketAdapter.deliverNotification).not.toHaveBeenCalled();
    });

    it('should suppress push delivery when push_enabled is false', async () => {
      mockRepository.getPreference.mockResolvedValue({
        ...samplePreference,
        in_app_enabled: true,
        push_enabled: false,
      });
      mockRepository.create.mockResolvedValue(sampleNotification);
      mockSocketAdapter.isUserConnected.mockReturnValue(false);

      await service.create({
        userId: 100,
        sourceUserId: 200,
        eventType: 'like',
        referenceId: 50,
        referenceType: 'post',
      });

      // Push should NOT be called because push is disabled
      expect(mockPushAdapter.sendPush).not.toHaveBeenCalled();
    });

    it('should deliver via both channels when both are enabled', async () => {
      mockRepository.getPreference.mockResolvedValue({
        ...samplePreference,
        in_app_enabled: true,
        push_enabled: true,
      });
      mockRepository.create.mockResolvedValue(sampleNotification);
      mockSocketAdapter.isUserConnected.mockReturnValue(true);
      mockSocketAdapter.deliverNotification.mockReturnValue(true);
      mockPushAdapter.sendPush.mockResolvedValue(true);

      await service.create({
        userId: 100,
        sourceUserId: 200,
        eventType: 'like',
        referenceId: 50,
        referenceType: 'post',
      });

      expect(mockSocketAdapter.deliverNotification).toHaveBeenCalledWith(
        100,
        sampleNotification
      );
      // Push is called asynchronously
      await jest.runAllTimersAsync();
      expect(mockPushAdapter.sendPush).toHaveBeenCalled();
    });

    it('should default to enabled when no preference exists for event type', async () => {
      mockRepository.getPreference.mockResolvedValue(undefined);
      mockRepository.create.mockResolvedValue(sampleNotification);
      mockSocketAdapter.isUserConnected.mockReturnValue(true);
      mockSocketAdapter.deliverNotification.mockReturnValue(true);
      mockPushAdapter.sendPush.mockResolvedValue(true);

      await service.create({
        userId: 100,
        sourceUserId: 200,
        eventType: 'like',
        referenceId: 50,
        referenceType: 'post',
      });

      // Both channels should be active (default enabled)
      expect(mockSocketAdapter.deliverNotification).toHaveBeenCalled();
      await jest.runAllTimersAsync();
      expect(mockPushAdapter.sendPush).toHaveBeenCalled();
    });

    it('should still create notification record even when both channels are disabled', async () => {
      mockRepository.getPreference.mockResolvedValue({
        ...samplePreference,
        in_app_enabled: false,
        push_enabled: false,
      });
      mockRepository.create.mockResolvedValue(sampleNotification);
      mockSocketAdapter.isUserConnected.mockReturnValue(true);

      const result = await service.create({
        userId: 100,
        sourceUserId: 200,
        eventType: 'like',
        referenceId: 50,
        referenceType: 'post',
      });

      // Record is still created
      expect(result).toEqual(sampleNotification);
      expect(mockRepository.create).toHaveBeenCalled();
      // But no delivery happens
      expect(mockSocketAdapter.deliverNotification).not.toHaveBeenCalled();
      expect(mockPushAdapter.sendPush).not.toHaveBeenCalled();
    });

    it('should suppress per event type independently', async () => {
      // Like notifications: push disabled
      mockRepository.getPreference.mockResolvedValueOnce({
        ...samplePreference,
        event_type: 'like',
        in_app_enabled: true,
        push_enabled: false,
      });
      mockRepository.create.mockResolvedValueOnce({
        ...sampleNotification,
        event_type: 'like',
      });
      mockSocketAdapter.isUserConnected.mockReturnValue(true);
      mockSocketAdapter.deliverNotification.mockReturnValue(true);

      await service.create({
        userId: 100,
        sourceUserId: 200,
        eventType: 'like',
      });

      expect(mockSocketAdapter.deliverNotification).toHaveBeenCalled();
      expect(mockPushAdapter.sendPush).not.toHaveBeenCalled();

      jest.clearAllMocks();

      // Comment notifications: in-app disabled, push enabled
      mockRepository.getPreference.mockResolvedValueOnce({
        ...samplePreference,
        event_type: 'comment',
        in_app_enabled: false,
        push_enabled: true,
      });
      mockRepository.create.mockResolvedValueOnce({
        ...sampleNotification,
        event_type: 'comment',
      });
      mockSocketAdapter.isUserConnected.mockReturnValue(true);
      mockPushAdapter.sendPush.mockResolvedValue(true);

      await service.create({
        userId: 100,
        sourceUserId: 200,
        eventType: 'comment',
      });

      expect(mockSocketAdapter.deliverNotification).not.toHaveBeenCalled();
      await jest.runAllTimersAsync();
      expect(mockPushAdapter.sendPush).toHaveBeenCalled();
    });
  });

  describe('sendPush() - 3-retry logic (Requirements 8.5, 8.6)', () => {
    it('should succeed on first attempt', async () => {
      mockPushAdapter.sendPush.mockResolvedValue(true);

      const result = await service.sendPush(100, sampleNotification);

      expect(result).toBe(true);
      expect(mockPushAdapter.sendPush).toHaveBeenCalledTimes(1);
      expect(mockPushAdapter.sendPush).toHaveBeenCalledWith(100, {
        title: 'New Like',
        body: 'Someone liked your post',
        notificationId: 1,
        eventType: 'like',
        referenceId: 50,
        referenceType: 'post',
      });
    });

    it('should retry up to 3 times on failure', async () => {
      mockPushAdapter.sendPush
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      const resultPromise = service.sendPush(100, sampleNotification);

      // Advance timers for retry delays
      await jest.advanceTimersByTimeAsync(1000); // after 1st failure
      await jest.advanceTimersByTimeAsync(2000); // after 2nd failure

      const result = await resultPromise;

      expect(result).toBe(false);
      expect(mockPushAdapter.sendPush).toHaveBeenCalledTimes(3);
    });

    it('should succeed on second attempt after first failure', async () => {
      mockPushAdapter.sendPush
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const resultPromise = service.sendPush(100, sampleNotification);

      // Advance timer for retry delay after first failure
      await jest.advanceTimersByTimeAsync(1000);

      const result = await resultPromise;

      expect(result).toBe(true);
      expect(mockPushAdapter.sendPush).toHaveBeenCalledTimes(2);
    });

    it('should succeed on third attempt after two failures', async () => {
      mockPushAdapter.sendPush
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const resultPromise = service.sendPush(100, sampleNotification);

      await jest.advanceTimersByTimeAsync(1000); // after 1st failure
      await jest.advanceTimersByTimeAsync(2000); // after 2nd failure

      const result = await resultPromise;

      expect(result).toBe(true);
      expect(mockPushAdapter.sendPush).toHaveBeenCalledTimes(3);
    });

    it('should handle exceptions as failures and retry', async () => {
      mockPushAdapter.sendPush
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce(true);

      const resultPromise = service.sendPush(100, sampleNotification);

      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;

      expect(result).toBe(true);
      expect(mockPushAdapter.sendPush).toHaveBeenCalledTimes(3);
    });

    it('should return false after 3 failed attempts with exceptions', async () => {
      mockPushAdapter.sendPush
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockRejectedValueOnce(new Error('Service unavailable'));

      const resultPromise = service.sendPush(100, sampleNotification);

      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;

      expect(result).toBe(false);
      expect(mockPushAdapter.sendPush).toHaveBeenCalledTimes(3);
    });

    it('should return false when userId is falsy', async () => {
      const result = await service.sendPush(0, sampleNotification);

      expect(result).toBe(false);
      expect(mockPushAdapter.sendPush).not.toHaveBeenCalled();
    });

    it('should return false when notification is null', async () => {
      const result = await service.sendPush(100, null as any);

      expect(result).toBe(false);
      expect(mockPushAdapter.sendPush).not.toHaveBeenCalled();
    });

    it('should generate correct push payload for each event type', async () => {
      const eventTypes = [
        { type: 'like', title: 'New Like', body: 'Someone liked your post' },
        { type: 'comment', title: 'New Comment', body: 'Someone commented on your post' },
        { type: 'message', title: 'New Message', body: 'You have a new message' },
        { type: 'follow', title: 'New Follower', body: 'Someone started following you' },
        { type: 'mention', title: 'You were mentioned', body: 'You were mentioned in a post' },
        { type: 'friend_request', title: 'Friend Request', body: 'You have a new friend request' },
      ] as const;

      for (const { type, title, body } of eventTypes) {
        mockPushAdapter.sendPush.mockResolvedValue(true);

        const notification = { ...sampleNotification, event_type: type };
        await service.sendPush(100, notification);

        expect(mockPushAdapter.sendPush).toHaveBeenCalledWith(100, expect.objectContaining({
          title,
          body,
          eventType: type,
        }));

        mockPushAdapter.sendPush.mockClear();
      }
    });

    it('should retain notification in unread list when all retries fail (Requirement 8.6)', async () => {
      // The notification is already created as unread in the DB.
      // When push fails after 3 retries, it should remain unread (no markAsRead call).
      mockPushAdapter.sendPush
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      const resultPromise = service.sendPush(100, sampleNotification);

      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;

      expect(result).toBe(false);
      // Notification remains unread - no markAsRead should have been called
      expect(mockRepository.markAsRead).not.toHaveBeenCalled();
    });
  });
});
