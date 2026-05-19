/**
 * API v1 router — aggregates all route modules.
 */

import { Router } from 'express';
import { authRoutes } from './auth.routes';
import { userRoutes } from './user.routes';
import { postRoutes } from './post.routes';
import { socialRoutes } from './social.routes';
import { feedRoutes } from './feed.routes';
import { exploreRoutes, searchRoutes } from './explore.routes';
import { chatRoutes } from './chat.routes';
import { notificationRoutes } from './notification.routes';
import { reelRoutes } from './reel.routes';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/users', socialRoutes);
apiRouter.use('/posts', postRoutes);
apiRouter.use('/reels', reelRoutes);
apiRouter.use('/feed', feedRoutes);
apiRouter.use('/explore', exploreRoutes);
apiRouter.use('/search', searchRoutes);
apiRouter.use('/chats', chatRoutes);
apiRouter.use('/notifications', notificationRoutes);

// Stub: stories endpoint (returns empty until fully implemented)
apiRouter.get('/stories/active', (_req, res) => {
  res.status(200).json({ data: [] });
});

export { apiRouter };
