import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/shared/Toast';
import { PostCard, type Post } from '@/components/feed/PostCard';
import { PostCardSkeleton } from '@/components/shared/SkeletonLoader';
import { Modal } from '@/components/shared/Modal';

interface UserProfile {
  id: string;
  username: string;
  displayName?: string;
  bio?: string;
  location?: string;
  website?: string;
  avatarUrl?: string;
  coverUrl?: string;
  postCount: number;
  friendCount: number;
  followerCount: number;
  followingCount: number;
  isFriend: boolean;
  isFollowing: boolean;
  friendRequestSent: boolean;
  friendRequestReceived: boolean;
}

type ViewMode = 'grid' | 'list';

function ProfilePage() {
  const { userId } = useParams<{ userId?: string }>();
  const { user: currentUser } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [connectionsModal, setConnectionsModal] = useState<{ type: 'friends' | 'followers' | 'following'; title: string } | null>(null);
  const [connections, setConnections] = useState<{ id: string; username: string; displayName?: string; avatarUrl?: string }[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);

  const isOwnProfile = !userId || userId === currentUser?.id;
  const profileId = userId || currentUser?.id;

  useEffect(() => {
    async function fetchProfile() {
      if (!profileId) return;
      setIsLoading(true);
      try {
        const [profileRes, postsRes] = await Promise.all([
          api.get(`/users/${profileId}`),
          api.get(`/posts`, { params: { userId: profileId, limit: 20 } }),
        ]);
        setProfile(profileRes.data);
        setPosts(postsRes.data.data ?? []);
      } catch {
        addToast('Failed to load profile', 'error');
      } finally {
        setIsLoading(false);
      }
    }
    fetchProfile();
  }, [profileId, addToast]);

  const handleFollow = useCallback(async () => {
    if (!profile) return;
    try {
      await api.post(`/users/${profile.id}/follow`);
      setProfile((p) => p ? { ...p, isFollowing: true, followerCount: p.followerCount + 1 } : p);
      addToast(`Following ${profile.displayName || profile.username}`, 'success');
    } catch {
      addToast('Failed to follow user', 'error');
    }
  }, [profile, addToast]);

  const handleUnfollow = useCallback(async () => {
    if (!profile) return;
    try {
      await api.delete(`/users/${profile.id}/follow`);
      setProfile((p) => p ? { ...p, isFollowing: false, followerCount: p.followerCount - 1 } : p);
    } catch {
      addToast('Failed to unfollow user', 'error');
    }
  }, [profile, addToast]);

  const handleSendFriendRequest = useCallback(async () => {
    if (!profile) return;
    try {
      await api.post(`/users/${profile.id}/friend-request`);
      // Sending a friend request auto-follows the user
      setProfile((p) => p ? { ...p, friendRequestSent: true, isFollowing: true, followerCount: p.followerCount + 1 } : p);
      addToast('Friend request sent', 'success');
    } catch {
      addToast('Failed to send friend request', 'error');
    }
  }, [profile, addToast]);

  const handleMessage = useCallback(async () => {
    if (!profile) return;
    try {
      const { data } = await api.post('/chats', { participantId: profile.id });
      navigate(`/messages?chat=${data.id}`);
    } catch {
      addToast('Failed to start conversation', 'error');
    }
  }, [profile, navigate, addToast]);

  const openConnections = useCallback(async (type: 'friends' | 'followers' | 'following') => {
    if (!profile) return;
    const titles = { friends: 'Friends', followers: 'Followers', following: 'Following' };
    setConnectionsModal({ type, title: titles[type] });
    setConnections([]);
    setIsLoadingConnections(true);
    try {
      const { data } = await api.get(`/users/${profile.id}/connections`, { params: { type, limit: 50 } });
      const items = (data.data ?? []).map((u: any) => ({
        id: String(u.id),
        username: u.username,
        displayName: u.display_name || u.displayName || null,
        avatarUrl: u.avatar_url || u.avatarUrl || null,
      }));
      setConnections(items);
    } catch {
      addToast('Failed to load connections', 'error');
    } finally {
      setIsLoadingConnections(false);
    }
  }, [profile, addToast]);

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Profile not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Cover photo (1500x500 aspect ratio) */}
      <div className="relative h-48 md:h-64 rounded-xl overflow-hidden bg-gradient-to-br from-blue-400 to-purple-500">
        {profile.coverUrl && (
          <img
            src={profile.coverUrl}
            alt="Cover photo"
            className="w-full h-full object-cover"
            style={{ aspectRatio: '1500 / 500' }}
          />
        )}
      </div>

      {/* Profile header */}
      <div className="relative px-4 pb-4">
        {/* Avatar (400x400) */}
        <div className="absolute -top-12 left-4">
          <div className="w-24 h-24 rounded-full border-4 border-white dark:border-gray-900 bg-gray-200 dark:bg-gray-700 overflow-hidden">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={`${profile.displayName || profile.username}'s avatar`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-gray-500">
                {(profile.displayName || profile.username)[0]?.toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end pt-3 gap-2">
          {isOwnProfile ? (
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Edit Profile
            </button>
          ) : (
            <>
              {profile.isFriend ? (
                <span className="px-4 py-2 text-sm font-medium rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  Friends
                </span>
              ) : profile.friendRequestReceived ? (
                <button
                  onClick={async () => {
                    try {
                      // Find the pending request ID and accept it
                      const { data: notifications } = await api.get('/notifications');
                      const friendReqNotif = (notifications.data ?? []).find(
                        (n: any) => n.eventType === 'friend_request' && String(n.sourceUserId) === profile.id
                      );
                      if (friendReqNotif) {
                        await api.post(`/users/friend-requests/${friendReqNotif.referenceId}/accept`);
                      }
                      setProfile((p) => p ? { ...p, isFriend: true, friendRequestReceived: false } : p);
                      addToast('Friend request accepted!', 'success');
                    } catch {
                      addToast('Failed to accept request', 'error');
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors"
                >
                  Accept Request
                </button>
              ) : profile.friendRequestSent ? (
                <span className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                  Pending
                </span>
              ) : (
                <button
                  onClick={handleSendFriendRequest}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                >
                  Send Request
                </button>
              )}
              <button
                onClick={profile.isFollowing ? handleUnfollow : handleFollow}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  profile.isFollowing
                    ? 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-red-300 hover:text-red-600'
                    : profile.isFriend && !profile.isFollowing
                      ? 'bg-purple-500 text-white hover:bg-purple-600'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {profile.isFollowing ? 'Unfollow' : profile.isFriend ? 'Follow Back' : 'Follow'}
              </button>
              <button
                onClick={handleMessage}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-1.5"
                aria-label="Send message"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M3.43 2.524A41.29 41.29 0 0110 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.202 41.202 0 01-5.183.501l-2.9 2.9A.75.75 0 017 16.06v-2.56a41.197 41.197 0 01-3.57-.524C1.993 12.744 1 11.487 1 10.074V5.426c0-1.413.993-2.67 2.43-2.902z" clipRule="evenodd" />
                </svg>
                Message
              </button>
            </>
          )}
        </div>

        {/* Info */}
        <div className="mt-8">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {profile.displayName || profile.username}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">@{profile.username}</p>
          {profile.bio && (
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{profile.bio}</p>
          )}
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
            {profile.location && (
              <span className="flex items-center gap-1">
                <LocationIcon />
                {profile.location}
              </span>
            )}
            {profile.website && (
              <a
                href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-500 hover:underline"
              >
                <LinkIcon />
                {profile.website}
              </a>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-6 mt-4 text-sm">
          <div>
            <span className="font-bold text-gray-900 dark:text-gray-100">{profile.postCount}</span>{' '}
            <span className="text-gray-500 dark:text-gray-400">posts</span>
          </div>
          <button onClick={() => openConnections('friends')} className="hover:underline">
            <span className="font-bold text-gray-900 dark:text-gray-100">{profile.friendCount}</span>{' '}
            <span className="text-gray-500 dark:text-gray-400">friends</span>
          </button>
          <button onClick={() => openConnections('followers')} className="hover:underline">
            <span className="font-bold text-gray-900 dark:text-gray-100">{profile.followerCount}</span>{' '}
            <span className="text-gray-500 dark:text-gray-400">followers</span>
          </button>
          <button onClick={() => openConnections('following')} className="hover:underline">
            <span className="font-bold text-gray-900 dark:text-gray-100">{profile.followingCount}</span>{' '}
            <span className="text-gray-500 dark:text-gray-400">following</span>
          </button>
        </div>
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setViewMode('grid')}
          className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-gray-200 dark:bg-gray-700' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          aria-label="Grid view"
        >
          <GridIcon />
        </button>
        <button
          onClick={() => setViewMode('list')}
          className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-gray-200 dark:bg-gray-700' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          aria-label="List view"
        >
          <ListIcon />
        </button>
      </div>

      {/* Posts */}
      <div className="px-4 pb-8">
        {posts.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">No posts yet</p>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-3 gap-1">
            {posts.map((post) => (
              <div key={post.id} className="aspect-square bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                {post.media?.[0] ? (
                  <img src={post.media[0].url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-2">
                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-4">{post.content}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>

      {/* Edit Profile Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Profile">
        <ProfileEditForm
          profile={profile}
          onSave={(updated) => {
            setProfile(updated);
            setIsEditModalOpen(false);
          }}
        />
      </Modal>

      {/* Connections Modal (Friends / Followers / Following) */}
      <Modal isOpen={!!connectionsModal} onClose={() => setConnectionsModal(null)} title={connectionsModal?.title || ''}>
        <div className="max-h-96 overflow-y-auto">
          {isLoadingConnections ? (
            <div className="space-y-3 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                    <div className="h-2.5 w-16 bg-gray-100 dark:bg-gray-800 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : connections.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">
              No {connectionsModal?.title.toLowerCase()} yet
            </p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {connections.map((conn) => (
                <button
                  key={conn.id}
                  onClick={() => { setConnectionsModal(null); navigate(`/profile/${conn.id}`); }}
                  className="flex items-center gap-3 w-full p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden shrink-0">
                    {conn.avatarUrl ? (
                      <img src={conn.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-500">
                        {(conn.displayName || conn.username)[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {conn.displayName || conn.username}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">@{conn.username}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

export default ProfilePage;


// --- Profile Edit Form with validation and photo upload ---

interface ProfileFormErrors {
  displayName?: string;
  bio?: string;
  location?: string;
  website?: string;
  avatar?: string;
  cover?: string;
}

function validateProfileForm(form: {
  displayName: string;
  bio: string;
  location: string;
  website: string;
}): ProfileFormErrors {
  const errors: ProfileFormErrors = {};

  if (form.displayName.length > 50) {
    errors.displayName = 'Display name must be at most 50 characters';
  }

  if (form.bio.length > 500) {
    errors.bio = 'Bio must be at most 500 characters';
  }

  if (form.location.length > 100) {
    errors.location = 'Location must be at most 100 characters';
  }

  if (form.website.length > 200) {
    errors.website = 'Website must be at most 200 characters';
  }

  return errors;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function ProfileEditForm({ profile, onSave }: { profile: UserProfile; onSave: (p: UserProfile) => void }) {
  const { addToast } = useToast();
  const { updateUser } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    displayName: profile.displayName || '',
    bio: profile.bio || '',
    location: profile.location || '',
    website: profile.website || '',
  });
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleFieldChange = (field: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    // Clear error for this field on change
    if (errors[field]) {
      setErrors((e) => ({ ...e, [field]: undefined }));
    }
  };

  const validateImageFile = (file: File): string | null => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return 'Accepted formats: JPEG, PNG, WebP, GIF';
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return 'Image must be under 10MB';
    }
    return null;
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const error = validateImageFile(file);
    if (error) {
      setErrors((prev) => ({ ...prev, avatar: error }));
      return;
    }

    setErrors((prev) => ({ ...prev, avatar: undefined }));
    setAvatarFile(file);
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const error = validateImageFile(file);
    if (error) {
      setErrors((prev) => ({ ...prev, cover: error }));
      return;
    }

    setErrors((prev) => ({ ...prev, cover: undefined }));
    setCoverFile(file);
    const url = URL.createObjectURL(file);
    setCoverPreview(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validateProfileForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSaving(true);
    try {
      let newAvatarUrl = profile.avatarUrl;
      let newCoverUrl = profile.coverUrl;

      // Upload avatar if changed (resized to 400x400 server-side)
      if (avatarFile) {
        const avatarData = new FormData();
        avatarData.append('avatar', avatarFile);
        const avatarRes = await api.post(`/users/${profile.id}/avatar`, avatarData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        newAvatarUrl = avatarRes.data.url;
      }

      // Upload cover if changed (resized to 1500x500 server-side)
      if (coverFile) {
        const coverData = new FormData();
        coverData.append('cover', coverFile);
        const coverRes = await api.post(`/users/${profile.id}/cover`, coverData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        newCoverUrl = coverRes.data.url;
      }

      // Update text fields
      const { data } = await api.put(`/users/${profile.id}`, form);

      // Update AuthContext so Navbar avatar refreshes immediately
      updateUser({
        displayName: data.displayName || undefined,
        avatarUrl: newAvatarUrl || undefined,
      });

      onSave({ ...data, avatarUrl: newAvatarUrl, coverUrl: newCoverUrl });
      addToast('Profile updated', 'success');
    } catch {
      addToast('Failed to update profile', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Avatar upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Profile Photo <span className="text-gray-400 font-normal">(400×400)</span>
        </label>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 shrink-0">
            {avatarPreview || profile.avatarUrl ? (
              <img
                src={avatarPreview || profile.avatarUrl}
                alt="Avatar preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-lg font-bold text-gray-500">
                {(profile.displayName || profile.username)[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Change Photo
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleAvatarChange}
            className="hidden"
            aria-label="Upload profile photo"
          />
        </div>
        {errors.avatar && (
          <p className="text-xs text-red-500 mt-1">{errors.avatar}</p>
        )}
      </div>

      {/* Cover photo upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Cover Photo <span className="text-gray-400 font-normal">(1500×500)</span>
        </label>
        <div
          className="relative h-24 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => coverInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') coverInputRef.current?.click(); }}
          aria-label="Upload cover photo"
        >
          {coverPreview || profile.coverUrl ? (
            <img
              src={coverPreview || profile.coverUrl}
              alt="Cover preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <CameraIcon />
              <span className="ml-2 text-sm">Click to upload cover photo</span>
            </div>
          )}
        </div>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleCoverChange}
          className="hidden"
          aria-label="Upload cover photo"
        />
        {errors.cover && (
          <p className="text-xs text-red-500 mt-1">{errors.cover}</p>
        )}
      </div>

      {/* Display Name */}
      <div>
        <label htmlFor="edit-displayName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Display Name
        </label>
        <input
          id="edit-displayName"
          type="text"
          value={form.displayName}
          onChange={(e) => handleFieldChange('displayName', e.target.value)}
          maxLength={50}
          className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none ${
            errors.displayName ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
          }`}
        />
        <div className="flex justify-between mt-1">
          {errors.displayName ? (
            <p className="text-xs text-red-500">{errors.displayName}</p>
          ) : (
            <span />
          )}
          <p className="text-xs text-gray-400">{form.displayName.length}/50</p>
        </div>
      </div>

      {/* Bio */}
      <div>
        <label htmlFor="edit-bio" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Bio
        </label>
        <textarea
          id="edit-bio"
          value={form.bio}
          onChange={(e) => handleFieldChange('bio', e.target.value)}
          maxLength={500}
          rows={3}
          className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none ${
            errors.bio ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
          }`}
        />
        <div className="flex justify-between mt-1">
          {errors.bio ? (
            <p className="text-xs text-red-500">{errors.bio}</p>
          ) : (
            <span />
          )}
          <p className="text-xs text-gray-400">{form.bio.length}/500</p>
        </div>
      </div>

      {/* Location */}
      <div>
        <label htmlFor="edit-location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Location
        </label>
        <input
          id="edit-location"
          type="text"
          value={form.location}
          onChange={(e) => handleFieldChange('location', e.target.value)}
          maxLength={100}
          className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none ${
            errors.location ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
          }`}
        />
        <div className="flex justify-between mt-1">
          {errors.location ? (
            <p className="text-xs text-red-500">{errors.location}</p>
          ) : (
            <span />
          )}
          <p className="text-xs text-gray-400">{form.location.length}/100</p>
        </div>
      </div>

      {/* Website */}
      <div>
        <label htmlFor="edit-website" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Website
        </label>
        <input
          id="edit-website"
          type="text"
          value={form.website}
          onChange={(e) => handleFieldChange('website', e.target.value)}
          maxLength={200}
          placeholder="https://example.com"
          className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none ${
            errors.website ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
          }`}
        />
        <div className="flex justify-between mt-1">
          {errors.website ? (
            <p className="text-xs text-red-500">{errors.website}</p>
          ) : (
            <span />
          )}
          <p className="text-xs text-gray-400">{form.website.length}/200</p>
        </div>
      </div>

      <button
        type="submit"
        disabled={isSaving}
        className="w-full py-2.5 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
      >
        {isSaving ? 'Saving...' : 'Save Changes'}
      </button>
    </form>
  );
}

// --- Profile Skeleton ---

function ProfileSkeleton() {
  return (
    <div className="max-w-3xl mx-auto animate-pulse" aria-label="Loading profile" role="status">
      <div className="h-48 md:h-64 rounded-xl bg-gray-200 dark:bg-gray-700" />
      <div className="px-4 mt-4 space-y-3">
        <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-gray-700 -mt-16 border-4 border-white dark:border-gray-900" />
        <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-4 w-64 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="flex gap-6 mt-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
      <div className="px-4 mt-8 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// --- Icons ---

function GridIcon() {
  return (
    <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.5 8.688" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
    </svg>
  );
}
