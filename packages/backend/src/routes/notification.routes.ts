/**
 * Notification route handlers.
 */

import { Router, Response, NextFunction } from 'express';
import { NotificationService } from '../services/notification';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const notificationService = new NotificationService();

/**
 * GET /notifications
 * Get paginated notifications for the authenticated user.
 */
router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const cursor = req.query.cursor as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await notificationService.getNotifications(userId, cursor, limit);

      // Enrich with source user info
      const { getDatabase } = require('../database/connection');
      const db = getDatabase();

      const enriched = await Promise.all(
        result.data.map(async (n: any) => {
          let sourceUser = null;
          if (n.source_user_id) {
            const user = await db('users')
              .where('id', n.source_user_id)
              .select('id', 'username', 'display_name', 'avatar_url')
              .first();
            if (user) {
              sourceUser = {
                id: String(user.id),
                username: user.username,
                displayName: user.display_name || null,
                avatarUrl: user.avatar_url || null,
              };
            }
          }
          return {
            id: String(n.id),
            eventType: n.event_type,
            sourceUser,
            referenceId: n.reference_id ? String(n.reference_id) : null,
            referenceType: n.reference_type || null,
            isRead: !!n.is_read,
            createdAt: n.created_at,
          };
        }),
      );

      res.status(200).json({
        data: enriched,
        cursor: result.cursor,
        hasMore: result.hasMore,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /notifications/unread-count
 * Get the unread notification count.
 */
router.get(
  '/unread-count',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const count = await notificationService.getUnreadCount(userId);
      res.status(200).json({ count });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /notifications/:id/read
 * PUT /notifications/:id/read
 * Mark a single notification as read.
 */
router.post(
  '/:id/read',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const notificationId = parseInt(req.params.id!, 10);
      if (isNaN(notificationId)) {
        res.status(400).json({ message: 'Invalid notification ID' });
        return;
      }

      const userId = req.user!.userId;
      await notificationService.markAsRead(notificationId, userId);
      res.status(200).json({ message: 'Notification marked as read' });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/:id/read',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const notificationId = parseInt(req.params.id!, 10);
      if (isNaN(notificationId)) {
        res.status(400).json({ message: 'Invalid notification ID' });
        return;
      }

      const userId = req.user!.userId;
      await notificationService.markAsRead(notificationId, userId);
      res.status(200).json({ message: 'Notification marked as read' });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /notifications/read-all
 * PUT /notifications/read-all
 * Mark all notifications as read.
 */
router.post(
  '/read-all',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const count = await notificationService.markAllAsRead(userId);
      res.status(200).json({ message: 'All notifications marked as read', count });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/read-all',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const count = await notificationService.markAllAsRead(userId);
      res.status(200).json({ message: 'All notifications marked as read', count });
    } catch (err) {
      next(err);
    }
  },
);

export { router as notificationRoutes };
