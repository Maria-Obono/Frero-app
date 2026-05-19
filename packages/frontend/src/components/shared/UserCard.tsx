import { Link } from 'react-router-dom';

interface UserCardProps {
  user: {
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
    bio?: string;
    isFollowing?: boolean;
  };
  onFollow?: (userId: string) => void;
  onUnfollow?: (userId: string) => void;
  showFollowButton?: boolean;
}

export function UserCard({ user, onFollow, onUnfollow, showFollowButton = true }: UserCardProps) {
  const isFollowing = user.isFollowing ?? false;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <Link to={`/profile/${user.id}`}>
        <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold">
              {(user.displayName || user.username)[0]?.toUpperCase()}
            </div>
          )}
        </div>
      </Link>
      <div className="flex-1 min-w-0">
        <Link to={`/profile/${user.id}`} className="font-semibold text-sm text-gray-900 dark:text-gray-100 hover:underline block truncate">
          {user.displayName || user.username}
        </Link>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">@{user.username}</p>
        {user.bio && (
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-1">{user.bio}</p>
        )}
      </div>
      {showFollowButton && (
        <button
          onClick={() => isFollowing ? onUnfollow?.(user.id) : onFollow?.(user.id)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            isFollowing
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </button>
      )}
    </div>
  );
}

export default UserCard;
