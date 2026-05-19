import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import {
  requestIdMiddleware,
  requestLogger,
  rateLimiter,
  errorHandler,
  notFoundHandler,
} from './middleware';
import { checkMySQLHealth, checkRedisHealth } from './utils/healthChecks';
import { apiRouter } from './routes';

const app = express();

// Security headers (configured to allow image loading)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', '*'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
        fontSrc: ["'self'", 'https:', 'data:'],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
  }),
);

// CORS configuration - only allow origins from environment config
app.use(
  cors({
    origin: config.cors.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  }),
);

// Request ID generation (must be before logging)
app.use(requestIdMiddleware);

// Request logging
app.use(requestLogger);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(rateLimiter);

// Serve uploaded files (avatars, covers, etc.)
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// Health check endpoint verifying MySQL and Redis connectivity
app.get('/health', async (_req, res) => {
  const timestamp = new Date().toISOString();

  const [mysqlHealth, redisHealth] = await Promise.all([
    checkMySQLHealth(),
    checkRedisHealth(),
  ]);

  const isHealthy = mysqlHealth.status === 'up' && redisHealth.status === 'up';

  const response = {
    status: isHealthy ? 'ok' : 'degraded',
    timestamp,
    services: {
      mysql: mysqlHealth,
      redis: redisHealth,
    },
  };

  res.status(isHealthy ? 200 : 503).json(response);
});

// API routes
app.use('/api/v1', apiRouter);

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

export { app };
