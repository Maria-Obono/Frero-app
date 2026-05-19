/**
 * Post route handlers.
 *
 * Maps HTTP endpoints to PostService methods for creating and fetching posts.
 */

import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { PostService, PostServiceError, PostType, PostPrivacy, PostRepository } from '../services/post';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const postService = new PostService();
const postRepository = new PostRepository();

// Multer config for media uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per file
});

// Ensure uploads directory exists
const uploadsDir = path.resolve(process.cwd(), 'uploads', 'posts');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Save an uploaded file to disk and return its URL.
 */
function savePostMedia(file: Express.Multer.File, userId: number): string {
  const ext = file.originalname.split('.').pop() || 'jpg';
  const filename = `${uuidv4()}.${ext}`;
  const userDir = path.join(uploadsDir, String(userId));
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  fs.writeFileSync(path.join(userDir, filename), file.buffer);
  return `/uploads/posts/${userId}/${filename}`;
}

/**
 * POST /posts
 * Create a new post (text, photo, video, carousel).
 */
router.post(
  '/',
  authMiddleware,
  upload.array('media', 10),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { type, content, privacy } = req.body;

      const postType = (type as PostType) || PostType.TEXT;
      const postPrivacy = (privacy as PostPrivacy) || PostPrivacy.PUBLIC;
      const files = (req.files as Express.Multer.File[]) || [];

      // Create the post record
      const postId = await postRepository.create({
        user_id: userId,
        type: postType,
        content: content || null,
        privacy: postPrivacy,
        like_count: 0,
        comment_count: 0,
        share_count: 0,
      } as any);

      // Save media files and create post_media records
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        const url = savePostMedia(file, userId);
        const mediaType = file.mimetype.startsWith('video/') ? 'video' : 'image';
        await postRepository.createPostMedia({
          post_id: postId,
          url,
          type: mediaType as any,
          order_index: i,
          width: null,
          height: null,
          duration_seconds: null,
        });
      }

      // Extract and index hashtags
      const hashtags = postService.extractHashtags(content || '');
      for (const tag of hashtags) {
        const hashtagId = await postRepository.findOrCreateHashtag(tag);
        await postRepository.createPostHashtag(postId, hashtagId);
      }

      // Fetch the created post with media
      const post = await postRepository.findById(postId);
      const media = await postRepository.getPostMedia(postId);

      res.status(201).json({
        id: String(post!.id),
        type: post!.type,
        content: post!.content,
        media: media.map((m: any) => ({
          id: String(m.id),
          url: m.url,
          type: m.type,
          orderIndex: m.order_index,
        })),
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        isLiked: false,
        isBookmarked: false,
        createdAt: post!.created_at,
      });
    } catch (err) {
      if (err instanceof PostServiceError) {
        (err as any).statusCode = err.statusCode;
        (err as any).details = err.details;
      }
      next(err);
    }
  },
);

/**
 * GET /posts
 * Get posts (including reels), optionally filtered by userId.
 */
router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const cursor = req.query.cursor as string | undefined;

      const db = postRepository.getDb();

      const qb = db('posts')
        .whereNull('posts.deleted_at')
        .orderBy('posts.created_at', 'desc')
        .limit(limit + 1);

      if (userId) {
        qb.where('posts.user_id', userId);
      }

      if (cursor) {
        const cursorId = parseInt(cursor, 10);
        if (!isNaN(cursorId)) {
          qb.where('posts.id', '<', cursorId);
        }
      }

      const posts = await qb;
      const hasMore = posts.length > limit;
      const data = hasMore ? posts.slice(0, limit) : posts;

      // Get liked post IDs for the current user
      const currentUserId = req.user!.userId;
      const postIds = data.map((p: any) => p.id);
      const userLikes = postIds.length > 0
        ? await db('likes')
            .where('user_id', currentUserId)
            .where('likeable_type', 'post')
            .whereIn('likeable_id', postIds)
            .select('likeable_id')
        : [];
      const likedPostIds = new Set(userLikes.map((l: any) => l.likeable_id));

      // Fetch media and author info for each post
      const formattedPosts = await Promise.all(
        data.map(async (post: any) => {
          const media = await postRepository.getPostMedia(post.id);
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

/**
 * GET /posts/:id
 * Get a single post by ID.
 */
router.get(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const postId = parseInt(req.params.id!, 10);
      if (isNaN(postId)) {
        res.status(400).json({ message: 'Invalid post ID' });
        return;
      }

      const post = await postRepository.findById(postId);
      if (!post) {
        res.status(404).json({ message: 'Post not found' });
        return;
      }

      const media = await postRepository.getPostMedia(postId);
      const db = postRepository.getDb();
      const author = await db('users')
        .where('id', post.user_id)
        .select('id', 'username', 'display_name', 'avatar_url')
        .first();

      res.status(200).json({
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
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /posts/:id
 * Edit a post (only within 30 minutes of creation, owner only).
 */
router.put(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const postId = parseInt(req.params.id!, 10);
      if (isNaN(postId)) {
        res.status(400).json({ message: 'Invalid post ID' });
        return;
      }

      const userId = req.user!.userId;
      const post = await postRepository.findById(postId);

      if (!post) {
        res.status(404).json({ message: 'Post not found' });
        return;
      }

      if (post.user_id !== userId) {
        res.status(403).json({ message: 'You can only edit your own posts' });
        return;
      }

      // Check 1-hour edit window
      const createdAt = new Date(post.created_at).getTime();
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;

      if (now - createdAt > oneHour) {
        res.status(403).json({ message: 'Posts can only be edited within 1 hour of creation' });
        return;
      }

      const { content } = req.body;
      if (content !== undefined) {
        if (content.length > 5000) {
          res.status(400).json({ message: 'Content must not exceed 5000 characters' });
          return;
        }
        const db = postRepository.getDb();
        await db('posts').where('id', postId).update({ content, updated_at: db.fn.now() });
      }

      // Return updated post
      const updated = await postRepository.findById(postId);
      const media = await postRepository.getPostMedia(postId);

      res.status(200).json({
        id: String(updated!.id),
        type: updated!.type,
        content: updated!.content,
        media: media.map((m: any) => ({
          id: String(m.id),
          url: m.url,
          type: m.type,
          orderIndex: m.order_index,
        })),
        likeCount: updated!.like_count || 0,
        commentCount: updated!.comment_count || 0,
        shareCount: updated!.share_count || 0,
        isLiked: false,
        isBookmarked: false,
        createdAt: updated!.created_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /posts/:id
 * Delete a post (soft-delete, owner only, anytime).
 */
router.delete(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const postId = parseInt(req.params.id!, 10);
      if (isNaN(postId)) {
        res.status(400).json({ message: 'Invalid post ID' });
        return;
      }

      const userId = req.user!.userId;
      const post = await postRepository.findById(postId);

      if (!post) {
        res.status(404).json({ message: 'Post not found' });
        return;
      }

      if (post.user_id !== userId) {
        res.status(403).json({ message: 'You can only delete your own posts' });
        return;
      }

      await postRepository.softDelete(postId);
      res.status(200).json({ message: 'Post deleted' });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /posts/:id/like
 * Like a post.
 */
router.post(
  '/:id/like',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const postId = parseInt(req.params.id!, 10);
      const userId = req.user!.userId;

      const existing = await postRepository.findLike(userId, postId, 'post' as any);
      if (existing) {
        res.status(200).json({ message: 'Already liked' });
        return;
      }

      await postRepository.createLike(userId, postId, 'post' as any);
      await postRepository.incrementLikeCount(postId);

      res.status(201).json({ message: 'Post liked' });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /posts/:id/like
 * Unlike a post.
 */
router.delete(
  '/:id/like',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const postId = parseInt(req.params.id!, 10);
      const userId = req.user!.userId;

      const deleted = await postRepository.deleteLike(userId, postId, 'post' as any);
      if (deleted > 0) {
        await postRepository.decrementLikeCount(postId);
      }

      res.status(200).json({ message: 'Post unliked' });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /posts/:id/comments
 * Get comments for a post.
 */
router.get(
  '/:id/comments',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const postId = parseInt(req.params.id!, 10);
      if (isNaN(postId)) {
        res.status(400).json({ message: 'Invalid post ID' });
        return;
      }

      const db = postRepository.getDb();
      const comments = await db('comments')
        .where('post_id', postId)
        .whereNull('deleted_at')
        .orderBy('created_at', 'asc')
        .limit(50);

      // Fetch author info for each comment
      const formatted = await Promise.all(
        comments.map(async (c: any) => {
          const author = await db('users')
            .where('id', c.user_id)
            .select('id', 'username', 'display_name', 'avatar_url')
            .first();
          return {
            id: String(c.id),
            postId: String(c.post_id),
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

      res.status(200).json({ data: formatted });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /posts/:id/comments
 * Add a comment to a post.
 */
router.post(
  '/:id/comments',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const postId = parseInt(req.params.id!, 10);
      if (isNaN(postId)) {
        res.status(400).json({ message: 'Invalid post ID' });
        return;
      }

      const userId = req.user!.userId;
      const { content, parentCommentId } = req.body;

      if (!content || content.trim().length === 0) {
        res.status(400).json({ message: 'Comment content is required' });
        return;
      }

      if (content.length > 2000) {
        res.status(400).json({ message: 'Comment must not exceed 2000 characters' });
        return;
      }

      // Determine depth
      let depth = 0;
      let parentId: number | null = null;
      if (parentCommentId) {
        parentId = parseInt(parentCommentId, 10);
        const parent = await postRepository.findCommentById(parentId);
        if (parent) {
          depth = (parent as any).depth + 1;
          if (depth > 3) {
            res.status(400).json({ message: 'Maximum comment nesting depth reached' });
            return;
          }
        }
      }

      const commentId = await postRepository.createComment({
        post_id: postId,
        user_id: userId,
        parent_comment_id: parentId,
        content: content.trim(),
        depth,
      });

      await postRepository.incrementCommentCount(postId);

      // Fetch the created comment with author info
      const db = postRepository.getDb();
      const comment = await db('comments').where('id', commentId).first();
      const author = await db('users')
        .where('id', userId)
        .select('id', 'username', 'display_name', 'avatar_url')
        .first();

      res.status(201).json({
        id: String(comment.id),
        postId: String(comment.post_id),
        author: {
          id: String(author?.id || userId),
          username: author?.username || 'unknown',
          displayName: author?.display_name || null,
          avatarUrl: author?.avatar_url || null,
        },
        content: comment.content,
        parentCommentId: comment.parent_comment_id ? String(comment.parent_comment_id) : null,
        depth: comment.depth,
        createdAt: comment.created_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

export { router as postRoutes };
