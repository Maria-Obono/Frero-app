/**
 * Chat route handlers.
 *
 * Returns conversations and messages for the messaging feature.
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { getDatabase } from '../database/connection';

const router = Router();

/**
 * POST /chats
 * Create a new chat (private conversation with another user).
 */
router.post(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const { participantId } = req.body;

      if (!participantId) {
        res.status(400).json({ message: 'participantId is required' });
        return;
      }

      const targetId = parseInt(participantId, 10);
      if (isNaN(targetId)) {
        res.status(400).json({ message: 'Invalid participant ID' });
        return;
      }

      const db = getDatabase();

      // Check if a private chat already exists between these two users
      const existingChat = await db('chats')
        .join('chat_participants as cp1', 'chats.id', 'cp1.chat_id')
        .join('chat_participants as cp2', 'chats.id', 'cp2.chat_id')
        .where('chats.type', 'private')
        .where('cp1.user_id', userId)
        .where('cp2.user_id', targetId)
        .select('chats.id')
        .first();

      if (existingChat) {
        // Return existing chat
        const chat = await db('chats').where('id', existingChat.id).first();
        const participants = await db('chat_participants')
          .join('users', 'chat_participants.user_id', 'users.id')
          .where('chat_participants.chat_id', chat.id)
          .select('users.id', 'users.username', 'users.display_name', 'users.avatar_url');

        res.status(200).json({
          id: String(chat.id),
          type: 'private',
          name: null,
          participants: participants.map((p: any) => ({
            id: String(p.id),
            username: p.username,
            displayName: p.display_name || null,
            avatarUrl: p.avatar_url || null,
          })),
          lastMessage: null,
          unreadCount: 0,
        });
        return;
      }

      // Create new chat
      const [chatId] = await db('chats').insert({ type: 'private', created_by: userId });

      // Add both participants
      await db('chat_participants').insert([
        { chat_id: chatId, user_id: userId },
        { chat_id: chatId, user_id: targetId },
      ]);

      // Fetch participants info
      const participants = await db('chat_participants')
        .join('users', 'chat_participants.user_id', 'users.id')
        .where('chat_participants.chat_id', chatId)
        .select('users.id', 'users.username', 'users.display_name', 'users.avatar_url');

      res.status(201).json({
        id: String(chatId),
        type: 'private',
        name: null,
        participants: participants.map((p: any) => ({
          id: String(p.id),
          username: p.username,
          displayName: p.display_name || null,
          avatarUrl: p.avatar_url || null,
        })),
        lastMessage: null,
        unreadCount: 0,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /chats
 * Get all conversations for the authenticated user.
 */
router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const db = getDatabase();

      // Get chats the user participates in
      const chatIds = await db('chat_participants')
        .where('user_id', userId)
        .select('chat_id');

      if (chatIds.length === 0) {
        res.status(200).json({ data: [] });
        return;
      }

      const ids = chatIds.map((r: any) => r.chat_id);

      const chats = await db('chats')
        .whereIn('id', ids)
        .orderBy('updated_at', 'desc');

      const formattedChats = await Promise.all(
        chats.map(async (chat: any) => {
          // Get participants
          const participants = await db('chat_participants')
            .join('users', 'chat_participants.user_id', 'users.id')
            .where('chat_participants.chat_id', chat.id)
            .select('users.id', 'users.username', 'users.display_name', 'users.avatar_url');

          // Get last message
          const lastMessage = await db('messages')
            .where('chat_id', chat.id)
            .orderBy('created_at', 'desc')
            .first();

          return {
            id: String(chat.id),
            type: chat.type || 'private',
            name: chat.name || null,
            participants: participants.map((p: any) => ({
              id: String(p.id),
              username: p.username,
              displayName: p.display_name || null,
              avatarUrl: p.avatar_url || null,
            })),
            lastMessage: lastMessage
              ? {
                  content: lastMessage.content_encrypted || '',
                  senderId: String(lastMessage.sender_id),
                  createdAt: lastMessage.created_at,
                }
              : null,
            unreadCount: 0,
          };
        }),
      );

      res.status(200).json({ data: formattedChats });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /chats/:id/messages
 * Get messages for a specific chat.
 */
router.get(
  '/:id/messages',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const chatId = parseInt(req.params.id!, 10);
      if (isNaN(chatId)) {
        res.status(400).json({ message: 'Invalid chat ID' });
        return;
      }

      const db = getDatabase();

      const messages = await db('messages')
        .where('chat_id', chatId)
        .orderBy('created_at', 'asc')
        .limit(50);

      const formatted = messages.map((m: any) => ({
        id: String(m.id),
        chatId: String(m.chat_id),
        senderId: String(m.sender_id),
        content: m.content_encrypted || '',
        type: m.type || 'text',
        mediaUrl: m.media_url || null,
        createdAt: m.created_at,
        readBy: [],
      }));

      res.status(200).json({ data: formatted });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /chats/:id/messages
 * Send a message in a chat.
 */
router.post(
  '/:id/messages',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const chatId = parseInt(req.params.id!, 10);
      if (isNaN(chatId)) {
        res.status(400).json({ message: 'Invalid chat ID' });
        return;
      }

      const userId = req.user!.userId;
      const { content, type } = req.body;

      const db = getDatabase();

      const [messageId] = await db('messages').insert({
        chat_id: chatId,
        sender_id: userId,
        content_encrypted: content || '',
        type: type || 'text',
      });

      // Update chat's updated_at
      await db('chats').where('id', chatId).update({ updated_at: db.fn.now() });

      const message = await db('messages').where('id', messageId).first();

      res.status(201).json({
        id: String(message.id),
        chatId: String(message.chat_id),
        senderId: String(message.sender_id),
        content: message.content_encrypted || '',
        type: message.type || 'text',
        mediaUrl: message.media_url || null,
        createdAt: message.created_at,
        readBy: [String(userId)],
      });
    } catch (err) {
      next(err);
    }
  },
);

export { router as chatRoutes };
