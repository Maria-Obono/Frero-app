import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { SkeletonLoader } from '@/components/shared/SkeletonLoader';

interface StoryUser {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  hasUnviewed: boolean;
}

export function StoryBar() {
  const [stories, setStories] = useState<StoryUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStories() {
      try {
        const { data } = await api.get('/stories/active');
        setStories(data.data ?? []);
      } catch {
        // Silently fail - stories are non-critical
      } finally {
        setIsLoading(false);
      }
    }
    fetchStories();
  }, []);

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto py-4 px-2 scrollbar-hide">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <SkeletonLoader width="64px" height="64px" rounded="full" />
            <SkeletonLoader width="48px" height="10px" />
          </div>
        ))}
      </div>
    );
  }

  if (stories.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto py-4 px-2 scrollbar-hide">
      {stories.map((user) => (
        <button
          key={user.id}
          className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
          aria-label={`View ${user.displayName || user.username}'s story`}
        >
          <div
            className={`w-16 h-16 rounded-full p-0.5 ${
              user.hasUnviewed
                ? 'bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500'
                : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <div className="w-full h-full rounded-full bg-white dark:bg-gray-800 p-0.5">
              <div className="w-full h-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs font-bold">
                    {(user.displayName || user.username || '?')[0]?.toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          </div>
          <span className="text-xs text-gray-600 dark:text-gray-400 truncate w-16 text-center group-hover:text-gray-900 dark:group-hover:text-gray-200 transition-colors">
            {user.username}
          </span>
        </button>
      ))}
    </div>
  );
}

export default StoryBar;
