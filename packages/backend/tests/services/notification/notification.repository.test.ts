/**
 * Unit tests for NotificationRepository.
 *
 * Tests cover:
 * - Requirement 8.1: Create notification record
 * - Requirement 8.3: Mark single notification as read
 * - Requirement 8.4: Batch mark all as read
 * - Requirement 8.8: Reverse chronological order with cursor pagination (default 20, max 50)
 * - Requirement 8.9: Unread count
 */

import { NotificationRepository } from '../../../src/services/notification/notification.repository';

// Mock the database connection
jest.mock('../../../src/database/connection', () => ({
  getDatabase: jest.fn(),
}));

describe('NotificationRepository', () => {
  let repository: NotificationRepository;
  let mockDb: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a chainable mock query builder
    mockQueryBuilder = {
      insert: jest.fn().mockResolvedValue([1]),
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      first: jest.fn(),
      count: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue(1),
      select: jest.fn().mockReturnThis(),
    };

    // Mock the knex function (called as db('tableName'))
    mockDb = jest.fn().mockReturnValue(mockQueryBuilder);

    repository = new NotificationRepository({ db: mockDb as any });
  });

  describe('create()', () => {
    it('should insert a notification and return the created record', async () => {
      const createdNotification = {
        id: 1,
        user_id: 100,
        source_user_id: 200,
        event_type: 'like',
        reference_id: 50,
        reference_type: 'post',
        is_read: false,
        created_at: new Date('2024-01-15T10:00:00Z'),
      };

      mockQueryBuilder.insert.mockResolvedValue([1]);
      mockQueryBuilder.first.mockResolvedValue(createdNotification);

      const result = await repository.create({
        user_id: 100,
        source_user_id: 200,
        event_type: 'like',
        reference_id: 50,
        reference_type: 'post',
      });

      expect(result).toEqual(createdNotification);
      expect(mockDb).toHaveBeenCalledWith('notifications');
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith({
        user_id: 100,
        source_user_id: 200,
        event_type: 'like',
        reference_id: 50,
        reference_type: 'post',
        is_read: false,
      });
    });

    it('should handle null source_user_id', async () => {
      const createdNotification = {
        id: 1,
        user_id: 100,
        source_user_id: null,
        event_type: 'message',
        reference_id: null,
        reference_type: null,
        is_read: false,
        created_at: new Date(),
      };

      mockQueryBuilder.insert.mockResolvedValue([1]);
      mockQueryBuilder.first.mockResolvedValue(createdNotification);

      const result = await repository.create({
        user_id: 100,
        source_user_id: null,
        event_type: 'message',
        reference_id: null,
        reference_type: null,
      });

      expect(result.source_user_id).toBeNull();
      expect(result.reference_id).toBeNull();
    });
  });

  describe('getByUserId()', () => {
    it('should query with default page size of 20 (Requirement 8.8)', async () => {
      mockQueryBuilder.limit.mockReturnThis();
      // Return empty array (resolved from the query builder chain)
      const mockResults: any[] = [];
      // Override the mock to return results when awaited
      mockDb.mockReturnValue({
        ...mockQueryBuilder,
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve(mockResults),
      });

      // We need to re-create the repository with the updated mock
      repository = new NotificationRepository({ db: mockDb as any });

      const result = await repository.getByUserId(100);

      expect(result.data).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it('should cap limit at 50 (Requirement 8.8)', async () => {
      const mockResults: any[] = [];
      const chainable = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve(mockResults),
      };
      mockDb.mockReturnValue(chainable);
      repository = new NotificationRepository({ db: mockDb as any });

      await repository.getByUserId(100, null, 100);

      // Should be called with 51 (50 + 1 for hasMore check)
      expect(chainable.limit).toHaveBeenCalledWith(51);
    });

    it('should use minimum limit of 1', async () => {
      const mockResults: any[] = [];
      const chainable = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve(mockResults),
      };
      mockDb.mockReturnValue(chainable);
      repository = new NotificationRepository({ db: mockDb as any });

      await repository.getByUserId(100, null, 0);

      // Should be called with 2 (1 + 1 for hasMore check)
      expect(chainable.limit).toHaveBeenCalledWith(2);
    });

    it('should apply cursor filter when cursor is provided', async () => {
      const mockResults: any[] = [];
      const chainable = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve(mockResults),
      };
      mockDb.mockReturnValue(chainable);
      repository = new NotificationRepository({ db: mockDb as any });

      await repository.getByUserId(100, '50');

      // Should have called where with cursor condition
      expect(chainable.where).toHaveBeenCalledWith('id', '<', 50);
    });

    it('should return hasMore=true and cursor when more results exist', async () => {
      const notifications = Array.from({ length: 21 }, (_, i) => ({
        id: 21 - i,
        user_id: 100,
        source_user_id: 200,
        event_type: 'like',
        reference_id: 50,
        reference_type: 'post',
        is_read: false,
        created_at: new Date(`2024-01-${String(21 - i).padStart(2, '0')}T10:00:00Z`),
      }));

      const chainable = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve(notifications),
      };
      mockDb.mockReturnValue(chainable);
      repository = new NotificationRepository({ db: mockDb as any });

      const result = await repository.getByUserId(100);

      expect(result.data).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('2'); // Last item's ID
    });

    it('should return hasMore=false when no more results', async () => {
      const notifications = [
        {
          id: 1,
          user_id: 100,
          source_user_id: 200,
          event_type: 'like',
          reference_id: 50,
          reference_type: 'post',
          is_read: false,
          created_at: new Date('2024-01-01T10:00:00Z'),
        },
      ];

      const chainable = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve(notifications),
      };
      mockDb.mockReturnValue(chainable);
      repository = new NotificationRepository({ db: mockDb as any });

      const result = await repository.getByUserId(100);

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });
  });

  describe('markAsRead()', () => {
    it('should update is_read to true for the specified notification (Requirement 8.3)', async () => {
      mockQueryBuilder.update.mockResolvedValue(1);

      const result = await repository.markAsRead(1, 100);

      expect(result).toBe(1);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('id', 1);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user_id', 100);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('is_read', false);
      expect(mockQueryBuilder.update).toHaveBeenCalledWith({ is_read: true });
    });

    it('should return 0 when notification is already read', async () => {
      mockQueryBuilder.update.mockResolvedValue(0);

      const result = await repository.markAsRead(1, 100);

      expect(result).toBe(0);
    });
  });

  describe('markAllAsRead()', () => {
    it('should update all unread notifications for a user (Requirement 8.4)', async () => {
      mockQueryBuilder.update.mockResolvedValue(5);

      const result = await repository.markAllAsRead(100);

      expect(result).toBe(5);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user_id', 100);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('is_read', false);
      expect(mockQueryBuilder.update).toHaveBeenCalledWith({ is_read: true });
    });
  });

  describe('getUnreadCount()', () => {
    it('should return the count of unread notifications (Requirement 8.9)', async () => {
      mockQueryBuilder.first.mockResolvedValue({ count: 7 });

      const result = await repository.getUnreadCount(100);

      expect(result).toBe(7);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user_id', 100);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('is_read', false);
      expect(mockQueryBuilder.count).toHaveBeenCalledWith('* as count');
    });

    it('should return 0 when no unread notifications', async () => {
      mockQueryBuilder.first.mockResolvedValue({ count: 0 });

      const result = await repository.getUnreadCount(100);

      expect(result).toBe(0);
    });

    it('should return 0 when result is null', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      const result = await repository.getUnreadCount(100);

      expect(result).toBe(0);
    });
  });

  describe('getUndelivered()', () => {
    it('should return unread notifications for offline delivery', async () => {
      const notifications = [
        {
          id: 3,
          user_id: 100,
          source_user_id: 200,
          event_type: 'like',
          reference_id: 50,
          reference_type: 'post',
          is_read: false,
          created_at: new Date('2024-01-15T12:00:00Z'),
        },
      ];

      const chainable = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve(notifications),
      };
      mockDb.mockReturnValue(chainable);
      repository = new NotificationRepository({ db: mockDb as any });

      const result = await repository.getUndelivered(100);

      expect(result).toHaveLength(1);
      expect(chainable.where).toHaveBeenCalledWith('user_id', 100);
      expect(chainable.where).toHaveBeenCalledWith('is_read', false);
    });
  });

  describe('findById()', () => {
    it('should return a notification by ID', async () => {
      const notification = {
        id: 1,
        user_id: 100,
        source_user_id: 200,
        event_type: 'like',
        reference_id: 50,
        reference_type: 'post',
        is_read: false,
        created_at: new Date(),
      };

      mockQueryBuilder.first.mockResolvedValue(notification);

      const result = await repository.findById(1);

      expect(result).toEqual(notification);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('id', 1);
    });

    it('should return undefined when notification does not exist', async () => {
      mockQueryBuilder.first.mockResolvedValue(undefined);

      const result = await repository.findById(999);

      expect(result).toBeUndefined();
    });
  });
});
