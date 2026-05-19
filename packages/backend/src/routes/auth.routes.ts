/**
 * Auth route handlers.
 *
 * Maps HTTP endpoints to AuthService methods and formats responses.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService, AuthError, UserRepository } from '../services/auth';
import { validateBody } from '../middleware';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const authService = new AuthService();
const userRepository = new UserRepository();

// --- Validation schemas ---

const registerSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
  totpCode: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// --- Helper to format user data for response ---

function formatUserResponse(userRecord: {
  id: number;
  email: string;
  username: string;
  role: string;
  display_name?: string | null;
  avatar_url?: string | null;
}) {
  return {
    id: String(userRecord.id),
    email: userRecord.email,
    username: userRecord.username,
    role: userRecord.role,
    displayName: userRecord.display_name || null,
    avatarUrl: userRecord.avatar_url || null,
  };
}

/**
 * Helper to get user record from DB by userId (for auth responses).
 */
async function getUserForResponse(userId: number) {
  const user = await userRepository.findById(userId);
  if (!user) {
    return { id: userId, email: '', username: '', role: 'user', display_name: null, avatar_url: null };
  }
  return user;
}

// --- Route handlers ---

/**
 * POST /auth/register
 * Creates a new user account and returns tokens + user data.
 */
router.post(
  '/register',
  validateBody(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, username, password } = req.body;
      const tokens = await authService.register({ email, username, password });

      // Decode the access token to get userId, then fetch full user record
      const decoded = await authService.verifyAccessToken(tokens.accessToken);
      const userRecord = await getUserForResponse(decoded.userId);

      res.status(201).json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        user: formatUserResponse(userRecord as any),
      });
    } catch (err) {
      if (err instanceof AuthError) {
        (err as any).statusCode = err.statusCode;
        (err as any).details = err.details;
      }
      next(err);
    }
  },
);

/**
 * POST /auth/login
 * Authenticates a user and returns tokens + user data.
 */
router.post(
  '/login',
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identifier, password, totpCode } = req.body;
      const tokens = await authService.login({ identifier, password, totpCode });

      // Decode the access token to get userId, then fetch full user record
      const decoded = await authService.verifyAccessToken(tokens.accessToken);
      const userRecord = await getUserForResponse(decoded.userId);

      res.status(200).json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        user: formatUserResponse(userRecord as any),
      });
    } catch (err) {
      if (err instanceof AuthError) {
        // Check if 2FA is required
        if (err.details?.code === '2FA_REQUIRED') {
          res.status(200).json({ requires2FA: true });
          return;
        }
        (err as any).statusCode = err.statusCode;
        (err as any).details = err.details;
      }
      next(err);
    }
  },
);

/**
 * POST /auth/refresh
 * Refreshes access token using a valid refresh token.
 * Returns new tokens + user data.
 */
router.post(
  '/refresh',
  validateBody(refreshSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;
      const tokens = await authService.refreshToken(refreshToken);

      // Decode the new access token to get userId, then fetch full user record
      const decoded = await authService.verifyAccessToken(tokens.accessToken);
      const userRecord = await getUserForResponse(decoded.userId);

      res.status(200).json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        user: formatUserResponse(userRecord as any),
      });
    } catch (err) {
      if (err instanceof AuthError) {
        (err as any).statusCode = err.statusCode;
        (err as any).details = err.details;
      }
      next(err);
    }
  },
);

/**
 * POST /auth/logout
 * Invalidates the refresh token session.
 */
router.post(
  '/logout',
  authMiddleware,
  validateBody(logoutSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;
      const userId = String(req.user!.userId);
      await authService.logout(userId, refreshToken);

      res.status(200).json({ message: 'Logged out successfully' });
    } catch (err) {
      if (err instanceof AuthError) {
        (err as any).statusCode = err.statusCode;
        (err as any).details = err.details;
      }
      next(err);
    }
  },
);

/**
 * POST /auth/forgot-password
 * Generates a password reset token for the given email.
 * In production this would send an email; for now it returns the token.
 */
router.post(
  '/forgot-password',
  validateBody(z.object({ email: z.string().min(1, 'Email is required') })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;
      const user = await userRepository.findByEmail(email);

      // Always return success to prevent email enumeration
      if (!user) {
        res.status(200).json({ message: 'If an account with that email exists, a reset link has been sent.' });
        return;
      }

      // Generate a reset token (simple UUID, stored in DB)
      const { v4: uuidv4 } = require('uuid');
      const bcrypt = require('bcrypt');
      const token = uuidv4();
      const tokenHash = await bcrypt.hash(token, 10);

      const { getDatabase } = require('../database/connection');
      const db = getDatabase();

      // Store the reset token (expires in 1 hour)
      await db('users').where('id', user.id).update({
        password_reset_token: tokenHash,
        password_reset_expires: new Date(Date.now() + 60 * 60 * 1000),
      });

      // In production, send email with reset link. For dev, return token.
      res.status(200).json({
        message: 'If an account with that email exists, a reset link has been sent.',
        // DEV ONLY: include token for testing
        resetToken: token,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /auth/reset-password
 * Resets the password using a valid reset token.
 */
router.post(
  '/reset-password',
  validateBody(z.object({
    email: z.string().min(1, 'Email is required'),
    token: z.string().min(1, 'Reset token is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, token, newPassword } = req.body;
      const bcrypt = require('bcrypt');
      const { getDatabase } = require('../database/connection');
      const db = getDatabase();

      const user = await userRepository.findByEmail(email);
      if (!user) {
        res.status(400).json({ message: 'Invalid or expired reset token' });
        return;
      }

      // Get the stored token hash and expiry
      const userRecord = await db('users').where('id', user.id).first();

      if (!userRecord.password_reset_token || !userRecord.password_reset_expires) {
        res.status(400).json({ message: 'Invalid or expired reset token' });
        return;
      }

      // Check expiry
      if (new Date(userRecord.password_reset_expires) < new Date()) {
        res.status(400).json({ message: 'Reset token has expired' });
        return;
      }

      // Verify token
      const isValid = await bcrypt.compare(token, userRecord.password_reset_token);
      if (!isValid) {
        res.status(400).json({ message: 'Invalid or expired reset token' });
        return;
      }

      // Hash new password and update
      const newHash = await bcrypt.hash(newPassword, 10);
      await db('users').where('id', user.id).update({
        password_hash: newHash,
        password_reset_token: null,
        password_reset_expires: null,
      });

      res.status(200).json({ message: 'Password reset successfully' });
    } catch (err) {
      next(err);
    }
  },
);

export { router as authRoutes };
