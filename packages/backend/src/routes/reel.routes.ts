/**
 * Reel route handlers.
 *
 * Handles creating and fetching short-form video reels.
 */

import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { getDatabase } from '../database/connection';

const router = Router();

// Multer config for video uploads (100MB limit for reels)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// Ensure uploads directory exists
const reelsDir = path.resolve(process.cwd(), 'uploads', 'reels');
if (!fs.existsSync(reelsDir)) {
  fs.mkdirSync(reelsDir, { recursive: true });
}

/**
 * Save a reel video to disk and return its URL.
 */
function saveReelVideo(file: Express.Multer.File, userId: number): string {
  const ext = file.originalname.split('.').pop() || 'mp4';
  const filename = `${uuidv4()}.${ext}`;
  const userDir = path.join(reelsDir, String(userId));
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  fs.writeFileSync(path.join(userDir, filename), file.buffer);
  return `/uploads/reels/${userId}/${filename}`;
}

/**
 * POST /reels
 * Create a new reel (short-form video).
 */
router.post(
  '/',
  authMiddleware,
  upload.single('video'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { caption, duration } = req.body;

      if (!req.file) {
        res.status(400).json({ message: 'Video file is required' });
        return;
      }

      // Validate video mimetype
      if (!req.file.mimetype.startsWith('video/')) {
        res.status(400).json({ message: 'File must be a video' });
        return;
      }

      const videoUrl = saveReelVideo(req.file, userId);
      const durationSeconds = parseInt(duration, 10) || 0;

      const db = getDatabase();

      // Create a post record with type 'video' so likes/comments work
      const [postId] = await db('posts').insert({
        user_id: userId,
        type: 'video',
        content: caption || null,
        privacy: 'public',
        like_count: 0,
        comment_count: 0,
        share_count: 0,
      });

      // Create post_media record for the video
      await db('post_media').insert({
        post_id: postId,
        url: videoUrl,
        type: 'video',
        order_index: 0,
        width: null,
        height: null,
        duration_seconds: durationSeconds,
      });

      // Also store in reels table for dedicated reel queries
      await db('reels').insert({
        user_id: userId,
        video_url: videoUrl,
        thumbnail_url: null,
        duration_seconds: durationSeconds,
        caption: caption || null,
        like_count: 0,
        comment_count: 0,
        share_count: 0,
      });

      const author = await db('users')
        .where('id', userId)
        .select('id', 'username', 'display_name', 'avatar_url')
        .first();

      res.status(201).json({
        id: String(postId),
        videoUrl,
        thumbnailUrl: null,
        durationSeconds,
        caption: caption || null,
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        createdAt: new Date().toISOString(),
        author: {
          id: String(author?.id || userId),
          username: author?.username || '',
          displayName: author?.display_name || null,
          avatarUrl: author?.avatar_url || null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /reels
 * Get reels feed (paginated, newest first).
 */
router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const cursor = req.query.cursor as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);

      const db = getDatabase();
      let query = db('reels')
        .join('users', 'reels.user_id', 'users.id')
        .whereNull('reels.deleted_at')
        .select(
          'reels.*',
          'users.username',
          'users.display_name',
          'users.avatar_url',
        )
        .orderBy('reels.created_at', 'desc');

      if (cursor) {
        const cursorId = parseInt(cursor, 10);
        if (!isNaN(cursorId)) {
          query = query.where('reels.id', '<', cursorId);
        }
      }

      query = query.limit(limit + 1);
      const results = await query;

      const hasMore = results.length > limit;
      const data = hasMore ? results.slice(0, limit) : results;

      const formatted = data.map((r: any) => ({
        id: String(r.id),
        videoUrl: r.video_url,
        thumbnailUrl: r.thumbnail_url,
        durationSeconds: r.duration_seconds,
        caption: r.caption,
        likeCount: r.like_count,
        commentCount: r.comment_count,
        shareCount: r.share_count,
        createdAt: r.created_at,
        author: {
          id: String(r.user_id),
          username: r.username,
          displayName: r.display_name || null,
          avatarUrl: r.avatar_url || null,
        },
      }));

      res.status(200).json({
        data: formatted,
        cursor: hasMore && data.length > 0 ? String(data[data.length - 1].id) : null,
        hasMore,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /reels/:id
 * Get a single reel by ID.
 */
router.get(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reelId = parseInt(req.params.id!, 10);
      if (isNaN(reelId)) {
        res.status(400).json({ message: 'Invalid reel ID' });
        return;
      }

      const db = getDatabase();
      const reel = await db('reels')
        .join('users', 'reels.user_id', 'users.id')
        .where('reels.id', reelId)
        .whereNull('reels.deleted_at')
        .select(
          'reels.*',
          'users.username',
          'users.display_name',
          'users.avatar_url',
        )
        .first();

      if (!reel) {
        res.status(404).json({ message: 'Reel not found' });
        return;
      }

      res.status(200).json({
        id: String(reel.id),
        videoUrl: reel.video_url,
        thumbnailUrl: reel.thumbnail_url,
        durationSeconds: reel.duration_seconds,
        caption: reel.caption,
        likeCount: reel.like_count,
        commentCount: reel.comment_count,
        shareCount: reel.share_count,
        createdAt: reel.created_at,
        author: {
          id: String(reel.user_id),
          username: reel.username,
          displayName: reel.display_name || null,
          avatarUrl: reel.avatar_url || null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /reels/:id/like
 * Like a reel.
 */
router.post(
  '/:id/like',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reelId = parseInt(req.params.id!, 10);
      if (isNaN(reelId)) {
        res.status(400).json({ message: 'Invalid reel ID' });
        return;
      }

      const userId = req.user!.userId;
      const db = getDatabase();

      // Check if already liked
      const existing = await db('likes')
        .where({ user_id: userId, likeable_id: reelId, likeable_type: 'reel' })
        .first();

      if (existing) {
        res.status(200).json({ message: 'Already liked' });
        return;
      }

      await db('likes').insert({ user_id: userId, likeable_id: reelId, likeable_type: 'reel' });
      await db('reels').where('id', reelId).increment('like_count', 1);

      res.status(201).json({ message: 'Reel liked' });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /reels/:id/like
 * Unlike a reel.
 */
router.delete(
  '/:id/like',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reelId = parseInt(req.params.id!, 10);
      if (isNaN(reelId)) {
        res.status(400).json({ message: 'Invalid reel ID' });
        return;
      }

      const userId = req.user!.userId;
      const db = getDatabase();

      const deleted = await db('likes')
        .where({ user_id: userId, likeable_id: reelId, likeable_type: 'reel' })
        .delete();

      if (deleted > 0) {
        await db('reels').where('id', reelId).decrement('like_count', 1);
      }

      res.status(200).json({ message: 'Reel unliked' });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /reels/:id/comments
 * Get comments for a reel.
 */
router.get(
  '/:id/comments',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reelId = parseInt(req.params.id!, 10);
      if (isNaN(reelId)) {
        res.status(400).json({ message: 'Invalid reel ID' });
        return;
      }

      const db = getDatabase();

      // Reel comments are stored with offset post_id (reelId + 1000000)
      const reelComments = await db('comments')
        .where('post_id', reelId + 1000000)
        .whereNull('deleted_at')
        .orderBy('created_at', 'desc')
        .limit(50);

      const formatted = await Promise.all(
        reelComments.map(async (c: any) => {
          const author = await db('users')
            .where('id', c.user_id)
            .select('id', 'username', 'display_name', 'avatar_url')
            .first();
          return {
            id: String(c.id),
            postId: `reel-${reelId}`,
            author: {
              id: String(author?.id || c.user_id),
              username: author?.username || 'unknown',
              displayName: author?.display_name || null,
              avatarUrl: author?.avatar_url || null,
            },
            content: c.content,
            parentCommentId: c.parent_comment_id ? String(c.parent_comment_id) : null,
            depth: c.depth || 0,
            createdAt: c.created_at,
          };
        }),
      );

      res.status(200).json(formatted);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /reels/:id/comments
 * Add a comment to a reel.
 */
router.post(
  '/:id/comments',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reelId = parseInt(req.params.id!, 10);
      if (isNaN(reelId)) {
        res.status(400).json({ message: 'Invalid reel ID' });
        return;
      }

      const userId = req.user!.userId;
      const { content } = req.body;

      if (!content || content.trim().length === 0) {
        res.status(400).json({ message: 'Comment content is required' });
        return;
      }

      if (content.length > 2000) {
        res.status(400).json({ message: 'Comment must not exceed 2000 characters' });
        return;
      }

      const db = getDatabase();

      // Store with offset post_id to distinguish reel comments (reelId + 1000000)
      const [commentId] = await db('comments').insert({
        post_id: reelId + 1000000,
        user_id: userId,
        parent_comment_id: null,
        content: content.trim(),
        depth: 0,
      });

      await db('reels').where('id', reelId).increment('comment_count', 1);

      const author = await db('users')
        .where('id', userId)
        .select('id', 'username', 'display_name', 'avatar_url')
        .first();

      res.status(201).json({
        id: String(commentId),
        postId: `reel-${reelId}`,
        author: {
          id: String(author?.id || userId),
          username: author?.username || 'unknown',
          displayName: author?.display_name || null,
          avatarUrl: author?.avatar_url || null,
        },
        content: content.trim(),
        parentCommentId: null,
        depth: 0,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

export { router as reelRoutes };
