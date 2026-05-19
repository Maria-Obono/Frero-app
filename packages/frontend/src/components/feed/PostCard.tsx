import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/shared/Toast';
import { EmojiPicker } from '@/components/shared/EmojiPicker';

interface PostMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  orderIndex: number;
}

interface PostAuthor {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface Post {
  id: string;
  author: PostAuthor;
  type: 'text' | 'photo' | 'video' | 'carousel';
  content?: string;
  media?: PostMedia[];
  likeCount: number;
  commentCount: number;
  shareCount: number;
  isLiked: boolean;
  isBookmarked: boolean;
  createdAt: string;
}

interface PostCardProps {
  post: Post;
  onUpdate?: (post: Post) => void;
}

interface CommentData {
  id: string;
  postId: string;
  author: {
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
  content: string;
  parentCommentId: string | null;
  depth: number;
  createdAt: string;
}

export function PostCard({ post, onUpdate }: PostCardProps) {
  const { addToast } = useToast();
  const { user } = useAuth();
  const [isLiked, setIsLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [isBookmarked, setIsBookmarked] = useState(post.isBookmarked);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content || '');
  const [currentContent, setCurrentContent] = useState(post.content);
  const [isDeleted, setIsDeleted] = useState(false);

  const isOwner = user?.id === post.author.id;
  const postAge = Date.now() - new Date(post.createdAt).getTime();
  const canEdit = isOwner && postAge < 60 * 60 * 1000; // 1 hour

  const isReel = post.type === 'reel';
  const apiPath = `/posts/${post.id}`;

  const handleLike = useCallback(async () => {
    try {
      if (isLiked) {
        await api.delete(`${apiPath}/like`);
        setIsLiked(false);
        setLikeCount((c) => c - 1);
      } else {
        await api.post(`${apiPath}/like`);
        setIsLiked(true);
        setLikeCount((c) => c + 1);
      }
      onUpdate?.({ ...post, isLiked: !isLiked, likeCount: likeCount + (isLiked ? -1 : 1) });
    } catch {
      addToast('Failed to update like', 'error');
    }
  }, [post, isLiked, likeCount, onUpdate, addToast, apiPath]);

  const handleBookmark = useCallback(async () => {
    if (isReel) return; // Bookmarks not supported for reels
    try {
      if (isBookmarked) {
        await api.delete(`${apiPath}/bookmark`);
        setIsBookmarked(false);
      } else {
        await api.post(`${apiPath}/bookmark`);
        setIsBookmarked(true);
      }
    } catch {
      addToast('Failed to update bookmark', 'error');
    }
  }, [apiPath, isBookmarked, isReel, addToast]);

  const handleShare = useCallback(async () => {
    if (isReel) return;
    try {
      await api.post(`${apiPath}/share`);
      addToast('Post shared', 'success');
    } catch {
      addToast('Failed to share post', 'error');
    }
  }, [apiPath, isReel, addToast]);

  const toggleComments = useCallback(async () => {
    if (!showComments) {
      try {
        const { data } = await api.get(`${apiPath}/comments`);
        setComments(data.data || data || []);
      } catch {
        // silently fail
      }
    }
    setShowComments((s) => !s);
  }, [apiPath, showComments]);

  const handlePostComment = useCallback(async () => {
    if (!commentText.trim()) return;
    setIsPostingComment(true);
    try {
      const { data } = await api.post(`${apiPath}/comments`, { content: commentText.trim() });
      setComments((prev) => [...prev, data]);
      setCommentText('');
      setCommentCount((c) => c + 1);
    } catch {
      addToast('Failed to post comment', 'error');
    } finally {
      setIsPostingComment(false);
    }
  }, [apiPath, commentText, addToast]);

  const handleEdit = useCallback(async () => {
    if (!editContent.trim()) return;
    try {
      const { data } = await api.put(`${apiPath}`, { content: editContent.trim() });
      setCurrentContent(data.content);
      setIsEditing(false);
      addToast('Post updated', 'success');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to edit post';
      addToast(msg, 'error');
    }
  }, [apiPath, editContent, addToast]);

  const handleDelete = useCallback(async () => {
    try {
      await api.delete(apiPath);
      setIsDeleted(true);
      addToast('Post deleted', 'success');
    } catch {
      addToast('Failed to delete post', 'error');
    }
  }, [post.id, addToast]);

  const timeAgo = getTimeAgo(post.createdAt);

  if (isDeleted) {
    return null;
  }

  return (
    <article className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Author header */}
      <div className="flex items-center gap-3 p-4">
        <Link to={`/profile/${post.author.id}`}>
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            {post.author.avatarUrl ? (
              <img src={post.author.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm font-bold">
                {(post.author.displayName || post.author.username)[0]?.toUpperCase()}
              </div>
            )}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <Link to={`/profile/${post.author.id}`} className="font-semibold text-sm text-gray-900 dark:text-gray-100 hover:underline">
            {post.author.displayName || post.author.username}
          </Link>
          <p className="text-xs text-gray-500 dark:text-gray-400">@{post.author.username} · {timeAgo}</p>
        </div>

        {/* Post menu (edit/delete) for owner */}
        {isOwner && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-400"
              aria-label="Post options"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 overflow-hidden">
                {canEdit && (
                  <button
                    onClick={() => { setIsEditing(true); setShowMenu(false); }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Edit post
                  </button>
                )}
                <button
                  onClick={() => { handleDelete(); setShowMenu(false); }}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Delete post
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content (editable or static) */}
      {isEditing ? (
        <div className="px-4 pb-3">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            maxLength={5000}
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleEdit}
              className="px-3 py-1 text-xs font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => { setIsEditing(false); setEditContent(currentContent || ''); }}
              className="px-3 py-1 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : currentContent ? (
        <div className="px-4 pb-3">
          <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{currentContent}</p>
        </div>
      ) : null}

      {/* Media */}
      {post.media && post.media.length > 0 && (
        <div className="relative">
          {post.media.length === 1 ? (
            post.media[0].type === 'video' ? (
              <video
                src={post.media[0].url}
                controls
                className="w-full max-h-96 object-cover bg-black"
                preload="metadata"
              />
            ) : (
              <img src={post.media[0].url} alt="Post media" className="w-full max-h-96 object-cover" />
            )
          ) : (
            <div className="grid grid-cols-2 gap-0.5">
              {post.media.slice(0, 4).map((m, i) => (
                <div key={m.id} className="relative aspect-square">
                  {m.type === 'video' ? (
                    <video src={m.url} className="w-full h-full object-cover bg-black" preload="metadata" />
                  ) : (
                    <img src={m.url} alt="" className="w-full h-full object-cover" />
                  )}
                  {i === 3 && post.media!.length > 4 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white text-xl font-bold">+{post.media!.length - 4}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Engagement actions */}
      <div className="flex items-center gap-1 px-4 py-3 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            isLiked
              ? 'text-red-500 bg-red-50 dark:bg-red-900/20'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          aria-label={isLiked ? 'Unlike post' : 'Like post'}
        >
          <HeartIcon filled={isLiked} />
          <span>{likeCount}</span>
        </button>

        <button
          onClick={toggleComments}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Comment on post"
        >
          <CommentIcon />
          <span>{commentCount}</span>
        </button>

        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Share post"
        >
          <ShareIcon />
          <span>{post.shareCount}</span>
        </button>

        <div className="flex-1" />

        <button
          onClick={handleBookmark}
          className={`p-1.5 rounded-lg transition-colors ${
            isBookmarked
              ? 'text-blue-500'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark post'}
        >
          <BookmarkIcon filled={isBookmarked} />
        </button>
      </div>

      {/* Comment section */}
      {showComments && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
          {/* Comment input */}
          <div className="flex gap-2 pt-3">
            <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-medium shrink-0 overflow-hidden">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span>{(user?.displayName || user?.username || 'U')[0]?.toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1 flex gap-2 items-center">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePostComment(); } }}
                placeholder="Write a comment..."
                maxLength={2000}
                className="flex-1 px-3 py-1.5 text-sm rounded-full bg-gray-100 dark:bg-gray-700 border-0 outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
              <EmojiPicker onSelect={(emoji) => setCommentText((prev) => prev + emoji)} />
              <button
                onClick={handlePostComment}
                disabled={!commentText.trim() || isPostingComment}
                className="px-3 py-1.5 text-sm font-medium text-blue-500 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Post
              </button>
            </div>
          </div>

          {/* Comments list */}
          {comments.length > 0 && (
            <div className="mt-3 space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <Link to={`/profile/${c.author.id}`} className="shrink-0">
                    <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      {c.author.avatarUrl ? (
                        <img src={c.author.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-500">
                          {(c.author.displayName || c.author.username)[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="bg-gray-100 dark:bg-gray-700 rounded-xl px-3 py-2">
                      <Link to={`/profile/${c.author.id}`} className="text-xs font-semibold text-gray-900 dark:text-gray-100 hover:underline">
                        {c.author.displayName || c.author.username}
                      </Link>
                      <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5">{c.content}</p>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 ml-3">{getTimeAgo(c.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// --- Icons ---

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="w-5 h-5" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
    </svg>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="w-5 h-5" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
    </svg>
  );
}

// --- Utility ---

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

export default PostCard;
