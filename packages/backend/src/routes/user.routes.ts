/**
 * User route handlers.
 *
 * Maps HTTP endpoints to UserService methods for profile management.
 */

import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { UserService, UserServiceError } from '../services/user';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const userService = new UserService();

// Multer config for file uploads (memory storage, 10MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/**
 * GET /users/me
 * Get the current authenticated user's profile.
 */
router.get(
  '/me',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const profile = await userService.getProfile(userId, userId);

      res.status(200).json(formatProfileResponse(profile));
    } catch (err) {
      handleUserServiceError(err, next);
    }
  },
);

/**
 * GET /users/:id
 * Get a user's profile by ID.
 */
router.get(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const targetId = parseInt(req.params.id!, 10);
      if (isNaN(targetId)) {
        res.status(400).json({ message: 'Invalid user ID' });
        return;
      }

      const requesterId = req.user!.userId;
      const profile = await userService.getProfile(targetId, requesterId);

      // Query real counts from the database
      const { getDatabase } = require('../database/connection');
      const db = getDatabase();

      const postCount = await db('posts').where('user_id', targetId).whereNull('deleted_at').count('* as c').first().then((r: any) => Number(r?.c || 0));
      const friendCount = await db('friendships').where('user_id_1', targetId).orWhere('user_id_2', targetId).count('* as c').first().then((r: any) => Number(r?.c || 0));
      const followerCount = await db('follows').where('followed_id', targetId).count('* as c').first().then((r: any) => Number(r?.c || 0));
      const followingCount = await db('follows').where('follower_id', targetId).count('* as c').first().then((r: any) => Number(r?.c || 0));

      // Check relationship flags
      let isFriend = false;
      let isFollowing = false;
      let friendRequestSent = false;
      let friendRequestReceived = false;

      if (requesterId !== targetId) {
        const friendship = await db('friendships')
          .where(function(this: any) { this.where('user_id_1', requesterId).andWhere('user_id_2', targetId); })
          .orWhere(function(this: any) { this.where('user_id_1', targetId).andWhere('user_id_2', requesterId); })
          .first();
        isFriend = !!friendship;

        const follow = await db('follows').where('follower_id', requesterId).where('followed_id', targetId).first();
        isFollowing = !!follow;

        const sentRequest = await db('friend_requests').where('sender_id', requesterId).where('recipient_id', targetId).where('status', 'pending').first();
        friendRequestSent = !!sentRequest;

        const receivedRequest = await db('friend_requests').where('sender_id', targetId).where('recipient_id', requesterId).where('status', 'pending').first();
        friendRequestReceived = !!receivedRequest;
      }

      res.status(200).json({
        ...formatProfileResponse(profile),
        postCount,
        friendCount,
        followerCount,
        followingCount,
        isFriend,
        isFollowing,
        friendRequestSent,
        friendRequestReceived,
      });
    } catch (err) {
      handleUserServiceError(err, next);
    }
  },
);

/**
 * PUT /users/:id
 * Update a user's profile (owner only).
 */
router.put(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const targetId = parseInt(req.params.id!, 10);
      if (isNaN(targetId)) {
        res.status(400).json({ message: 'Invalid user ID' });
        return;
      }

      // Only the owner can update their profile
      if (req.user!.userId !== targetId) {
        res.status(403).json({ message: 'You can only update your own profile' });
        return;
      }

      const { displayName, bio, location, website } = req.body;
      const updateData: Record<string, string | undefined> = {};
      if (displayName !== undefined) updateData.display_name = displayName;
      if (bio !== undefined) updateData.bio = bio;
      if (location !== undefined) updateData.location = location;
      if (website !== undefined) updateData.website = website;

      const profile = await userService.updateProfile(targetId, updateData as any);

      res.status(200).json(formatProfileResponse(profile));
    } catch (err) {
      handleUserServiceError(err, next);
    }
  },
);

/**
 * POST /users/:id/avatar
 * Upload a profile photo (owner only).
 */
router.post(
  '/:id/avatar',
  authMiddleware,
  upload.single('avatar'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const targetId = parseInt(req.params.id!, 10);
      if (isNaN(targetId)) {
        res.status(400).json({ message: 'Invalid user ID' });
        return;
      }

      if (req.user!.userId !== targetId) {
        res.status(403).json({ message: 'You can only update your own profile photo' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ message: 'No file uploaded' });
        return;
      }

      const result = await userService.uploadProfilePhoto(targetId, {
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        size: req.file.size,
        originalname: req.file.originalname,
      });

      res.status(200).json({ url: result.url });
    } catch (err) {
      handleUserServiceError(err, next);
    }
  },
);

/**
 * POST /users/:id/cover
 * Upload a cover photo (owner only).
 */
router.post(
  '/:id/cover',
  authMiddleware,
  upload.single('cover'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const targetId = parseInt(req.params.id!, 10);
      if (isNaN(targetId)) {
        res.status(400).json({ message: 'Invalid user ID' });
        return;
      }

      if (req.user!.userId !== targetId) {
        res.status(403).json({ message: 'You can only update your own cover photo' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ message: 'No file uploaded' });
        return;
      }

      const result = await userService.uploadCoverPhoto(targetId, {
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        size: req.file.size,
        originalname: req.file.originalname,
      });

      res.status(200).json({ url: result.url });
    } catch (err) {
      handleUserServiceError(err, next);
    }
  },
);

// --- Helpers ---

/**
 * DELETE /users/:id
 * Delete (soft-delete) a user account (owner only).
 */
router.delete(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const targetId = parseInt(req.params.id!, 10);
      if (isNaN(targetId)) {
        res.status(400).json({ message: 'Invalid user ID' });
        return;
      }

      if (req.user!.userId !== targetId) {
        res.status(403).json({ message: 'You can only delete your own account' });
        return;
      }

      const { UserProfileRepository } = require('../services/user');
      const repo = new UserProfileRepository();
      await repo.softDelete(targetId);

      res.status(200).json({ message: 'Account deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);

// --- Formatting Helpers ---

/**
 * Format a profile entity to the frontend-expected camelCase shape.
 */
function formatProfileResponse(profile: Record<string, any>) {
  return {
    id: String(profile.id),
    username: profile.username,
    email: profile.email,
    displayName: profile.display_name || null,
    bio: profile.bio || null,
    location: profile.location || null,
    website: profile.website || null,
    avatarUrl: profile.avatar_url || null,
    coverUrl: profile.cover_url || null,
    role: profile.role,
    createdAt: profile.created_at,
    postCount: 0,
    friendCount: 0,
    followerCount: 0,
    followingCount: 0,
    isFriend: false,
    isFollowing: false,
    friendRequestSent: false,
    friendRequestReceived: false,
  };
}

/**
 * Handle UserServiceError and pass to Express error handler.
 */
function handleUserServiceError(err: unknown, next: NextFunction) {
  if (err instanceof UserServiceError) {
    (err as any).statusCode = err.statusCode;
    if (err.errors) {
      (err as any).details = { fields: err.errors };
    }
  }
  next(err);
}

export { router as userRoutes };
