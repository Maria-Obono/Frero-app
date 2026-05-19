/**
 * Explore route handlers.
 *
 * Returns trending content, suggested users, and trending hashtags.
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { getDatabase } from '../database/connection';

const router = Router();

/**
 * GET /explore
 * Returns trending posts, trending hashtags, and suggested users.
 */
router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const db = getDatabase();

      // Get trending posts (most liked recent posts)
      const trendingPostsRaw = await db('posts')
        .whereNull('deleted_at')
        .where('privacy', 'public')
        .orderBy('like_count', 'desc')
        .orderBy('created_at', 'desc')
        .limit(9);

      // Get liked post IDs for the current user
      const trendingPostIds = trendingPostsRaw.map((p: any) => p.id);
      const userLikes = trendingPostIds.length > 0
        ? await db('likes')
            .where('user_id', userId)
            .where('likeable_type', 'post')
            .whereIn('likeable_id', trendingPostIds)
            .select('likeable_id')
        : [];
      const likedPostIds = new Set(userLikes.map((l: any) => l.likeable_id));

      const trendingPosts = await Promise.all(
        trendingPostsRaw.map(async (post: any) => {
          const media = await db('post_media')
            .where('post_id', post.id)
            .orderBy('order_index', 'asc');
          const author = await db('users')
            .where('id', post.user_id)
            .select('id', 'username', 'display_name', 'avatar_url')
            .first();
          return {
            id: String(post.id),
            author: {
              id: String(author?.id || post.user_id),
              username: author?.username || 'unknown',
              displayName: author?.display_name || null,
              avatarUrl: author?.avatar_url || null,
            },
            type: post.type,
            content: post.content,
            media: media.map((m: any) => ({
              id: String(m.id),
              url: m.url,
              type: m.type,
              orderIndex: m.order_index,
            })),
            likeCount: post.like_count || 0,
            commentCount: post.comment_count || 0,
            shareCount: post.share_count || 0,
            isLiked: likedPostIds.has(post.id),
            isBookmarked: false,
            createdAt: post.created_at,
          };
        }),
      );

      // Get trending hashtags
      const trendingHashtags = await db('hashtags')
        .orderBy('post_count', 'desc')
        .limit(10)
        .then((rows: any[]) =>
          rows.map((h) => ({
            id: String(h.id),
            name: h.name,
            postCount: h.post_count,
          })),
        );

      // Get suggested users (users not followed by current user)
      const followedIds = await db('follows')
        .where('follower_id', userId)
        .select('followed_id')
        .then((rows: any[]) => rows.map((r) => r.followed_id));

      const excludeIds = [userId, ...followedIds];

      const suggestedUsers = await db('users')
        .whereNull('deleted_at')
        .whereNotIn('id', excludeIds)
        .select('id', 'username', 'display_name', 'avatar_url', 'bio')
        .limit(5)
        .then((rows: any[]) =>
          rows.map((u) => ({
            id: String(u.id),
            username: u.username,
            displayName: u.display_name || null,
            avatarUrl: u.avatar_url || null,
            bio: u.bio || null,
            isFollowing: false,
          })),
        );

      res.status(200).json({
        trendingPosts,
        trendingHashtags,
        suggestedUsers,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /search
 * Search for users, posts, hashtags, and reels.
 * Note: This is defined as /search but mounted at /explore, so it handles /explore/search
 * AND separately mounted at /search to handle /search directly.
 */
router.get(
  '/search',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const q = (req.query.q as string) || '';
      const type = req.query.type as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);
      const db = getDatabase();

      const results: any[] = [];

      if (!type || type === 'users') {
        const users = await db('users')
          .whereNull('deleted_at')
          .where((qb: any) => {
            qb.where('username', 'like', `%${q}%`)
              .orWhere('display_name', 'like', `%${q}%`);
          })
          .select('id', 'username', 'display_name', 'avatar_url', 'bio')
          .limit(type === 'users' ? limit : 10);

        users.forEach((u: any) => {
          results.push({
            type: 'user',
            user: {
              id: String(u.id),
              username: u.username,
              displayName: u.display_name || null,
              avatarUrl: u.avatar_url || null,
              bio: u.bio || null,
            },
          });
        });
      }

      if (!type || type === 'posts') {
        const posts = await db('posts')
          .whereNull('deleted_at')
          .where('privacy', 'public')
          .where((qb: any) => {
            qb.where('content', 'like', `%${q}%`);
          })
          .orderBy('created_at', 'desc')
          .limit(type === 'posts' ? limit : 10);

        for (const post of posts) {
          const media = await db('post_media')
            .where('post_id', post.id)
            .orderBy('order_index', 'asc');
          const author = await db('users')
            .where('id', post.user_id)
            .select('id', 'username', 'display_name', 'avatar_url')
            .first();

          results.push({
            type: 'post',
            post: {
              id: String(post.id),
              author: {
                id: String(author?.id || post.user_id),
                username: author?.username || 'unknown',
                displayName: author?.display_name || null,
                avatarUrl: author?.avatar_url || null,
              },
              type: post.type,
              content: post.content,
              media: media.map((m: any) => ({
                id: String(m.id),
                url: m.url,
                type: m.type,
                orderIndex: m.order_index,
              })),
              likeCount: post.like_count || 0,
              commentCount: post.comment_count || 0,
              shareCount: post.share_count || 0,
              isLiked: false,
              isBookmarked: false,
              createdAt: post.created_at,
            },
          });
        }
      }

      if (!type || type === 'reels') {
        const reels = await db('posts')
          .whereNull('deleted_at')
          .where('privacy', 'public')
          .where('type', 'video')
          .where((qb: any) => {
            if (q) qb.where('content', 'like', `%${q}%`);
          })
          .orderBy('created_at', 'desc')
          .limit(type === 'reels' ? limit : 5);

        for (const reel of reels) {
          const media = await db('post_media')
            .where('post_id', reel.id)
            .orderBy('order_index', 'asc');
          const author = await db('users')
            .where('id', reel.user_id)
            .select('id', 'username', 'display_name', 'avatar_url')
            .first();

          results.push({
            type: 'reel',
            post: {
              id: String(reel.id),
              author: {
                id: String(author?.id || reel.user_id),
                username: author?.username || 'unknown',
                displayName: author?.display_name || null,
                avatarUrl: author?.avatar_url || null,
              },
              type: 'video',
              content: reel.content,
              media: media.map((m: any) => ({
                id: String(m.id),
                url: m.url,
                type: m.type,
                orderIndex: m.order_index,
              })),
              likeCount: reel.like_count || 0,
              commentCount: reel.comment_count || 0,
              shareCount: reel.share_count || 0,
              isLiked: false,
              isBookmarked: false,
              createdAt: reel.created_at,
            },
          });
        }
      }

      if (!type || type === 'hashtags') {
        const hashtags = await db('hashtags')
          .where('name', 'like', `%${q.replace('#', '')}%`)
          .orderBy('post_count', 'desc')
          .limit(type === 'hashtags' ? limit : 10);

        hashtags.forEach((h: any) => {
          results.push({
            type: 'hashtag',
            hashtag: {
              id: String(h.id),
              name: h.name,
              postCount: h.post_count,
            },
          });
        });
      }

      res.status(200).json({
        data: results,
        cursor: null,
        hasMore: false,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /search/typeahead
 * Quick typeahead suggestions.
 */
router.get(
  '/search/typeahead',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const q = (req.query.q as string) || '';
      if (q.length < 2) {
        res.status(200).json([]);
        return;
      }

      const db = getDatabase();
      const suggestions: any[] = [];

      // Search users
      const users = await db('users')
        .whereNull('deleted_at')
        .where((qb: any) => {
          qb.where('username', 'like', `%${q}%`)
            .orWhere('display_name', 'like', `%${q}%`);
        })
        .select('id', 'username', 'avatar_url')
        .limit(4);

      users.forEach((u: any) => {
        suggestions.push({
          type: 'user',
          text: u.username,
          id: String(u.id),
          avatarUrl: u.avatar_url || null,
        });
      });

      // Search hashtags
      const hashtags = await db('hashtags')
        .where('name', 'like', `%${q.replace('#', '')}%`)
        .orderBy('post_count', 'desc')
        .limit(4);

      hashtags.forEach((h: any) => {
        suggestions.push({
          type: 'hashtag',
          text: `#${h.name}`,
          id: String(h.id),
        });
      });

      res.status(200).json(suggestions);
    } catch (err) {
      next(err);
    }
  },
);

export { router as exploreRoutes };

// Create a separate search router that re-exports search handlers at root paths
// This allows mounting at /search so GET /search and GET /search/typeahead work
import { Router as SearchRouterFactory } from 'express';
const searchRouter = SearchRouterFactory();

searchRouter.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const q = (req.query.q as string) || '';
      const type = req.query.type as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);
      const db = getDatabase();

      const results: any[] = [];

      if (!type || type === 'users') {
        const users = await db('users')
          .whereNull('deleted_at')
          .where((qb: any) => {
            qb.where('username', 'like', `%${q}%`)
              .orWhere('display_name', 'like', `%${q}%`);
          })
          .select('id', 'username', 'display_name', 'avatar_url', 'bio')
          .limit(type === 'users' ? limit : 10);

        users.forEach((u: any) => {
          results.push({
            type: 'user',
            user: {
              id: String(u.id),
              username: u.username,
              displayName: u.display_name || null,
              avatarUrl: u.avatar_url || null,
              bio: u.bio || null,
            },
          });
        });
      }

      if (!type || type === 'posts') {
        const posts = await db('posts')
          .whereNull('deleted_at')
          .where('privacy', 'public')
          .where((qb: any) => {
            qb.where('content', 'like', `%${q}%`);
          })
          .orderBy('created_at', 'desc')
          .limit(type === 'posts' ? limit : 10);

        for (const post of posts) {
          const media = await db('post_media').where('post_id', post.id).orderBy('order_index', 'asc');
          const author = await db('users').where('id', post.user_id).select('id', 'username', 'display_name', 'avatar_url').first();
          results.push({
            type: 'post',
            post: {
              id: String(post.id),
              author: { id: String(author?.id || post.user_id), username: author?.username || 'unknown', displayName: author?.display_name || null, avatarUrl: author?.avatar_url || null },
              type: post.type,
              content: post.content,
              media: media.map((m: any) => ({ id: String(m.id), url: m.url, type: m.type, orderIndex: m.order_index })),
              likeCount: post.like_count || 0, commentCount: post.comment_count || 0, shareCount: post.share_count || 0,
              isLiked: false, isBookmarked: false, createdAt: post.created_at,
            },
          });
        }
      }

      if (!type || type === 'reels') {
        const reels = await db('posts')
          .whereNull('deleted_at')
          .where('privacy', 'public')
          .where('type', 'video')
          .where((qb: any) => { if (q) qb.where('content', 'like', `%${q}%`); })
          .orderBy('created_at', 'desc')
          .limit(type === 'reels' ? limit : 5);

        for (const reel of reels) {
          const media = await db('post_media').where('post_id', reel.id).orderBy('order_index', 'asc');
          const author = await db('users').where('id', reel.user_id).select('id', 'username', 'display_name', 'avatar_url').first();
          results.push({
            type: 'reel',
            post: {
              id: String(reel.id),
              author: { id: String(author?.id || reel.user_id), username: author?.username || 'unknown', displayName: author?.display_name || null, avatarUrl: author?.avatar_url || null },
              type: 'video',
              content: reel.content,
              media: media.map((m: any) => ({ id: String(m.id), url: m.url, type: m.type, orderIndex: m.order_index })),
              likeCount: reel.like_count || 0, commentCount: reel.comment_count || 0, shareCount: reel.share_count || 0,
              isLiked: false, isBookmarked: false, createdAt: reel.created_at,
            },
          });
        }
      }

      if (!type || type === 'hashtags') {
        const hashtags = await db('hashtags').where('name', 'like', `%${q.replace('#', '')}%`).orderBy('post_count', 'desc').limit(type === 'hashtags' ? limit : 10);
        hashtags.forEach((h: any) => {
          results.push({ type: 'hashtag', hashtag: { id: String(h.id), name: h.name, postCount: h.post_count } });
        });
      }

      res.status(200).json({ data: results, cursor: null, hasMore: false });
    } catch (err) {
      next(err);
    }
  },
);

searchRouter.get(
  '/typeahead',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const q = (req.query.q as string) || '';
      if (q.length < 2) { res.status(200).json([]); return; }
      const db = getDatabase();
      const suggestions: any[] = [];

      const users = await db('users').whereNull('deleted_at')
        .where((qb: any) => { qb.where('username', 'like', `%${q}%`).orWhere('display_name', 'like', `%${q}%`); })
        .select('id', 'username', 'avatar_url').limit(4);
      users.forEach((u: any) => { suggestions.push({ type: 'user', text: u.username, id: String(u.id), avatarUrl: u.avatar_url || null }); });

      const hashtags = await db('hashtags').where('name', 'like', `%${q.replace('#', '')}%`).orderBy('post_count', 'desc').limit(4);
      hashtags.forEach((h: any) => { suggestions.push({ type: 'hashtag', text: `#${h.name}`, id: String(h.id) }); });

      res.status(200).json(suggestions);
    } catch (err) {
      next(err);
    }
  },
);

export { searchRouter as searchRoutes };
