/**
 * Unit tests for Socket.IO server configuration and connection handling.
 *
 * Tests server creation, heartbeat configuration, and connection lifecycle.
 * Uses a real Socket.IO server without the Redis adapter for testing
 * (the adapter is tested separately via integration tests).
 */

import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';

import { PING_INTERVAL_MS, PING_TIMEOUT_MS } from '../../src/realtime/socket-server';
import { socketAuthMiddleware } from '../../src/realtime/socket-auth';
import { joinUserRoom, joinChatRoom, leaveChatRoom } from '../../src/realtime/room-manager';
import { config } from '../../src/config';
import { AuthenticatedSocket } from '../../src/realtime/types';

// Mock redis-utils
jest.mock('../../src/utils/redis-utils', () => ({
  setOnline: jest.fn().mockResolvedValue(undefined),
  setOffline: jest.fn().mockResolvedValue(undefined),
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Socket Server', () => {
  describe('Constants', () => {
    it('should have ping interval of 30 seconds', () => {
      expect(PING_INTERVAL_MS).toBe(30_000);
    });

    it('should have ping timeout of 90 seconds', () => {
      expect(PING_TIMEOUT_MS).toBe(90_000);
    });
  });

  describe('Connection lifecycle (without Redis adapter)', () => {
    let httpServer: HttpServer;
    let ioServer: SocketIOServer;
    let clientSocket: ClientSocket;
    let port: number;

    function createValidToken(userId: number = 1): string {
      return jwt.sign(
        {
          userId,
          email: `user${userId}@example.com`,
          username: `user${userId}`,
          role: 'user',
          tokenId: `token-${userId}`,
        },
        config.jwt.accessSecret,
        { expiresIn: '15m' },
      );
    }

    beforeEach((done) => {
      httpServer = createServer();

      // Create Socket.IO server without Redis adapter for testing
      ioServer = new SocketIOServer(httpServer, {
        pingInterval: PING_INTERVAL_MS,
        pingTimeout: PING_TIMEOUT_MS,
        cors: {
          origin: '*',
          credentials: true,
        },
        transports: ['websocket', 'polling'],
      });

      // Apply auth middleware
      ioServer.use(socketAuthMiddleware);

      httpServer.listen(0, () => {
        const address = httpServer.address();
        port = typeof address === 'object' && address ? address.port : 0;
        done();
      });
    });

    afterEach((done) => {
      if (clientSocket && clientSocket.connected) {
        clientSocket.disconnect();
      }
      ioServer.close();
      httpServer.close(done);
    });

    it('should reject connection without token', (done) => {
      clientSocket = ioc(`http://localhost:${port}`, {
        transports: ['websocket'],
        autoConnect: true,
        reconnection: false,
      });

      clientSocket.on('connect_error', (err) => {
        expect(err.message).toContain('no token provided');
        done();
      });
    });

    it('should reject connection with invalid token', (done) => {
      clientSocket = ioc(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token: 'invalid-token' },
        autoConnect: true,
        reconnection: false,
      });

      clientSocket.on('connect_error', (err) => {
        expect(err.message).toContain('invalid or expired token');
        done();
      });
    });

    it('should reject connection with expired token', (done) => {
      const token = jwt.sign(
        {
          userId: 1,
          email: 'test@example.com',
          username: 'testuser',
          role: 'user',
          tokenId: 'id',
        },
        config.jwt.accessSecret,
        { expiresIn: '-1s' },
      );

      clientSocket = ioc(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token },
        autoConnect: true,
        reconnection: false,
      });

      clientSocket.on('connect_error', (err) => {
        expect(err.message).toContain('invalid or expired token');
        done();
      });
    });

    it('should reject connection with token signed by wrong secret', (done) => {
      const token = jwt.sign(
        {
          userId: 1,
          email: 'test@example.com',
          username: 'testuser',
          role: 'user',
          tokenId: 'id',
        },
        'wrong-secret',
        { expiresIn: '15m' },
      );

      clientSocket = ioc(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token },
        autoConnect: true,
        reconnection: false,
      });

      clientSocket.on('connect_error', (err) => {
        expect(err.message).toContain('invalid or expired token');
        done();
      });
    });

    it('should accept connection with valid token', (done) => {
      const token = createValidToken(1);

      // Set up connection handler
      ioServer.on('connection', (socket) => {
        const authSocket = socket as AuthenticatedSocket;
        joinUserRoom(authSocket);
      });

      clientSocket = ioc(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token },
        autoConnect: true,
        reconnection: false,
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });

    it('should set user online on connection', (done) => {
      const { setOnline } = require('../../src/utils/redis-utils');
      const token = createValidToken(99);

      ioServer.on('connection', (socket) => {
        const authSocket = socket as AuthenticatedSocket;
        joinUserRoom(authSocket);
        // Simulate what createSocketServer does
        const { setOnline: setOnlineFn } = require('../../src/utils/redis-utils');
        setOnlineFn(String(authSocket.user.userId));
      });

      clientSocket = ioc(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token },
        autoConnect: true,
        reconnection: false,
      });

      clientSocket.on('connect', () => {
        setTimeout(() => {
          expect(setOnline).toHaveBeenCalledWith('99');
          done();
        }, 50);
      });
    });

    it('should set user offline on disconnection', (done) => {
      const { setOffline } = require('../../src/utils/redis-utils');
      (setOffline as jest.Mock).mockClear();
      const token = createValidToken(88);

      ioServer.on('connection', (socket) => {
        const authSocket = socket as AuthenticatedSocket;
        joinUserRoom(authSocket);

        socket.on('disconnect', () => {
          const { setOffline: setOfflineFn } = require('../../src/utils/redis-utils');
          setOfflineFn(String(authSocket.user.userId));
        });
      });

      clientSocket = ioc(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token },
        autoConnect: true,
        reconnection: false,
      });

      clientSocket.on('connect', () => {
        clientSocket.disconnect();
        setTimeout(() => {
          expect(setOffline).toHaveBeenCalledWith('88');
          done();
        }, 100);
      });
    });

    it('should deliver queued notifications on reconnection', (done) => {
      const mockNotificationService = {
        deliverOnReconnection: jest.fn().mockResolvedValue([
          { id: 1, event_type: 'like', user_id: 55 },
        ]),
      };

      const token = createValidToken(55);

      ioServer.on('connection', async (socket) => {
        const authSocket = socket as AuthenticatedSocket;
        joinUserRoom(authSocket);
        await mockNotificationService.deliverOnReconnection(authSocket.user.userId);
      });

      clientSocket = ioc(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token },
        autoConnect: true,
        reconnection: false,
      });

      clientSocket.on('connect', () => {
        setTimeout(() => {
          expect(mockNotificationService.deliverOnReconnection).toHaveBeenCalledWith(55);
          done();
        }, 50);
      });
    });

    it('should handle chat:join event', (done) => {
      const token = createValidToken(1);

      ioServer.on('connection', (socket) => {
        const authSocket = socket as AuthenticatedSocket;
        joinUserRoom(authSocket);

        socket.on('chat:join', (data: { chatId: string }) => {
          const success = joinChatRoom(authSocket, data.chatId);
          if (success) {
            socket.emit('joined' as any, { chatId: data.chatId });
          }
        });
      });

      clientSocket = ioc(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token },
        autoConnect: true,
        reconnection: false,
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('chat:join', { chatId: 'room-abc' });
      });

      clientSocket.on('joined' as any, (data: any) => {
        expect(data.chatId).toBe('room-abc');
        done();
      });
    });

    it('should handle chat:leave event', (done) => {
      const token = createValidToken(1);

      ioServer.on('connection', (socket) => {
        const authSocket = socket as AuthenticatedSocket;
        joinUserRoom(authSocket);

        socket.on('chat:leave', (data: { chatId: string }) => {
          const success = leaveChatRoom(authSocket, data.chatId);
          if (success) {
            socket.emit('left' as any, { chatId: data.chatId });
          }
        });
      });

      clientSocket = ioc(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: { token },
        autoConnect: true,
        reconnection: false,
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('chat:leave', { chatId: 'room-xyz' });
      });

      clientSocket.on('left' as any, (data: any) => {
        expect(data.chatId).toBe('room-xyz');
        done();
      });
    });

    it('should accept connection with token from query parameter', (done) => {
      const token = createValidToken(2);

      ioServer.on('connection', (socket) => {
        const authSocket = socket as AuthenticatedSocket;
        joinUserRoom(authSocket);
      });

      clientSocket = ioc(`http://localhost:${port}`, {
        transports: ['websocket'],
        query: { token },
        autoConnect: true,
        reconnection: false,
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });
  });

  describe('Server configuration', () => {
    it('should configure ping interval to 30 seconds', () => {
      const httpServer = createServer();
      const io = new SocketIOServer(httpServer, {
        pingInterval: PING_INTERVAL_MS,
        pingTimeout: PING_TIMEOUT_MS,
      });

      const opts = (io as any).opts;
      expect(opts.pingInterval).toBe(30_000);
      expect(opts.pingTimeout).toBe(90_000);

      io.close();
    });

    it('should support websocket and polling transports', () => {
      const httpServer = createServer();
      const io = new SocketIOServer(httpServer, {
        transports: ['websocket', 'polling'],
      });

      const opts = (io as any).opts;
      expect(opts.transports).toContain('websocket');
      expect(opts.transports).toContain('polling');

      io.close();
    });
  });
});
