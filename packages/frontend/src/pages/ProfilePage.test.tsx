import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock modules
vi.mock('@/lib/api', () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  return { default: mockApi };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@test.com', username: 'testuser', role: 'user' },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

const mockAddToast = vi.fn();
const mockToastValue = {
  addToast: mockAddToast,
  removeToast: vi.fn(),
  toasts: [] as never[],
};
vi.mock('@/components/shared/Toast', () => ({
  useToast: () => mockToastValue,
}));

vi.mock('@/components/feed/PostCard', () => ({
  PostCard: ({ post }: { post: { id: string; content?: string } }) => (
    <div data-testid={`post-${post.id}`}>{post.content}</div>
  ),
}));

vi.mock('@/components/shared/SkeletonLoader', () => ({
  PostCardSkeleton: () => <div data-testid="post-skeleton" />,
}));

vi.mock('@/components/shared/Modal', () => ({
  Modal: ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title?: string; children: React.ReactNode }) => {
    if (!isOpen) return null;
    return (
      <div role="dialog" aria-modal="true">
        {title && <h2>{title}</h2>}
        <button onClick={onClose} aria-label="Close modal">Close</button>
        {children}
      </div>
    );
  },
}));

import api from '@/lib/api';
import ProfilePage from './ProfilePage';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mockProfile = {
  id: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  bio: 'Hello world',
  location: 'NYC',
  website: 'https://example.com',
  avatarUrl: 'https://cdn.example.com/avatar.jpg',
  coverUrl: 'https://cdn.example.com/cover.jpg',
  postCount: 10,
  friendCount: 5,
  followerCount: 20,
  followingCount: 15,
  isFriend: false,
  isFollowing: false,
  friendRequestSent: false,
  friendRequestReceived: false,
};

const mockPosts = {
  data: [
    { id: 'post-1', author: { id: 'user-1', username: 'testuser' }, type: 'text', content: 'Hello', likeCount: 0, commentCount: 0, shareCount: 0, isLiked: false, isBookmarked: false, createdAt: new Date().toISOString() },
    { id: 'post-2', author: { id: 'user-1', username: 'testuser' }, type: 'text', content: 'World', likeCount: 0, commentCount: 0, shareCount: 0, isLiked: false, isBookmarked: false, createdAt: new Date().toISOString() },
  ],
};

function renderProfilePage(path = '/profile') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profile/:userId?" element={<ProfilePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes('/users/')) return Promise.resolve({ data: mockProfile });
      if (url.includes('/posts')) return Promise.resolve({ data: mockPosts });
      return Promise.reject(new Error('Not found'));
    });
  });

  it('shows skeleton loader while loading', () => {
    // Make API never resolve
    mockApi.get.mockReturnValue(new Promise(() => {}));
    renderProfilePage();
    expect(screen.getByLabelText('Loading profile')).toBeInTheDocument();
  });

  it('renders profile header with display name and username', async () => {
    renderProfilePage();
    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });
    expect(screen.getByText('@testuser')).toBeInTheDocument();
  });

  it('renders profile bio, location, and website', async () => {
    renderProfilePage();
    await waitFor(() => {
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });
    expect(screen.getByText('NYC')).toBeInTheDocument();
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
  });

  it('renders profile stats (posts, friends, followers)', async () => {
    renderProfilePage();
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
    });
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('renders avatar image', async () => {
    renderProfilePage();
    await waitFor(() => {
      const avatar = screen.getByAltText("Test User's avatar");
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute('src', 'https://cdn.example.com/avatar.jpg');
    });
  });

  it('renders cover photo', async () => {
    renderProfilePage();
    await waitFor(() => {
      const cover = screen.getByAltText('Cover photo');
      expect(cover).toBeInTheDocument();
      expect(cover).toHaveAttribute('src', 'https://cdn.example.com/cover.jpg');
    });
  });

  it('shows Edit Profile button for own profile', async () => {
    renderProfilePage();
    await waitFor(() => {
      expect(screen.getByText('Edit Profile')).toBeInTheDocument();
    });
  });

  it('shows friend request and follow buttons for other users', async () => {
    const otherProfile = { ...mockProfile, id: 'user-2', username: 'other' };
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes('/users/')) return Promise.resolve({ data: otherProfile });
      if (url.includes('/posts')) return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error('Not found'));
    });

    renderProfilePage('/profile/user-2');
    await waitFor(() => {
      expect(screen.getByText('Send Request')).toBeInTheDocument();
    });
    expect(screen.getByText('Follow')).toBeInTheDocument();
  });

  it('shows Pending when friend request is already sent', async () => {
    const pendingProfile = { ...mockProfile, id: 'user-2', friendRequestSent: true };
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes('/users/')) return Promise.resolve({ data: pendingProfile });
      if (url.includes('/posts')) return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error('Not found'));
    });

    renderProfilePage('/profile/user-2');
    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
  });

  it('shows Friends badge when already friends', async () => {
    const friendProfile = { ...mockProfile, id: 'user-2', isFriend: true };
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes('/users/')) return Promise.resolve({ data: friendProfile });
      if (url.includes('/posts')) return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error('Not found'));
    });

    renderProfilePage('/profile/user-2');
    await waitFor(() => {
      expect(screen.getByText('Friends')).toBeInTheDocument();
    });
  });

  it('shows Unfollow button when already following', async () => {
    const followingProfile = { ...mockProfile, id: 'user-2', isFollowing: true };
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes('/users/')) return Promise.resolve({ data: followingProfile });
      if (url.includes('/posts')) return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error('Not found'));
    });

    renderProfilePage('/profile/user-2');
    await waitFor(() => {
      expect(screen.getByText('Unfollow')).toBeInTheDocument();
    });
  });

  it('renders posts in list view by default', async () => {
    renderProfilePage();
    await waitFor(() => {
      expect(screen.getByTestId('post-post-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('post-post-2')).toBeInTheDocument();
  });

  it('toggles between grid and list view', async () => {
    const user = userEvent.setup();
    renderProfilePage();

    await waitFor(() => {
      expect(screen.getByTestId('post-post-1')).toBeInTheDocument();
    });

    // Switch to grid view
    await user.click(screen.getByLabelText('Grid view'));
    // In grid view, PostCard is not rendered - grid items are rendered instead
    expect(screen.queryByTestId('post-post-1')).not.toBeInTheDocument();
  });

  it('shows "No posts yet" when user has no posts', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes('/users/')) return Promise.resolve({ data: mockProfile });
      if (url.includes('/posts')) return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error('Not found'));
    });

    renderProfilePage();
    await waitFor(() => {
      expect(screen.getByText('No posts yet')).toBeInTheDocument();
    });
  });

  it('shows "Profile not found" when profile fetch fails', async () => {
    mockApi.get.mockRejectedValue(new Error('Not found'));
    renderProfilePage();
    await waitFor(() => {
      expect(screen.getByText('Profile not found')).toBeInTheDocument();
    });
  });

  describe('Profile Edit Form', () => {
    async function openEditModal() {
      const user = userEvent.setup();
      renderProfilePage();
      await waitFor(() => {
        expect(screen.getByText('Edit Profile')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Edit Profile'));
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      return user;
    }

    it('opens edit modal when Edit Profile is clicked', async () => {
      await openEditModal();
      expect(screen.getByText('Edit Profile', { selector: 'h2' })).toBeInTheDocument();
    });

    it('pre-fills form with current profile data', async () => {
      await openEditModal();
      expect(screen.getByDisplayValue('Test User')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Hello world')).toBeInTheDocument();
      expect(screen.getByDisplayValue('NYC')).toBeInTheDocument();
      expect(screen.getByDisplayValue('https://example.com')).toBeInTheDocument();
    });

    it('shows character count for bio field', async () => {
      await openEditModal();
      expect(screen.getByText('11/500')).toBeInTheDocument();
    });

    it('shows character count for display name field', async () => {
      await openEditModal();
      expect(screen.getByText('9/50')).toBeInTheDocument();
    });

    it('validates display name is required', async () => {
      const user = await openEditModal();
      const nameInput = screen.getByDisplayValue('Test User');
      await user.clear(nameInput);
      await user.click(screen.getByText('Save Changes'));
      expect(screen.getByText('Display name is required')).toBeInTheDocument();
    });

    it('validates display name max 50 characters', async () => {
      const user = await openEditModal();
      const nameInput = screen.getByDisplayValue('Test User');
      await user.clear(nameInput);
      // The input has maxLength=50, so we test the validation message
      // by directly checking the validation function behavior
      await user.type(nameInput, 'A'.repeat(50));
      // Should not show error at exactly 50
      await user.click(screen.getByText('Save Changes'));
      expect(screen.queryByText('Display name must be at most 50 characters')).not.toBeInTheDocument();
    });

    it('submits profile update successfully', async () => {
      mockApi.put.mockResolvedValue({ data: { ...mockProfile, displayName: 'Updated Name' } });
      const user = await openEditModal();
      const nameInput = screen.getByDisplayValue('Test User');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Name');
      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockApi.put).toHaveBeenCalledWith('/users/user-1', expect.objectContaining({
          displayName: 'Updated Name',
        }));
      });
    });

    it('shows avatar upload button', async () => {
      await openEditModal();
      expect(screen.getByText('Change Photo')).toBeInTheDocument();
    });

    it('shows cover photo upload area', async () => {
      await openEditModal();
      expect(screen.getByText('Cover Photo', { exact: false })).toBeInTheDocument();
      expect(screen.getByText('(1500×500)')).toBeInTheDocument();
    });
  });
});
