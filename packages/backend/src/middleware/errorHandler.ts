import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  details?: Record<string, unknown>;
}

export interface ErrorResponse {
  status: number;
  error: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
}

export function createAppError(
  message: string,
  statusCode: number,
  details?: Record<string, unknown>,
): AppError {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  error.details = details;
  return error;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode || 500;
  const requestId = (req as Request & { requestId?: string }).requestId || 'unknown';

  const errorResponse: ErrorResponse = {
    status: statusCode,
    error: getErrorName(statusCode),
    message: statusCode >= 500 ? 'Internal Server Error' : err.message,
    requestId,
  };

  if (err.details && statusCode < 500) {
    errorResponse.details = err.details;
  }

  // Log the error
  if (statusCode >= 500) {
    logger.error('Unhandled error', {
      requestId,
      error: err.message,
      stack: err.stack,
      path: req.originalUrl || req.url,
      method: req.method,
    });
  } else {
    logger.warn('Client error', {
      requestId,
      error: err.message,
      path: req.originalUrl || req.url,
      method: req.method,
    });
  }

  res.status(statusCode).json(errorResponse);
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  const error = createAppError(
    `Route not found: ${req.method} ${req.originalUrl || req.url}`,
    404,
  );
  next(error);
}

function getErrorName(statusCode: number): string {
  const errorNames: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  return errorNames[statusCode] || 'Error';
}
