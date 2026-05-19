/**
 * Hook for real-time new post notifications in the feed.
 * Listens to Socket.IO 'feed:new-post' event and tracks new post count.
 * Requirements: 15.1 (new post notification within 2s), 14.5 (update indicator without disrupting scroll)
 */
import { useState, useCallback, useEffect } from 'react';

import { useSocketContext } from '@/contexts/SocketContext';

interface NewPostEvent {
  postId: string;
  authorId: string;
}

interface NewPostIndicator {
  count: number;
  hasNew: boolean;
  newPostIds: string[];
  dismiss: () => void;
}

export function useNewPosts(): NewPostIndicator {
  const { on, off } = useSocketContext();
  const [newPostIds, setNewPostIds] = useState<string[]>([]);

  useEffect(() => {
    const handler = (data: unknown) => {
      const event = data as NewPostEvent;
      setNewPostIds((prev) => [...prev, event.postId]);
    };

    on('feed:new-post', handler);
    return () => {
      off('feed:new-post', handler);
    };
  }, [on, off]);

  const dismiss = useCallback(() => {
    setNewPostIds([]);
  }, []);

  return {
    count: newPostIds.length,
    hasNew: newPostIds.length > 0,
    newPostIds,
    dismiss,
  };
}
