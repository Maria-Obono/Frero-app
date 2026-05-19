import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Capture the original end method to log after response is sent
  const originalEnd = res.end;

  res.end = function (this: Response, ...args: Parameters<Response['end']>): Response {
    const responseTime = Date.now() - startTime;
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
      requestId: (req as Request & { requestId?: string }).requestId || 'unknown',
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    };

    if (res.statusCode >= 500) {
      logger.error('Request completed with server error', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Request completed with client error', logData);
    } else {
      logger.info('Request completed', logData);
    }

    return originalEnd.apply(this, args);
  } as Response['end'];

  next();
}
