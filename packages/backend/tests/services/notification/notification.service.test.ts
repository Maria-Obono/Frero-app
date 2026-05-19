/**
 * Unit tests for NotificationService.
 *
 * Tests cover:
 * - Requirement 8.1: Create notification and deliver via Socket.IO
 * - Requirement 8.2: Queue for offline users, deliver on reconnection
 * - Requirement 8.3: Mark single notification as read
 * - Requirement 8.4: Batch mark all as read
 * - Requirement 8.8: Reverse chronological order with cursor pagination (default 20, max 50)
 * - Requirement 8.9: Unread count
 */

import { NotificationService } from '../../../src/services/notification/notification.service';
import { NotificationRepository } from '../../../src/services/notification/notification.repository';
import {
  Notification,
  NotificationError,
  SocketDeliveryAdapter,
} from '../../../src/services/notification/types';

// Mock the database connection so the repository doesn't try to connect
jest.mock('../../../src/database/connection', () => ({
  getDatabase: jest.fn(),
}));

describe('NotificationService', () => {
  let service: NotificationService;
  let mockRepository: jest.Mocked<NotificationRepository>;
  let mockSocketAdapter: jest.Mocked<SocketDeliveryAdapter>;

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

  beforeEach(() => {
    jest.clearAllMocks();

    mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      getByUserId: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      getUnreadCount: jest.fn(),
      getUndelivered: jest.fn(),
      getPreferences: jest.fn(),
      getPreference: jest.fn().mockResolvedValue(undefined), // default: no preference (all channels enabled)
      upsertPreference: jest.fn(),
    } as unknown as jest.Mocked<NotificationRepository>;

    mockSocketAdapter = {
      isUserConnected: jest.fn(),
      deliverNotification: jest.fn(),
    };

    service = new NotificationService({
      repository: mockRepository,
      socketAdapter: mockSocketAdapter,
    });
  });

  describe('create()', () => {
    it('should create a notification record with all required fields', async () => {
      mockRepository.create.mockResolvedValue(sampleNotification);
      mockSocketAdapter.isUserConnected.mockReturnValue(false);

      const result = await service.create({
        userId: 100,
        sourceUserId: 200,
        eventType: 'like',
        referenceId: 50,
        referenceType: 'post',
      });

      expect(result).toEqual(sampleNotification);
      expect(mockRepository.create).toHaveBeenCalledWith({
        user_id: 100,
        source_user_id: 200,
        event_type: 'like',
        reference_id: 50,
        reference_type: 'post',
      });
    });

    it('should create notifications for all event types', async () => {
      const eventTypes = ['like', 'comment', 'message', 'follow', 'mention', 'friend_request'] as const;

      for (const eventType of eventTypes) {
        const notification = { ...sampleNotification, event_type: eventType };
        mockRepository.create.mockResolvedValue(notification);
        mockSocketAdapter.isUserConnected.mockReturnValue(false);

        const result = await service.create({
          userId: 100,
          sourceUserId: 200,
          eventType,
          referenceId: 50,
          referenceType: 'post',
        });

        expect(result.event_type).toBe(eventType);
      }
    });

    it('should deliver via Socket.IO when user is connected (Requirement 8.1)', async () => {
      mockRepository.create.mockResolvedValue(sampleNotification);
      mockSocketAdapter.isUserConnected.mockReturnValue(true);
      mockSocketAdapter.deliverNotification.mockReturnValue(true);

      await service.create({
        userId: 100,
        sourceUserId: 200,
        eventType: 'like',
        referenceId: 50,
        referenceType: 'post',
      });

      expect(mockSocketAdapter.isUserConnected).toHaveBeenCalledWith(100);
      expect(mockSocketAdapter.deliverNotification).toHaveBeenCalledWith(100, sampleNotification);
    });

    it('should NOT deliver via Socket.IO when user is offline (Requirement 8.2)', async () => {
      mockRepository.create.mockResolvedValue(sampleNotification);
      mockSocketAdapter.isUserConnected.mockReturnValue(false);

      await service.create({
        userId: 100,
        sourceUserId: 200,
        eventType: 'like',
        referenceId: 50,
        referenceType: 'post',
      });

      expect(mockSocketAdapter.isUserConnected).toHaveBeenCalledWith(100);
      expect(mockSocketAdapter.deliverNotification).not.toHaveBeenCalled();
    });

    it('should handle null sourceUserId for system notifications', async () => {
      const systemNotification = { ...sampleNotification, source_user_id: null };
      mockRepository.create.mockResolvedValue(systemNotification);
      mockSocketAdapter.isUserConnected.mockReturnValue(false);

      const result = await service.create({
        userId: 100,
        eventType: 'message',
      });

      expect(result.source_user_id).toBeNull();
      expect(mockRepository.create).toHaveBeenCalledWith({
        user_id: 100,
        source_user_id: null,
        event_type: 'message',
        reference_id: null,
        reference_type: null,
      });
    });

    it('should throw error when userId is missing', async () => {
      await expect(
        service.create({
          userId: 0,
          eventType: 'like',
        })
      ).rejects.toThrow(NotificationError);
    });

    it('should throw error when eventType is missing', async () => {
      await expect(
        service.create({
          userId: 100,
          eventType: '' as any,
        })
      ).rejects.toThrow(NotificationError);
    });
  });

  describe('getNotifications()', () => {
    it('should return notifications in reverse chronological order (Requirement 8.8)', async () => {
      const notifications: Notification[] = [
        { ...sampleNotification, id: 3, created_at: new Date('2024-01-15T12:00:00Z') },
        { ...sampleNotification, id: 2, created_at: new Date('2024-01-15T11:00:00Z') },
        { ...sampleNotification, id: 1, created_at: new Date('2024-01-15T10:00:00Z') },
      ];

      mockRepository.getByUserId.mockResolvedValue({
        data: notifications,
        cursor: null,
        hasMore: false,
      });

      const result = await service.getNotifications(100);

      expect(result.data).toHaveLength(3);
      expect(result.data[0]!.id).toBe(3);
      expect(result.data[1]!.id).toBe(2);
      expect(result.data[2]!.id).toBe(1);
      expect(mockRepository.getByUserId).toHaveBeenCalledWith(100, undefined, undefined);
    });

    it('should use default page size of 20 when no limit specified', async () => {
      mockRepository.getByUserId.mockResolvedValue({
        data: [],
        cursor: null,
        hasMore: false,
      });

      await service.getNotifications(100);

      expect(mockRepository.getByUserId).toHaveBeenCalledWith(100, undefined, undefined);
    });

    it('should pass cursor for pagination', async () => {
      mockRepository.getByUserId.mockResolvedValue({
        data: [],
        cursor: null,
        hasMore: false,
      });

      await service.getNotifications(100, '50', 10);

      expect(mockRepository.getByUserId).toHaveBeenCalledWith(100, '50', 10);
    });

    it('should return hasMore and cursor when more results exist', async () => {
      mockRepository.getByUserId.mockResolvedValue({
        data: [sampleNotification],
        cursor: '1',
        hasMore: true,
      });

      const result = await service.getNotifications(100, null, 1);

      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('1');
    });

    it('should throw error when userId is missing', async () => {
      await expect(service.getNotifications(0)).rejects.toThrow(NotificationError);
    });
  });

  describe('markAsRead()', () => {
    it('should mark a single notification as read (Requirement 8.3)', async () => {
      mockRepository.findById.mockResolvedValue(sampleNotification);
      mockRepository.markAsRead.mockResolvedValue(1);

      await service.markAsRead(1, 100);

      expect(mockRepository.findById).toHaveBeenCalledWith(1);
      expect(mockRepository.markAsRead).toHaveBeenCalledWith(1, 100);
    });

    it('should throw error when notification does not exist', async () => {
      mockRepository.findById.mockResolvedValue(undefined);

      await expect(service.markAsRead(999, 100)).rejects.toThrow(NotificationError);
      await expect(service.markAsRead(999, 100)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should throw error when notification belongs to another user', async () => {
      mockRepository.findById.mockResolvedValue({
        ...sampleNotification,
        user_id: 999, // different user
      });

      await expect(service.markAsRead(1, 100)).rejects.toThrow(NotificationError);
      await expect(service.markAsRead(1, 100)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should throw error when notificationId is missing', async () => {
      await expect(service.markAsRead(0, 100)).rejects.toThrow(NotificationError);
    });

    it('should throw error when userId is missing', async () => {
      await expect(service.markAsRead(1, 0)).rejects.toThrow(NotificationError);
    });
  });

  describe('markAllAsRead()', () => {
    it('should batch mark all unread notifications as read (Requirement 8.4)', async () => {
      mockRepository.markAllAsRead.mockResolvedValue(5);

      const result = await service.markAllAsRead(100);

      expect(result).toBe(5);
      expect(mockRepository.markAllAsRead).toHaveBeenCalledWith(100);
    });

    it('should return 0 when no unread notifications exist', async () => {
      mockRepository.markAllAsRead.mockResolvedValue(0);

      const result = await service.markAllAsRead(100);

      expect(result).toBe(0);
    });

    it('should throw error when userId is missing', async () => {
      await expect(service.markAllAsRead(0)).rejects.toThrow(NotificationError);
    });
  });

  describe('getUnreadCount()', () => {
    it('should return the count of unread notifications (Requirement 8.9)', async () => {
      mockRepository.getUnreadCount.mockResolvedValue(7);

      const result = await service.getUnreadCount(100);

      expect(result).toBe(7);
      expect(mockRepository.getUnreadCount).toHaveBeenCalledWith(100);
    });

    it('should return 0 when no unread notifications exist', async () => {
      mockRepository.getUnreadCount.mockResolvedValue(0);

      const result = await service.getUnreadCount(100);

      expect(result).toBe(0);
    });

    it('should throw error when userId is missing', async () => {
      await expect(service.getUnreadCount(0)).rejects.toThrow(NotificationError);
    });
  });

  describe('deliverOnReconnection()', () => {
    it('should deliver all unread notifications on reconnection (Requirement 8.2)', async () => {
      const undelivered: Notification[] = [
        { ...sampleNotification, id: 3 },
        { ...sampleNotification, id: 2 },
        { ...sampleNotification, id: 1 },
      ];

      mockRepository.getUndelivered.mockResolvedValue(undelivered);
      mockSocketAdapter.deliverNotification.mockReturnValue(true);

      const result = await service.deliverOnReconnection(100);

      expect(result).toHaveLength(3);
      expect(mockRepository.getUndelivered).toHaveBeenCalledWith(100);
      expect(mockSocketAdapter.deliverNotification).toHaveBeenCalledTimes(3);
      expect(mockSocketAdapter.deliverNotification).toHaveBeenCalledWith(100, undelivered[0]);
      expect(mockSocketAdapter.deliverNotification).toHaveBeenCalledWith(100, undelivered[1]);
      expect(mockSocketAdapter.deliverNotification).toHaveBeenCalledWith(100, undelivered[2]);
    });

    it('should return empty array when no undelivered notifications', async () => {
      mockRepository.getUndelivered.mockResolvedValue([]);

      const result = await service.deliverOnReconnection(100);

      expect(result).toHaveLength(0);
      expect(mockSocketAdapter.deliverNotification).not.toHaveBeenCalled();
    });

    it('should return empty array when userId is falsy', async () => {
      const result = await service.deliverOnReconnection(0);

      expect(result).toHaveLength(0);
      expect(mockRepository.getUndelivered).not.toHaveBeenCalled();
    });
  });
});
