import * as fc from 'fast-check';
import { AdminService } from '../../src/services/admin/admin.service';
import { AdminServiceError, UserRole } from '../../src/services/admin/types';

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * Create a mock AdminRepository that returns valid data for all queries.
 * This allows us to test role enforcement without needing a real database.
 */
function createMockRepository() {
  return {
    getActiveUsersCount: jest.fn(async () => 100),
    getPostsCount: jest.fn(async () => 500),
    getCommentsCount: jest.fn(async () => 1200),
    getLikesCount: jest.fn(async () => 3000),
    searchUsers: jest.fn(async () => [
      {
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        display_name: 'Test User',
        avatar_url: null,
        role: 'user' as UserRole,
        created_at: new Date(),
        locked_until: null,
      },
    ]),
    getUserActivity: jest.fn(async () => []),
    getReportsForUser: jest.fn(async () => []),
    findUserById: jest.fn(async () => ({
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      display_name: 'Test User',
      avatar_url: null,
      role: 'user' as UserRole,
      created_at: new Date(),
      locked_until: null,
    })),
    suspendUser: jest.fn(async () => {}),
    liftSuspension: jest.fn(async () => {}),
    findReportById: jest.fn(async () => ({
      id: 1,
      reporter_id: 2,
      content_id: 10,
      content_type: 'post',
      reason: 'spam',
      status: 'pending',
      moderator_id: null,
      action_taken: null,
      reviewed_at: null,
      created_at: new Date(),
    })),
    updateReport: jest.fn(async (_id: number, data: any) => ({
      id: 1,
      reporter_id: 2,
      content_id: 10,
      content_type: 'post',
      reason: 'spam',
      status: data.status || 'reviewed',
      moderator_id: data.moderator_id,
      action_taken: data.action_taken,
      reviewed_at: data.reviewed_at,
      created_at: new Date(),
    })),
    removeContent: jest.fn(async () => {}),
    createReport: jest.fn(async () => ({})),
    getDb: jest.fn(() => jest.fn()),
  };
}

/**
 * Create an AdminService instance with mocked dependencies.
 */
function createAdminService() {
  const mockRepo = createMockRepository();
  const mockInvalidateSessions = jest.fn(async () => {});

  const service = new AdminService({
    repository: mockRepo as any,
    invalidateSessions: mockInvalidateSessions,
  });

  return { service, mockRepo, mockInvalidateSessions };
}

// ============================================================================
// fast-check Arbitraries
// ============================================================================

/**
 * Generate valid admin/moderator roles that should be accepted.
 */
const validAdminRoleArb = fc.constantFrom<UserRole>('admin', 'moderator');

/**
 * Generate the 'user' role which should always be rejected.
 */
const userRoleArb = fc.constant<UserRole>('user');

/**
 * Generate arbitrary string roles (non-admin/moderator) that should be rejected.
 * This includes 'user' and random strings that are not 'admin' or 'moderator'.
 */
const invalidRoleArb = fc.oneof(
  userRoleArb,
  fc
    .string({ minLength: 1, maxLength: 30 })
    .filter((s) => s !== 'admin' && s !== 'moderator')
    .map((s) => s as UserRole),
);

/**
 * Generate an admin method name to test across all admin endpoints.
 */
const adminMethodArb = fc.constantFrom(
  'getDashboardAnalytics',
  'searchUser',
  'suspendUser',
  'liftSuspension',
  'reviewReport',
);

// ============================================================================
// Property 32: Admin role enforcement
// ============================================================================

describe('Feature: frero-social-platform, Property 32: Admin role enforcement', () => {
  /**
   * **Validates: Requirements 11.5**
   *
   * IF a user without an admin or moderator role attempts to access any admin endpoint,
   * THEN THE Admin_Service SHALL reject the request and return an error indicating
   * insufficient permissions.
   */

  it('should ALWAYS reject non-admin/moderator roles with 403 across all admin methods', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidRoleArb,
        adminMethodArb,
        async (role, method) => {
          const { service } = createAdminService();

          let error: AdminServiceError | null = null;

          try {
            switch (method) {
              case 'getDashboardAnalytics':
                await service.getDashboardAnalytics(role);
                break;
              case 'searchUser':
                await service.searchUser('test', role);
                break;
              case 'suspendUser':
                await service.suspendUser(1, 99, role);
                break;
              case 'liftSuspension':
                await service.liftSuspension(1, 99, role);
                break;
              case 'reviewReport':
                await service.reviewReport(1, 99, 'dismiss', role);
                break;
            }
          } catch (e) {
            error = e as AdminServiceError;
          }

          // Assert: the request was rejected
          expect(error).not.toBeNull();
          expect(error).toBeInstanceOf(AdminServiceError);
          expect(error!.statusCode).toBe(403);
          expect(error!.message).toBe('Insufficient permissions');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should ALWAYS accept admin role across all admin methods', async () => {
    await fc.assert(
      fc.asyncProperty(
        adminMethodArb,
        async (method) => {
          const { service } = createAdminService();

          // Should NOT throw an AdminServiceError with 403
          let permissionError: AdminServiceError | null = null;

          try {
            switch (method) {
              case 'getDashboardAnalytics':
                await service.getDashboardAnalytics('admin');
                break;
              case 'searchUser':
                await service.searchUser('test', 'admin');
                break;
              case 'suspendUser':
                await service.suspendUser(1, 99, 'admin');
                break;
              case 'liftSuspension':
                await service.liftSuspension(1, 99, 'admin');
                break;
              case 'reviewReport':
                await service.reviewReport(1, 99, 'dismiss', 'admin');
                break;
            }
          } catch (e) {
            if (
              e instanceof AdminServiceError &&
              e.statusCode === 403 &&
              e.message === 'Insufficient permissions'
            ) {
              permissionError = e;
            }
            // Other errors (e.g., 400, 404) are acceptable — they mean the role check passed
          }

          // Assert: no permission error was thrown
          expect(permissionError).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should ALWAYS accept moderator role across all admin methods', async () => {
    await fc.assert(
      fc.asyncProperty(
        adminMethodArb,
        async (method) => {
          const { service } = createAdminService();

          // Should NOT throw an AdminServiceError with 403 for insufficient permissions
          let permissionError: AdminServiceError | null = null;

          try {
            switch (method) {
              case 'getDashboardAnalytics':
                await service.getDashboardAnalytics('moderator');
                break;
              case 'searchUser':
                await service.searchUser('test', 'moderator');
                break;
              case 'suspendUser':
                await service.suspendUser(1, 99, 'moderator');
                break;
              case 'liftSuspension':
                await service.liftSuspension(1, 99, 'moderator');
                break;
              case 'reviewReport':
                await service.reviewReport(1, 99, 'dismiss', 'moderator');
                break;
            }
          } catch (e) {
            if (
              e instanceof AdminServiceError &&
              e.statusCode === 403 &&
              e.message === 'Insufficient permissions'
            ) {
              permissionError = e;
            }
            // Other errors (e.g., 400, 404) are acceptable — they mean the role check passed
          }

          // Assert: no permission error was thrown
          expect(permissionError).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should ALWAYS accept valid admin/moderator roles and reject all others', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(validAdminRoleArb, invalidRoleArb),
        async (role) => {
          const { service } = createAdminService();
          const isValidRole = role === 'admin' || role === 'moderator';

          let threw403 = false;

          try {
            service.enforceAdminRole(role);
          } catch (e) {
            if (e instanceof AdminServiceError && e.statusCode === 403) {
              threw403 = true;
            }
          }

          // Assert: valid roles pass, invalid roles get 403
          if (isValidRole) {
            expect(threw403).toBe(false);
          } else {
            expect(threw403).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should include error details with INSUFFICIENT_PERMISSIONS code when rejecting', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidRoleArb,
        async (role) => {
          const { service } = createAdminService();

          let error: AdminServiceError | null = null;

          try {
            service.enforceAdminRole(role);
          } catch (e) {
            error = e as AdminServiceError;
          }

          // Assert: error has proper structure
          expect(error).not.toBeNull();
          expect(error!.details).toBeDefined();
          expect(error!.details!.code).toBe('INSUFFICIENT_PERMISSIONS');
          expect(error!.details!.message).toBe(
            'Access denied. Admin or moderator role required.',
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
