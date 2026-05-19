import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { PostCard, type Post } from '@/components/feed/PostCard';
import { UserCard } from '@/components/shared/UserCard';
import { PostCardSkeleton, UserCardSkeleton } from '@/components/shared/SkeletonLoader';
import { useToast } from '@/components/shared/Toast';
import { Modal } from '@/components/shared/Modal';

type ContentFilter = 'all' | 'users' | 'posts' | 'hashtags' | 'reels';

interface TrendingHashtag {
  id: string;
  name: string;
  postCount: number;
}

interface SuggestedUser {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  isFollowing?: boolean;
}

interface TypeaheadSuggestion {
  type: 'user' | 'hashtag' | 'post';
  text: string;
  id: string;
  avatarUrl?: string;
}

interface SearchResultItem {
  type: 'user' | 'post' | 'hashtag' | 'reel';
  user?: SuggestedUser;
  post?: Post;
  hashtag?: TrendingHashtag;
}

function ExplorePage() {
  const { addToast } = useToast();
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ContentFilter>('all');
  const [trendingPosts, setTrendingPosts] = useState<Post[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<TrendingHashtag[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [suggestions, setSuggestions] = useState<TypeaheadSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchCursor, setSearchCursor] = useState<string | null>(null);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Load explore page content
  useEffect(() => {
    async function loadExplore() {
      setIsLoading(true);
      try {
        const { data } = await api.get('/explore');
        setTrendingPosts(data.trendingPosts ?? []);
        setTrendingHashtags(data.trendingHashtags ?? []);
        setSuggestedUsers(data.suggestedUsers ?? []);
      } catch {
        addToast('Failed to load explore content', 'error');
      } finally {
        setIsLoading(false);
      }
    }
    loadExplore();
  }, [addToast]);

  // Typeahead suggestions with 200ms debounce
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const { data } = await api.get('/search/typeahead', { params: { q } });
      const results = (data ?? []).slice(0, 8);
      setSuggestions(results);
      setShowSuggestions(true);
    } catch {
      // Silently fail for typeahead
    }
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 200);
  };

  // Full search with pagination (20 results per page)
  const handleSearch = useCallback(async (searchQuery?: string, append = false) => {
    const q = searchQuery || query;
    if (!q.trim()) return;

    if (!append) {
      setIsSearching(true);
      setSearchResults([]);
      setSearchCursor(null);
      setHasMoreResults(false);
    } else {
      setIsLoadingMore(true);
    }

    setShowSuggestions(false);
    setHasSearched(true);

    try {
      const params: Record<string, string> = { q, limit: '20' };
      if (activeFilter !== 'all') params.type = activeFilter;
      if (append && searchCursor) params.cursor = searchCursor;

      const { data } = await api.get('/search', { params });
      const results: SearchResultItem[] = data.data ?? [];
      const cursor: string | null = data.cursor ?? null;
      const hasMore: boolean = data.hasMore ?? false;

      if (append) {
        setSearchResults((prev) => [...prev, ...results]);
      } else {
        setSearchResults(results);
      }
      setSearchCursor(cursor);
      setHasMoreResults(hasMore);
    } catch {
      addToast('Search failed', 'error');
    } finally {
      setIsSearching(false);
      setIsLoadingMore(false);
    }
  }, [query, activeFilter, searchCursor, addToast]);

  // Load more search results
  const loadMoreResults = useCallback(() => {
    if (isLoadingMore || !hasMoreResults || !searchCursor) return;
    handleSearch(query, true);
  }, [isLoadingMore, hasMoreResults, searchCursor, query, handleSearch]);

  // Intersection observer for paginated search results
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    if (!hasMoreResults || !hasSearched) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreResults();
        }
      },
      { threshold: 0.1 }
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [loadMoreResults, hasMoreResults, hasSearched]);

  const handleSuggestionClick = (suggestion: TypeaheadSuggestion) => {
    setQuery(suggestion.text);
    setShowSuggestions(false);
    handleSearch(suggestion.text);
  };

  const handleFilterChange = (filter: ContentFilter) => {
    setActiveFilter(filter);
    if (query.trim()) {
      // Re-search with new filter (reset pagination)
      setSearchResults([]);
      setSearchCursor(null);
      setHasMoreResults(false);
      searchWithFilter(query, filter);
    }
  };

  // Search with explicit filter (avoids stale closure issue)
  const searchWithFilter = useCallback(async (q: string, filter: ContentFilter) => {
    setIsSearching(true);
    setShowSuggestions(false);
    setHasSearched(true);

    try {
      const params: Record<string, string> = { q, limit: '20' };
      if (filter !== 'all') params.type = filter;

      const { data } = await api.get('/search', { params });
      const results: SearchResultItem[] = data.data ?? [];
      const cursor: string | null = data.cursor ?? null;
      const hasMore: boolean = data.hasMore ?? false;

      setSearchResults(results);
      setSearchCursor(cursor);
      setHasMoreResults(hasMore);
    } catch {
      addToast('Search failed', 'error');
    } finally {
      setIsSearching(false);
    }
  }, [addToast]);

  const handleFollow = useCallback(async (userId: string) => {
    try {
      await api.post(`/users/${userId}/follow`);
      setSuggestedUsers((users) =>
        users.map((u) => (u.id === userId ? { ...u, isFollowing: true } : u))
      );
    } catch {
      addToast('Failed to follow user', 'error');
    }
  }, [addToast]);

  const handleUnfollow = useCallback(async (userId: string) => {
    try {
      await api.delete(`/users/${userId}/follow`);
      setSuggestedUsers((users) =>
        users.map((u) => (u.id === userId ? { ...u, isFollowing: false } : u))
      );
    } catch {
      addToast('Failed to unfollow user', 'error');
    }
  }, [addToast]);

  const isShowingSearchResults = hasSearched && query.trim().length > 0;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Search bar */}
      <div className="relative mb-6">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Search users, posts, hashtags..."
            aria-label="Search"
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* Typeahead suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg z-20 overflow-hidden"
            role="listbox"
            aria-label="Search suggestions"
          >
            {suggestions.map((s) => (
              <button
                key={`${s.type}-${s.id}`}
                onClick={() => handleSuggestionClick(s)}
                role="option"
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-left transition-colors"
              >
                {s.type === 'user' && s.avatarUrl ? (
                  <img src={s.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs text-gray-500">
                    {s.type === 'hashtag' ? '#' : s.type === 'user' ? '👤' : '📝'}
                  </span>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.text}</p>
                  <p className="text-xs text-gray-500 capitalize">{s.type}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content type filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide" role="tablist" aria-label="Content type filters">
        {(['all', 'users', 'posts', 'hashtags', 'reels'] as ContentFilter[]).map((filter) => (
          <button
            key={filter}
            role="tab"
            aria-selected={activeFilter === filter}
            onClick={() => handleFilterChange(filter)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeFilter === filter
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {filter.charAt(0).toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      {/* Search results or explore content */}
      {isSearching ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      ) : isShowingSearchResults ? (
        <SearchResults
          results={searchResults}
          activeFilter={activeFilter}
          hasMore={hasMoreResults}
          isLoadingMore={isLoadingMore}
          sentinelRef={sentinelRef}
          onFollow={handleFollow}
          onUnfollow={handleUnfollow}
          query={query}
          trendingHashtags={trendingHashtags}
        />
      ) : isLoading ? (
        <ExploreSkeleton />
      ) : (
        <div className="space-y-8">
          {/* Trending hashtags */}
          {trendingHashtags.length > 0 && (
            <section aria-labelledby="trending-heading">
              <h2 id="trending-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Trending</h2>
              <div className="flex flex-wrap gap-2">
                {trendingHashtags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => { setQuery(`#${tag.name}`); handleSearch(`#${tag.name}`); }}
                    className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400 transition-colors"
                  >
                    #{tag.name} <span className="text-xs text-gray-400 ml-1">{tag.postCount}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Suggested users */}
          {suggestedUsers.length > 0 && (
            <section aria-labelledby="suggested-heading">
              <h2 id="suggested-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Suggested for You</h2>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {suggestedUsers.map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    onFollow={handleFollow}
                    onUnfollow={handleUnfollow}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Trending posts grid */}
          {trendingPosts.length > 0 && (
            <section aria-labelledby="trending-posts-heading">
              <h2 id="trending-posts-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Trending Posts</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1 rounded-xl overflow-hidden">
                {trendingPosts.map((post) => (
                  <div key={post.id} onClick={() => setSelectedPost(post)} className="aspect-square bg-gray-100 dark:bg-gray-800 overflow-hidden relative group cursor-pointer">
                    {post.media?.[0] ? (
                      post.media[0].type === 'video' ? (
                        <div className="w-full h-full relative bg-black">
                          <video src={post.media[0].url} className="w-full h-full object-cover" preload="metadata" muted />
                          <div className="absolute top-2 right-2">
                            <svg className="w-5 h-5 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      ) : (
                        <img src={post.media[0].url} alt="" className="w-full h-full object-cover" />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-3">
                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-4">{post.content}</p>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="flex gap-4 text-white text-sm font-medium">
                        <span>❤️ {post.likeCount}</span>
                        <span>💬 {post.commentCount}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Post detail modal */}
      <Modal isOpen={!!selectedPost} onClose={() => setSelectedPost(null)} title="">
        {selectedPost && (
          <div className="-mx-4 -mt-2">
            <PostCard post={selectedPost} onUpdate={(updated) => setSelectedPost(updated)} />
          </div>
        )}
      </Modal>
    </div>
  );
}

// --- Search Results Component ---

interface SearchResultsProps {
  results: SearchResultItem[];
  activeFilter: ContentFilter;
  hasMore: boolean;
  isLoadingMore: boolean;
  sentinelRef: React.RefObject<HTMLDivElement>;
  onFollow: (userId: string) => void;
  onUnfollow: (userId: string) => void;
  query: string;
  trendingHashtags: TrendingHashtag[];
}

function SearchResults({
  results,
  activeFilter,
  hasMore,
  isLoadingMore,
  sentinelRef,
  onFollow,
  onUnfollow,
  query,
  trendingHashtags,
}: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <SearchIcon className="w-8 h-8 text-gray-400" />
        </div>
        <p className="text-gray-600 dark:text-gray-400 text-lg font-medium">No results found</p>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
          No results for "{query}". Try a different search term.
        </p>
        {trendingHashtags.length > 0 && (
          <div className="mt-6">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Try trending topics:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {trendingHashtags.slice(0, 5).map((tag) => (
                <span
                  key={tag.id}
                  className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-300"
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Search Results
        {activeFilter !== 'all' && (
          <span className="text-sm font-normal text-gray-500 ml-2">
            — {activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)}
          </span>
        )}
      </h2>

      <div className="space-y-3">
        {results.map((item, index) => (
          <SearchResultCard
            key={`${item.type}-${item.user?.id || item.post?.id || item.hashtag?.id || index}`}
            item={item}
            onFollow={onFollow}
            onUnfollow={onUnfollow}
          />
        ))}
      </div>

      {/* Pagination sentinel */}
      <div ref={sentinelRef} className="h-4" />

      {isLoadingMore && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!hasMore && results.length > 0 && (
        <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">
          No more results
        </p>
      )}
    </div>
  );
}

// --- Individual Search Result Card ---

interface SearchResultCardProps {
  item: SearchResultItem;
  onFollow: (userId: string) => void;
  onUnfollow: (userId: string) => void;
}

function SearchResultCard({ item, onFollow, onUnfollow }: SearchResultCardProps) {
  if (item.type === 'user' && item.user) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <UserCard user={item.user} onFollow={onFollow} onUnfollow={onUnfollow} />
      </div>
    );
  }

  if ((item.type === 'post' || item.type === 'reel') && item.post) {
    return <PostCard post={item.post} />;
  }

  if (item.type === 'hashtag' && item.hashtag) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
          <span className="text-blue-500 font-bold text-lg">#</span>
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">#{item.hashtag.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {item.hashtag.postCount.toLocaleString()} {item.hashtag.postCount === 1 ? 'post' : 'posts'}
          </p>
        </div>
      </div>
    );
  }

  return null;
}

// --- Skeleton ---

function ExploreSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-3">
        <div className="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-full" />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <UserCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="aspect-square bg-gray-200 dark:bg-gray-700 rounded" />
        ))}
      </div>
    </div>
  );
}

// --- Icons ---

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

export default ExplorePage;
