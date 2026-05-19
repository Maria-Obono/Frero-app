/**
 * Unit tests for AdminService.
 *
 * Tests cover:
 * - Requirement 11.1: Dashboard analytics (30-day: active users, posts, comments, likes)
 * - Requirement 11.2: Content reporting (reporter ID, content ID, reason, timestamp)
 * - Requirement 11.3: Moderation actions (dismiss, warn, remove content, suspend user)
 * - Requirement 11.4: Admin user search with activity history (last 100 entries)
 * - Requirement 11.5: Role enforcement (admin/moderator only)
 * - Requirement 11.6: User suspension with session invalidation (within 30s)
 */

import { AdminService } from '../../../src/services/admin/admin.service';
import { AdminRepository } from '../../../src/services/admin/admin.repository';
import {
  AdminServiceError,
  ReportRecord,
  ModerationAction,
  UserRole,
} from '../../../src/services/admin/types';

// Mock the database connection
jest.mock('../../../src/database/connection', () => ({
  getDatabase: jest.fn(),
}));

// Mock redis-utils
jest.mock('../../../src/utils/redis-utils', () => ({
  deleteAllUserSessions: jest.fn().mockResolvedValue(undefined),
}));

describe('AdminService', () => {
  let service: AdminService;
  let mockRepository: jest.Mocked<AdminRepository>;
  let mockInvalidateSessions: jest.Mock;

  function createReport(overrides: Partial<ReportRecord> = {}): ReportRecord {
    return {
      id: 1,
      reporter_id: 10,
      content_id: 100,
      content_type: 'post',
      reason: 'spam',
      status: 'pending',
      moderator_id: null,
      action_taken: null,
      reviewed_at: null,
      created_at: new Date('2024-01-15T12:00:00Z'),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();

    mockRepository = {
      getActiveUsersCount: jest.fn().mockResolvedValue(0),
      getPostsCount: jest.fn().mockResolvedValue(0),
      getCommentsCount: jest.fn().mockResolvedValue(0),
      getLikesCount: jest.fn().mockResolvedValue(0),
      createReport: jest.fn().mockResolvedValue(createReport()),
      findReportById: jest.fn().mockResolvedValue(null),
      updateReport: jest.fn().mockResolvedValue(createReport()),
      findUserById: jest.fn().mockResolvedValue(null),
      searchUsers: jest.fn().mockResolvedValue([]),
      getUserActivity: jest.fn().mockResolvedValue([]),
      getReportsForUser: jest.fn().mockResolvedValue([]),
      suspendUser: jest.fn().mockResolvedValue(undefined),
      liftSuspension: jest.fn().mockResolvedValue(undefined),
      removeContent: jest.fn().mockResolvedValue(undefined),
      getDb: jest.fn().mockReturnValue(jest.fn()),
    } as unknown as jest.Mocked<AdminRepository>;

    mockInvalidateSessions = jest.fn().mockResolvedValue(undefined);

    service = new AdminService({
      repository: mockRepository,
      invalidateSessions: mockInvalidateSessions,
    });
  });

  // ─── Role Enforcement (Req 11.5) ─────────────────────────────────────────

  describe('enforceAdminRole()', () => {
    it('should allow admin role', () => {
      expect(() => service.enforceAdminRole('admin')).not.toThrow();
    });

    it('should allow moderator role', () => {
      expect(() => service.enforceAdminRole('moderator')).not.toThrow();
    });

    it('should reject user role with 403', () => {
      expect(() => service.enforceAdminRole('user')).toThrow(AdminServiceError);
      try {
        service.enforceAdminRole('user');
      } catch (error) {
        expect((error as AdminServiceError).statusCode).toBe(403);
        expect((error as AdminServiceError).message).toBe('Insufficient permissions');
      }
    });

    it('should reject invalid role', () => {
      expect(() => service.enforceAdminRole('invalid' as UserRole)).toThrow(AdminServiceError);
    });
  });

  // ─── getDashboardAnalytics() (Req 11.1) ──────────────────────────────────

  describe('getDashboardAnalytics()', () => {
    it('should return analytics for default 30-day period', async () => {
      mockRepository.getActiveUsersCount.mockResolvedValue(150);
      mockRepository.getPostsCount.mockResolvedValue(500);
      mockRepository.getCommentsCount.mockResolvedValue(1200);
      mockRepository.getLikesCount.mockResolvedValue(3000);

      const result = await service.getDashboardAnalytics('admin');

      expect(result).toEqual({
        period: 30,
        activeUsers: 150,
        totalPosts: 500,
        totalComments: 1200,
        totalLikes: 3000,
      });
    });

    it('should accept custom period', async () => {
      mockRepository.getActiveUsersCount.mockResolvedValue(50);
      mockRepository.getPostsCount.mockResolvedValue(100);
      mockRepository.getCommentsCount.mockResolvedValue(200);
      mockRepository.getLikesCount.mockResolvedValue(500);

      const result = await service.getDashboardAnalytics('admin', 7);

      expect(result.period).toBe(7);
      expect(mockRepository.getActiveUsersCount).toHaveBeenCalled();
    });

    it('should reject non-admin/moderator role', async () => {
      await expect(service.getDashboardAnalytics('user')).rejects.toThrow(AdminServiceError);
      await expect(service.getDashboardAnalytics('user')).rejects.toThrow(
        'Insufficient permissions',
      );
    });

    it('should allow moderator role', async () => {
      mockRepository.getActiveUsersCount.mockResolvedValue(10);
      mockRepository.getPostsCount.mockResolvedValue(20);
      mockRepository.getCommentsCount.mockResolvedValue(30);
      mockRepository.getLikesCount.mockResolvedValue(40);

      const result = await service.getDashboardAnalytics('moderator');

      expect(result.activeUsers).toBe(10);
    });

    it('should reject invalid period (< 1)', async () => {
      await expect(service.getDashboardAnalytics('admin', 0)).rejects.toThrow(AdminServiceError);
      await expect(service.getDashboardAnalytics('admin', 0)).rejects.toThrow('Invalid period');
    });

    it('should reject invalid period (> 365)', async () => {
      await expect(service.getDashboardAnalytics('admin', 400)).rejects.toThrow(
        AdminServiceError,
      );
    });

    it('should pass correct date to repository', async () => {
      const now = new Date();
      mockRepository.getActiveUsersCount.mockResolvedValue(0);
      mockRepository.getPostsCount.mockResolvedValue(0);
      mockRepository.getCommentsCount.mockResolvedValue(0);
      mockRepository.getLikesCount.mockResolvedValue(0);

      await service.getDashboardAnalytics('admin', 30);

      const calledDate = mockRepository.getActiveUsersCount.mock.calls[0]![0] as Date;
      const expectedDate = new Date(now);
      expectedDate.setDate(expectedDate.getDate() - 30);

      // Allow 1 second tolerance for test execution time
      expect(Math.abs(calledDate.getTime() - expectedDate.getTime())).toBeLessThan(1000);
    });
  });

  // ─── reportContent() (Req 11.2) ──────────────────────────────────────────

  describe('reportContent()', () => {
    it('should create a report with valid inputs', async () => {
      const expectedReport = createReport({
        reporter_id: 5,
        content_id: 42,
        content_type: 'post',
        reason: 'spam',
      });
      mockRepository.createReport.mockResolvedValue(expectedReport);

      const result = await service.reportContent(5, 42, 'post', 'spam');

      expect(result).toEqual(expectedReport);
      expect(mockRepository.createReport).toHaveBeenCalledWith({
        reporter_id: 5,
        content_id: 42,
        content_type: 'post',
        reason: 'spam',
      });
    });

    it('should accept all valid reason types', async () => {
      const reasons = [
        'spam',
        'harassment',
        'inappropriate',
        'violence',
        'misinformation',
        'other',
      ] as const;

      for (const reason of reasons) {
        mockRepository.createReport.mockResolvedValue(createReport({ reason }));
        const result = await service.reportContent(1, 1, 'post', reason);
        expect(result.reason).toBe(reason);
      }
    });

    it('should accept all valid content types', async () => {
      const types = ['post', 'reel', 'comment', 'story', 'user', 'message'] as const;

      for (const contentType of types) {
        mockRepository.createReport.mockResolvedValue(createReport({ content_type: contentType }));
        const result = await service.reportContent(1, 1, contentType, 'spam');
        expect(result.content_type).toBe(contentType);
      }
    });

    it('should reject invalid reason', async () => {
      await expect(
        service.reportContent(1, 1, 'post', 'invalid_reason' as any),
      ).rejects.toThrow(AdminServiceError);
      await expect(
        service.reportContent(1, 1, 'post', 'invalid_reason' as any),
      ).rejects.toThrow('Invalid report reason');
    });

    it('should reject invalid content type', async () => {
      await expect(
        service.reportContent(1, 1, 'invalid_type' as any, 'spam'),
      ).rejects.toThrow(AdminServiceError);
      await expect(
        service.reportContent(1, 1, 'invalid_type' as any, 'spam'),
      ).rejects.toThrow('Invalid content type');
    });

    it('should reject invalid reporter ID (0)', async () => {
      await expect(service.reportContent(0, 1, 'post', 'spam')).rejects.toThrow(
        AdminServiceError,
      );
      await expect(service.reportContent(0, 1, 'post', 'spam')).rejects.toThrow(
        'Invalid reporter ID',
      );
    });

    it('should reject negative reporter ID', async () => {
      await expect(service.reportContent(-1, 1, 'post', 'spam')).rejects.toThrow(
        AdminServiceError,
      );
    });

    it('should reject invalid content ID (0)', async () => {
      await expect(service.reportContent(1, 0, 'post', 'spam')).rejects.toThrow(
        AdminServiceError,
      );
      await expect(service.reportContent(1, 0, 'post', 'spam')).rejects.toThrow(
        'Invalid content ID',
      );
    });
  });

  // ─── reviewReport() (Req 11.3) ───────────────────────────────────────────

  describe('reviewReport()', () => {
    it('should dismiss a report', async () => {
      const pendingReport = createReport({ id: 1, status: 'pending' });
      const dismissedReport = createReport({
        id: 1,
        status: 'dismissed',
        moderator_id: 99,
        action_taken: 'dismiss',
        reviewed_at: new Date(),
      });

      mockRepository.findReportById.mockResolvedValue(pendingReport);
      mockRepository.updateReport.mockResolvedValue(dismissedReport);

      const result = await service.reviewReport(1, 99, 'dismiss', 'admin');

      expect(result.status).toBe('dismissed');
      expect(result.action_taken).toBe('dismiss');
      expect(mockRepository.updateReport).toHaveBeenCalledWith(1, {
        moderator_id: 99,
        action_taken: 'dismiss',
        status: 'dismissed',
        reviewed_at: expect.any(Date),
      });
    });

    it('should warn a user', async () => {
      const pendingReport = createReport({ id: 2, status: 'pending' });
      const reviewedReport = createReport({
        id: 2,
        status: 'reviewed',
        moderator_id: 99,
        action_taken: 'warn',
        reviewed_at: new Date(),
      });

      mockRepository.findReportById.mockResolvedValue(pendingReport);
      mockRepository.updateReport.mockResolvedValue(reviewedReport);

      const result = await service.reviewReport(2, 99, 'warn', 'moderator');

      expect(result.status).toBe('reviewed');
      expect(result.action_taken).toBe('warn');
    });

    it('should remove content', async () => {
      const pendingReport = createReport({
        id: 3,
        status: 'pending',
        content_id: 50,
        content_type: 'post',
      });
      const reviewedReport = createReport({
        id: 3,
        status: 'reviewed',
        moderator_id: 99,
        action_taken: 'remove_content',
      });

      mockRepository.findReportById.mockResolvedValue(pendingReport);
      mockRepository.updateReport.mockResolvedValue(reviewedReport);

      const result = await service.reviewReport(3, 99, 'remove_content', 'admin');

      expect(result.action_taken).toBe('remove_content');
      expect(mockRepository.removeContent).toHaveBeenCalledWith(50, 'post');
    });

    it('should suspend user and invalidate sessions', async () => {
      const pendingReport = createReport({
        id: 4,
        status: 'pending',
        content_id: 200,
        content_type: 'post',
      });
      const reviewedReport = createReport({
        id: 4,
        status: 'reviewed',
        moderator_id: 99,
        action_taken: 'suspend_user',
      });

      // Mock getDb to return a function that resolves content owner
      const mockDbQuery = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            first: jest.fn().mockResolvedValue({ user_id: 77 }),
          }),
        }),
      });
      mockRepository.getDb.mockReturnValue(mockDbQuery as any);

      mockRepository.findReportById.mockResolvedValue(pendingReport);
      mockRepository.updateReport.mockResolvedValue(reviewedReport);

      const result = await service.reviewReport(4, 99, 'suspend_user', 'admin');

      expect(result.action_taken).toBe('suspend_user');
      expect(mockRepository.suspendUser).toHaveBeenCalledWith(77);
      expect(mockInvalidateSessions).toHaveBeenCalledWith('77');
    });

    it('should reject non-admin/moderator role', async () => {
      await expect(service.reviewReport(1, 99, 'dismiss', 'user')).rejects.toThrow(
        AdminServiceError,
      );
      await expect(service.reviewReport(1, 99, 'dismiss', 'user')).rejects.toThrow(
        'Insufficient permissions',
      );
    });

    it('should reject invalid action', async () => {
      await expect(
        service.reviewReport(1, 99, 'invalid_action' as ModerationAction, 'admin'),
      ).rejects.toThrow(AdminServiceError);
      await expect(
        service.reviewReport(1, 99, 'invalid_action' as ModerationAction, 'admin'),
      ).rejects.toThrow('Invalid moderation action');
    });

    it('should reject when report not found', async () => {
      mockRepository.findReportById.mockResolvedValue(undefined);

      await expect(service.reviewReport(999, 99, 'dismiss', 'admin')).rejects.toThrow(
        AdminServiceError,
      );
      await expect(service.reviewReport(999, 99, 'dismiss', 'admin')).rejects.toThrow(
        'Report not found',
      );
    });

    it('should reject when report already reviewed', async () => {
      const reviewedReport = createReport({ id: 1, status: 'reviewed' });
      mockRepository.findReportById.mockResolvedValue(reviewedReport);

      await expect(service.reviewReport(1, 99, 'dismiss', 'admin')).rejects.toThrow(
        AdminServiceError,
      );
      await expect(service.reviewReport(1, 99, 'dismiss', 'admin')).rejects.toThrow(
        'Report already reviewed',
      );
    });
  });

  // ─── searchUser() (Req 11.4) ─────────────────────────────────────────────

  describe('searchUser()', () => {
    it('should return user with activity and reports', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        display_name: 'Test User',
        avatar_url: null,
        role: 'user',
        created_at: new Date('2024-01-01'),
        locked_until: null,
      };

      const mockActivity = [
        {
          id: 1,
          type: 'post' as const,
          content_id: 10,
          content_preview: 'Hello world',
          created_at: new Date('2024-01-15'),
        },
      ];

      const mockReports = [createReport({ content_id: 10 })];

      mockRepository.searchUsers.mockResolvedValue([mockUser]);
      mockRepository.getUserActivity.mockResolvedValue(mockActivity);
      mockRepository.getReportsForUser.mockResolvedValue(mockReports);

      const result = await service.searchUser('testuser', 'admin');

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(1);
      expect(result[0]!.username).toBe('testuser');
      expect(result[0]!.activity).toHaveLength(1);
      expect(result[0]!.reports).toHaveLength(1);
      expect(result[0]!.is_suspended).toBe(false);
    });

    it('should mark user as suspended when locked_until is in the future', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const mockUser = {
        id: 2,
        email: 'suspended@example.com',
        username: 'suspended',
        display_name: null,
        avatar_url: null,
        role: 'user',
        created_at: new Date('2024-01-01'),
        locked_until: futureDate,
      };

      mockRepository.searchUsers.mockResolvedValue([mockUser]);
      mockRepository.getUserActivity.mockResolvedValue([]);
      mockRepository.getReportsForUser.mockResolvedValue([]);

      const result = await service.searchUser('suspended', 'admin');

      expect(result[0]!.is_suspended).toBe(true);
    });

    it('should reject non-admin/moderator role', async () => {
      await expect(service.searchUser('test', 'user')).rejects.toThrow(AdminServiceError);
      await expect(service.searchUser('test', 'user')).rejects.toThrow(
        'Insufficient permissions',
      );
    });

    it('should reject empty query', async () => {
      await expect(service.searchUser('', 'admin')).rejects.toThrow(AdminServiceError);
      await expect(service.searchUser('', 'admin')).rejects.toThrow('Search query required');
    });

    it('should reject whitespace-only query', async () => {
      await expect(service.searchUser('   ', 'admin')).rejects.toThrow(AdminServiceError);
    });

    it('should return empty array when no users found', async () => {
      mockRepository.searchUsers.mockResolvedValue([]);

      const result = await service.searchUser('nonexistent', 'admin');

      expect(result).toHaveLength(0);
    });

    it('should return multiple users matching query', async () => {
      const users = [
        {
          id: 1,
          email: 'john@example.com',
          username: 'john',
          display_name: 'John',
          avatar_url: null,
          role: 'user',
          created_at: new Date(),
          locked_until: null,
        },
        {
          id: 2,
          email: 'johnny@example.com',
          username: 'johnny',
          display_name: 'Johnny',
          avatar_url: null,
          role: 'user',
          created_at: new Date(),
          locked_until: null,
        },
      ];

      mockRepository.searchUsers.mockResolvedValue(users);
      mockRepository.getUserActivity.mockResolvedValue([]);
      mockRepository.getReportsForUser.mockResolvedValue([]);

      const result = await service.searchUser('john', 'moderator');

      expect(result).toHaveLength(2);
    });
  });

  // ─── suspendUser() (Req 11.6) ────────────────────────────────────────────

  describe('suspendUser()', () => {
    it('should suspend user and invalidate sessions', async () => {
      mockRepository.findUserById.mockResolvedValue({
        id: 5,
        role: 'user',
        locked_until: null,
      });

      await service.suspendUser(5, 1, 'admin');

      expect(mockRepository.suspendUser).toHaveBeenCalledWith(5);
      expect(mockInvalidateSessions).toHaveBeenCalledWith('5');
    });

    it('should reject non-admin/moderator role', async () => {
      await expect(service.suspendUser(5, 1, 'user')).rejects.toThrow(AdminServiceError);
      await expect(service.suspendUser(5, 1, 'user')).rejects.toThrow(
        'Insufficient permissions',
      );
    });

    it('should reject when user not found', async () => {
      mockRepository.findUserById.mockResolvedValue(undefined);

      await expect(service.suspendUser(999, 1, 'admin')).rejects.toThrow(AdminServiceError);
      await expect(service.suspendUser(999, 1, 'admin')).rejects.toThrow('User not found');
    });

    it('should reject moderator trying to suspend admin', async () => {
      mockRepository.findUserById.mockResolvedValue({
        id: 5,
        role: 'admin',
        locked_until: null,
      });

      await expect(service.suspendUser(5, 10, 'moderator')).rejects.toThrow(AdminServiceError);
      await expect(service.suspendUser(5, 10, 'moderator')).rejects.toThrow(
        'Cannot suspend admin',
      );
    });

    it('should allow admin to suspend moderator', async () => {
      mockRepository.findUserById.mockResolvedValue({
        id: 5,
        role: 'moderator',
        locked_until: null,
      });

      await service.suspendUser(5, 1, 'admin');

      expect(mockRepository.suspendUser).toHaveBeenCalledWith(5);
      expect(mockInvalidateSessions).toHaveBeenCalledWith('5');
    });

    it('should reject self-suspension', async () => {
      mockRepository.findUserById.mockResolvedValue({
        id: 1,
        role: 'user',
        locked_until: null,
      });

      await expect(service.suspendUser(1, 1, 'admin')).rejects.toThrow(AdminServiceError);
      await expect(service.suspendUser(1, 1, 'admin')).rejects.toThrow(
        'Cannot suspend self',
      );
    });

    it('should call invalidateSessions with string userId', async () => {
      mockRepository.findUserById.mockResolvedValue({
        id: 42,
        role: 'user',
        locked_until: null,
      });

      await service.suspendUser(42, 1, 'admin');

      expect(mockInvalidateSessions).toHaveBeenCalledWith('42');
    });
  });

  // ─── liftSuspension() (Req 11.6) ─────────────────────────────────────────

  describe('liftSuspension()', () => {
    it('should lift suspension for a user', async () => {
      mockRepository.findUserById.mockResolvedValue({
        id: 5,
        role: 'user',
        locked_until: new Date('2099-12-31'),
      });

      await service.liftSuspension(5, 1, 'admin');

      expect(mockRepository.liftSuspension).toHaveBeenCalledWith(5);
    });

    it('should reject non-admin/moderator role', async () => {
      await expect(service.liftSuspension(5, 1, 'user')).rejects.toThrow(AdminServiceError);
      await expect(service.liftSuspension(5, 1, 'user')).rejects.toThrow(
        'Insufficient permissions',
      );
    });

    it('should reject when user not found', async () => {
      mockRepository.findUserById.mockResolvedValue(undefined);

      await expect(service.liftSuspension(999, 1, 'admin')).rejects.toThrow(AdminServiceError);
      await expect(service.liftSuspension(999, 1, 'admin')).rejects.toThrow('User not found');
    });

    it('should allow moderator to lift suspension', async () => {
      mockRepository.findUserById.mockResolvedValue({
        id: 5,
        role: 'user',
        locked_until: new Date('2099-12-31'),
      });

      await service.liftSuspension(5, 10, 'moderator');

      expect(mockRepository.liftSuspension).toHaveBeenCalledWith(5);
    });
  });
});
