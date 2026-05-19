import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { PostCard, type Post } from '@/components/feed/PostCard';
import { CreatePostForm } from '@/components/feed/CreatePostForm';
import { StoryBar } from '@/components/feed/StoryBar';
import { PostCardSkeleton } from '@/components/shared/SkeletonLoader';
import { useNewPosts } from '@/hooks/useNewPosts';
import { useEngagementUpdates } from '@/hooks/useEngagementUpdates';

/** Maximum number of posts loaded per session (Requirement 9.4) */
const MAX_POSTS_PER_SESSION = 500;

function HomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [sessionPostCount, setSessionPostCount] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { hasNew, count: newPostCount, dismiss: dismissNewPosts } = useNewPosts();
  const { getCounts } = useEngagementUpdates();

  const fetchPosts = useCallback(async (nextCursor?: string | null) => {
    try {
      const params: Record<string, string> = {};
      if (nextCursor) params.cursor = nextCursor;

      const { data } = await api.get('/feed', { params });
      return data as { data: Post[]; cursor: string | null; hasMore: boolean };
    } catch {
      return null;
    }
  }, []);

  // Initial load
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const result = await fetchPosts();
      if (result) {
        setPosts(result.data);
        setCursor(result.cursor);
        setHasMore(result.hasMore);
        setSessionPostCount(result.data.length);
      }
      setIsLoading(false);
    }
    load();
  }, [fetchPosts]);

  // Load more (infinite scroll) — stops at MAX_POSTS_PER_SESSION
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || !cursor) return;
    if (sessionPostCount >= MAX_POSTS_PER_SESSION) {
      setHasMore(false);
      return;
    }
    setIsLoadingMore(true);
    const result = await fetchPosts(cursor);
    if (result) {
      setPosts((prev) => [...prev, ...result.data]);
      setCursor(result.cursor);
      const newTotal = sessionPostCount + result.data.length;
      setSessionPostCount(newTotal);
      setHasMore(result.hasMore && newTotal < MAX_POSTS_PER_SESSION);
    }
    setIsLoadingMore(false);
  }, [cursor, hasMore, isLoadingMore, fetchPosts, sessionPostCount]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [loadMore]);

  const handleRefresh = useCallback(async () => {
    dismissNewPosts();
    setIsLoading(true);
    const result = await fetchPosts();
    if (result) {
      setPosts(result.data);
      setCursor(result.cursor);
      setHasMore(result.hasMore);
      setSessionPostCount(result.data.length);
    }
    setIsLoading(false);
  }, [fetchPosts, dismissNewPosts]);

  /** Apply real-time engagement count updates to a post (Requirement 15.2) */
  const getPostWithLiveEngagement = useCallback(
    (post: Post): Post => {
      const liveCounts = getCounts(post.id);
      if (!liveCounts) return post;
      return {
        ...post,
        likeCount: liveCounts.likes,
        commentCount: liveCounts.comments,
        shareCount: liveCounts.shares,
      };
    },
    [getCounts]
  );

  return (
    <div className="max-w-2xl mx-auto">
      {/* Story bar */}
      <div className="mb-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <StoryBar />
      </div>

      {/* Create post */}
      <div className="mb-4">
        <CreatePostForm onPostCreated={handleRefresh} />
      </div>

      {/* New posts indicator */}
      {hasNew && (
        <button
          onClick={handleRefresh}
          className="w-full mb-4 py-2.5 px-4 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors shadow-sm"
        >
          {newPostCount} new {newPostCount === 1 ? 'post' : 'posts'} available — tap to refresh
        </button>
      )}

      {/* Feed */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <PostCardSkeleton />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 text-lg">No posts yet</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            Follow people to see their posts in your feed
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={getPostWithLiveEngagement(post)} />
          ))}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-4" />

          {isLoadingMore && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <PostCardSkeleton />
            </div>
          )}

          {!hasMore && posts.length > 0 && (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">
              You're all caught up
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default HomePage;
