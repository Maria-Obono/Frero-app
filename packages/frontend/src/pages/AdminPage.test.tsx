import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';

import AdminPage from './AdminPage';

// --- Mocks ---

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/components/shared/Toast', () => ({
  useToast: () => ({ addToast: vi.fn(), removeToast: vi.fn(), toasts: [] }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockUser = { id: '1', username: 'admin', email: 'admin@test.com', role: 'admin' as const };
const mockRegularUser = { id: '2', username: 'user', email: 'user@test.com', role: 'user' as const };

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

function renderAdminPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as Mock).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
    });
  });

  describe('Access Control', () => {
    it('shows access denied for non-admin users', () => {
      (useAuth as Mock).mockReturnValue({
        user: mockRegularUser,
        isAuthenticated: true,
        isLoading: false,
      });

      renderAdminPage();
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });

    it('allows admin users to access the dashboard', () => {
      (api.get as Mock).mockResolvedValue({ data: { activeUsers: 100, totalPosts: 50, totalComments: 200, totalLikes: 500, userGrowth: 5, postGrowth: 10 } });

      renderAdminPage();
      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
    });

    it('allows moderator users to access the dashboard', () => {
      (useAuth as Mock).mockReturnValue({
        user: { ...mockUser, role: 'moderator' },
        isAuthenticated: true,
        isLoading: false,
      });
      (api.get as Mock).mockResolvedValue({ data: { activeUsers: 100, totalPosts: 50, totalComments: 200, totalLikes: 500, userGrowth: 5, postGrowth: 10 } });

      renderAdminPage();
      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
    });
  });

  describe('Analytics Tab', () => {
    it('shows skeleton loaders while loading analytics', () => {
      (api.get as Mock).mockReturnValue(new Promise(() => {}));
      const { container } = renderAdminPage();
      // Skeleton loaders are rendered with aria-hidden and animate-pulse class
      const skeletons = container.querySelectorAll('[aria-hidden="true"].animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('displays analytics metrics after loading', async () => {
      (api.get as Mock).mockResolvedValueOnce({
        data: {
          activeUsers: 1234,
          totalPosts: 567,
          totalComments: 890,
          totalLikes: 4321,
          userGrowth: 12,
          postGrowth: 8,
        },
      });

      renderAdminPage();

      await waitFor(() => {
        expect(screen.getByText('1.2K')).toBeInTheDocument();
        expect(screen.getByText('567')).toBeInTheDocument();
        expect(screen.getByText('890')).toBeInTheDocument();
        expect(screen.getByText('4.3K')).toBeInTheDocument();
      });
    });

    it('shows growth percentages', async () => {
      (api.get as Mock).mockResolvedValueOnce({
        data: {
          activeUsers: 100,
          totalPosts: 50,
          totalComments: 200,
          totalLikes: 500,
          userGrowth: 15,
          postGrowth: -3,
        },
      });

      renderAdminPage();

      await waitFor(() => {
        expect(screen.getByText(/15% from last month/)).toBeInTheDocument();
        expect(screen.getByText(/3% from last month/)).toBeInTheDocument();
      });
    });

    it('renders the activity chart', async () => {
      (api.get as Mock).mockResolvedValueOnce({
        data: {
          activeUsers: 100,
          totalPosts: 50,
          totalComments: 200,
          totalLikes: 500,
          userGrowth: 5,
          postGrowth: 10,
        },
      });

      renderAdminPage();

      await waitFor(() => {
        expect(screen.getByText('Activity (Last 30 Days)')).toBeInTheDocument();
      });
    });
  });

  describe('Moderation Tab', () => {
    it('shows pending reports', async () => {
      (api.get as Mock).mockImplementation((url: string) => {
        if (url === '/admin/analytics') {
          return Promise.resolve({ data: { activeUsers: 0, totalPosts: 0, totalComments: 0, totalLikes: 0, userGrowth: 0, postGrowth: 0 } });
        }
        if (url === '/admin/reports') {
          return Promise.resolve({
            data: {
              data: [
                {
                  id: 'r1',
                  reporter: { id: 'u1', username: 'reporter1' },
                  contentId: 'p1',
                  contentType: 'post',
                  reason: 'spam',
                  status: 'pending',
                  createdAt: '2024-01-15T10:00:00Z',
                  contentPreview: 'Some spam content',
                },
              ],
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      renderAdminPage();

      // Switch to moderation tab
      fireEvent.click(screen.getByText('Moderation'));

      await waitFor(() => {
        expect(screen.getByText('@reporter1')).toBeInTheDocument();
        expect(screen.getByText('spam')).toBeInTheDocument();
        expect(screen.getByText('Dismiss')).toBeInTheDocument();
        expect(screen.getByText('Warn User')).toBeInTheDocument();
        expect(screen.getByText('Remove Content')).toBeInTheDocument();
        expect(screen.getByText('Suspend User')).toBeInTheDocument();
      });
    });

    it('shows empty state when no pending reports', async () => {
      (api.get as Mock).mockImplementation((url: string) => {
        if (url === '/admin/reports') {
          return Promise.resolve({ data: { data: [] } });
        }
        return Promise.resolve({ data: { activeUsers: 0, totalPosts: 0, totalComments: 0, totalLikes: 0, userGrowth: 0, postGrowth: 0 } });
      });

      renderAdminPage();
      fireEvent.click(screen.getByText('Moderation'));

      await waitFor(() => {
        expect(screen.getByText('No pending reports')).toBeInTheDocument();
      });
    });
  });

  describe('Users Tab', () => {
    it('shows search input and button', () => {
      (api.get as Mock).mockResolvedValue({ data: { activeUsers: 0, totalPosts: 0, totalComments: 0, totalLikes: 0, userGrowth: 0, postGrowth: 0 } });

      renderAdminPage();
      fireEvent.click(screen.getByText('Users'));

      expect(screen.getByPlaceholderText('Search by username or email...')).toBeInTheDocument();
      expect(screen.getByText('Search')).toBeInTheDocument();
    });

    it('searches and displays users', async () => {
      (api.get as Mock).mockImplementation((url: string) => {
        if (url === '/admin/users') {
          return Promise.resolve({
            data: {
              data: [
                {
                  id: 'u1',
                  username: 'testuser',
                  email: 'test@example.com',
                  displayName: 'Test User',
                  avatarUrl: null,
                  role: 'user',
                  createdAt: '2024-01-01T00:00:00Z',
                  isSuspended: false,
                },
              ],
            },
          });
        }
        return Promise.resolve({ data: { activeUsers: 0, totalPosts: 0, totalComments: 0, totalLikes: 0, userGrowth: 0, postGrowth: 0 } });
      });

      renderAdminPage();
      fireEvent.click(screen.getByText('Users'));

      const input = screen.getByPlaceholderText('Search by username or email...');
      fireEvent.change(input, { target: { value: 'testuser' } });
      fireEvent.click(screen.getByText('Search'));

      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument();
        expect(screen.getByText('@testuser · test@example.com')).toBeInTheDocument();
      });
    });

    it('shows View Activity button for each user', async () => {
      (api.get as Mock).mockImplementation((url: string) => {
        if (url === '/admin/users') {
          return Promise.resolve({
            data: {
              data: [
                {
                  id: 'u1',
                  username: 'testuser',
                  email: 'test@example.com',
                  displayName: 'Test User',
                  avatarUrl: null,
                  role: 'user',
                  createdAt: '2024-01-01T00:00:00Z',
                  isSuspended: false,
                },
              ],
            },
          });
        }
        return Promise.resolve({ data: { activeUsers: 0, totalPosts: 0, totalComments: 0, totalLikes: 0, userGrowth: 0, postGrowth: 0 } });
      });

      renderAdminPage();
      fireEvent.click(screen.getByText('Users'));

      const input = screen.getByPlaceholderText('Search by username or email...');
      fireEvent.change(input, { target: { value: 'testuser' } });
      fireEvent.click(screen.getByText('Search'));

      await waitFor(() => {
        expect(screen.getByText('View Activity')).toBeInTheDocument();
      });
    });

    it('shows user activity detail view when View Activity is clicked', async () => {
      (api.get as Mock).mockImplementation((url: string) => {
        if (url === '/admin/users') {
          return Promise.resolve({
            data: {
              data: [
                {
                  id: 'u1',
                  username: 'testuser',
                  email: 'test@example.com',
                  displayName: 'Test User',
                  avatarUrl: null,
                  role: 'user',
                  createdAt: '2024-01-01T00:00:00Z',
                  isSuspended: false,
                },
              ],
            },
          });
        }
        if (url === '/admin/users/u1/activity') {
          return Promise.resolve({
            data: {
              data: [
                { id: 'a1', type: 'post', description: 'Created a new post', createdAt: '2024-01-15T10:00:00Z' },
                { id: 'a2', type: 'comment', description: 'Commented on a post', createdAt: '2024-01-14T09:00:00Z' },
                { id: 'a3', type: 'like', description: 'Liked a post', createdAt: '2024-01-13T08:00:00Z' },
              ],
            },
          });
        }
        return Promise.resolve({ data: { activeUsers: 0, totalPosts: 0, totalComments: 0, totalLikes: 0, userGrowth: 0, postGrowth: 0 } });
      });

      renderAdminPage();
      fireEvent.click(screen.getByText('Users'));

      const input = screen.getByPlaceholderText('Search by username or email...');
      fireEvent.change(input, { target: { value: 'testuser' } });
      fireEvent.click(screen.getByText('Search'));

      await waitFor(() => {
        expect(screen.getByText('View Activity')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View Activity'));

      await waitFor(() => {
        expect(screen.getByText('Recent Activity (last 100 entries)')).toBeInTheDocument();
        expect(screen.getByText('Created a new post')).toBeInTheDocument();
        expect(screen.getByText('Commented on a post')).toBeInTheDocument();
        expect(screen.getByText('Liked a post')).toBeInTheDocument();
      });
    });

    it('can navigate back from user detail view', async () => {
      (api.get as Mock).mockImplementation((url: string) => {
        if (url === '/admin/users') {
          return Promise.resolve({
            data: {
              data: [
                {
                  id: 'u1',
                  username: 'testuser',
                  email: 'test@example.com',
                  displayName: 'Test User',
                  avatarUrl: null,
                  role: 'user',
                  createdAt: '2024-01-01T00:00:00Z',
                  isSuspended: false,
                },
              ],
            },
          });
        }
        if (url === '/admin/users/u1/activity') {
          return Promise.resolve({ data: { data: [] } });
        }
        return Promise.resolve({ data: { activeUsers: 0, totalPosts: 0, totalComments: 0, totalLikes: 0, userGrowth: 0, postGrowth: 0 } });
      });

      renderAdminPage();
      fireEvent.click(screen.getByText('Users'));

      const input = screen.getByPlaceholderText('Search by username or email...');
      fireEvent.change(input, { target: { value: 'testuser' } });
      fireEvent.click(screen.getByText('Search'));

      await waitFor(() => {
        expect(screen.getByText('View Activity')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View Activity'));

      await waitFor(() => {
        expect(screen.getByText('Back to search')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Back to search'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search by username or email...')).toBeInTheDocument();
      });
    });
  });
});
