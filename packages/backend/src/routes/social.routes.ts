/**
 * Social route handlers.
 *
 * Maps HTTP endpoints for friend requests, follows, and connections.
 */

import { Router, Response, NextFunction } from 'express';
import { FriendService, FriendServiceError } from '../services/friend';
import { SocialService, SocialServiceError } from '../services/social';
import { NotificationService } from '../services/notification';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const friendService = new FriendService();
const socialService = new SocialService();
const notificationService = new NotificationService();

// ============================================================
// Friend Request Routes
// ============================================================

/**
 * POST /users/:id/friend-request
 * Send a friend request to a user.
 */
router.post(
  '/:id/friend-request',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const recipientId = parseInt(req.params.id!, 10);
      if (isNaN(recipientId)) {
        res.status(400).json({ message: 'Invalid user ID' });
        return;
      }

      const senderId = req.user!.userId;
      const result = await friendService.sendFriendRequest(senderId, recipientId);

      // Auto-follow the recipient when sending a friend request
      try {
        await socialService.follow(senderId, recipientId);
      } catch {
        // Ignore if already following
      }

      if (result.autoAccepted) {
        res.status(201).json({
          message: 'Friend request auto-accepted (mutual request)',
          autoAccepted: true,
          friendship: result.friendship,
        });
      } else {
        // Notify the recipient about the friend request
        try {
          await notificationService.create({
            userId: recipientId,
            sourceUserId: senderId,
            eventType: 'friend_request',
            referenceId: result.request?.id,
            referenceType: 'user',
          });
        } catch {
          // Don't fail the request if notification fails
        }

        res.status(201).json({
          message: 'Friend request sent',
          autoAccepted: false,
          request: result.request,
        });
      }
    } catch (err) {
      if (err instanceof FriendServiceError) {
        (err as any).statusCode = err.statusCode;
        (err as any).details = { code: err.code };
      }
      next(err);
    }
  },
);

/**
 * POST /friend-requests/:id/accept
 * Accept a friend request.
 */
router.post(
  '/friend-requests/:id/accept',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const requestId = parseInt(req.params.id!, 10);
      if (isNaN(requestId)) {
        res.status(400).json({ message: 'Invalid request ID' });
        return;
      }

      const userId = req.user!.userId;
      const friendship = await friendService.acceptFriendRequest(requestId, userId);

      // Check if the acceptor is already following the sender
      let followBackSuggested = false;
      let senderId: number | null = null;
      try {
        const { getDatabase } = require('../database/connection');
        const db = getDatabase();

        // Get the sender from the friend request
        const request = await db('friend_requests').where('id', requestId).first();
        if (request) {
          senderId = request.sender_id;
          // Check if acceptor already follows the sender
          const existingFollow = await db('follows')
            .where('follower_id', userId)
            .where('followed_id', request.sender_id)
            .first();
          followBackSuggested = !existingFollow;
        }

        // Delete the friend_request notification
        await db('notifications')
          .where('user_id', userId)
          .where('event_type', 'friend_request')
          .where('reference_id', requestId)
          .delete();
      } catch {
        // Don't fail if notification cleanup fails
      }

      res.status(200).json({
        message: 'Friend request accepted',
        friendship,
        followBackSuggested,
        senderId: senderId ? String(senderId) : null,
      });
    } catch (err) {
      if (err instanceof FriendServiceError) {
        (err as any).statusCode = err.statusCode;
        (err as any).details = { code: err.code };
      }
      next(err);
    }
  },
);

/**
 * POST /friend-requests/:id/decline
 * Decline a friend request.
 */
router.post(
  '/friend-requests/:id/decline',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const requestId = parseInt(req.params.id!, 10);
      if (isNaN(requestId)) {
        res.status(400).json({ message: 'Invalid request ID' });
        return;
      }

      const userId = req.user!.userId;
      await friendService.declineFriendRequest(requestId, userId);

      // Delete the friend_request notification
      try {
        const { getDatabase } = require('../database/connection');
        const db = getDatabase();
        await db('notifications')
          .where('user_id', userId)
          .where('event_type', 'friend_request')
          .where('reference_id', requestId)
          .delete();
      } catch {
        // Don't fail if notification cleanup fails
      }

      res.status(200).json({ message: 'Friend request declined' });
    } catch (err) {
      if (err instanceof FriendServiceError) {
        (err as any).statusCode = err.statusCode;
        (err as any).details = { code: err.code };
      }
      next(err);
    }
  },
);

// ============================================================
// Follow Routes
// ============================================================

/**
 * POST /users/:id/follow
 * Follow a user.
 */
router.post(
  '/:id/follow',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const followedId = parseInt(req.params.id!, 10);
      if (isNaN(followedId)) {
        res.status(400).json({ message: 'Invalid user ID' });
        return;
      }

      const followerId = req.user!.userId;
      await socialService.follow(followerId, followedId);

      // Notify the followed user
      try {
        await notificationService.create({
          userId: followedId,
          sourceUserId: followerId,
          eventType: 'follow',
          referenceId: followerId,
          referenceType: 'user',
        });
      } catch {
        // Don't fail the request if notification fails
      }

      res.status(201).json({ message: 'User followed' });
    } catch (err) {
      if (err instanceof SocialServiceError) {
        (err as any).statusCode = err.statusCode;
        (err as any).details = { code: err.code };
      }
      next(err);
    }
  },
);

/**
 * DELETE /users/:id/follow
 * Unfollow a user.
 */
router.delete(
  '/:id/follow',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const followedId = parseInt(req.params.id!, 10);
      if (isNaN(followedId)) {
        res.status(400).json({ message: 'Invalid user ID' });
        return;
      }

      const followerId = req.user!.userId;
      await socialService.unfollow(followerId, followedId);

      res.status(200).json({ message: 'User unfollowed' });
    } catch (err) {
      if (err instanceof SocialServiceError) {
        (err as any).statusCode = err.statusCode;
        (err as any).details = { code: err.code };
      }
      next(err);
    }
  },
);

// ============================================================
// Connections Routes
// ============================================================

/**
 * GET /users/:id/connections
 * Get paginated connections (friends, followers, following).
 */
router.get(
  '/:id/connections',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.id!, 10);
      if (isNaN(userId)) {
        res.status(400).json({ message: 'Invalid user ID' });
        return;
      }

      const type = (req.query.type as string) || 'friends';
      const cursor = req.query.cursor as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      if (!['friends', 'followers', 'following'].includes(type)) {
        res.status(400).json({ message: 'Invalid connection type' });
        return;
      }

      const result = await socialService.getConnections(
        userId,
        type as any,
        cursor || null,
        limit,
      );

      res.status(200).json(result);
    } catch (err) {
      if (err instanceof SocialServiceError) {
        (err as any).statusCode = err.statusCode;
        (err as any).details = { code: err.code };
      }
      next(err);
    }
  },
);

export { router as socialRoutes };
