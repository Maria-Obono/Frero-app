/**
 * Feed route handlers.
 *
 * Returns the user's personalized feed (posts from followed users + own posts).
 * Reels are stored as posts with type='reel', so they appear naturally.
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { getDatabase } from '../database/connection';

const router = Router();

/**
 * GET /feed
 * Get the authenticated user's feed.
 * Returns posts (including reels) from users they follow + their own, ordered by recency.
 */
router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const cursor = req.query.cursor as string | undefined;
      const db = getDatabase();

      // Get IDs of users the current user follows
      const followedUsers = await db('follows')
        .where('follower_id', userId)
        .select('followed_id');
      const followedIds = followedUsers.map((f: any) => f.followed_id);

      // Include own posts + followed users' posts (reels are posts with type='reel')
      const feedUserIds = [userId, ...followedIds];

      const qb = db('posts')
        .whereIn('user_id', feedUserIds)
        .whereNull('deleted_at')
        .where('privacy', 'public')
        .orderBy('created_at', 'desc')
        .limit(limit + 1);

      if (cursor) {
        const cursorId = parseInt(cursor, 10);
        if (!isNaN(cursorId)) {
          qb.where('id', '<', cursorId);
        }
      }

      const posts = await qb;
      const hasMore = posts.length > limit;
      const data = hasMore ? posts.slice(0, limit) : posts;

      // Get liked post IDs for the current user
      const postIds = data.map((p: any) => p.id);
      const userLikes = postIds.length > 0
        ? await db('likes')
            .where('user_id', userId)
            .where('likeable_type', 'post')
            .whereIn('likeable_id', postIds)
            .select('likeable_id')
        : [];
      const likedPostIds = new Set(userLikes.map((l: any) => l.likeable_id));

      // Fetch media and author info for each post
      const formattedPosts = await Promise.all(
        data.map(async (post: any) => {
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

      res.status(200).json({
        data: formattedPosts,
        cursor: hasMore && data.length > 0 ? String(data[data.length - 1].id) : null,
        hasMore,
      });
    } catch (err) {
      next(err);
    }
  },
);

export { router as feedRoutes };
