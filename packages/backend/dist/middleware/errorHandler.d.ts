import { Request, Response, NextFunction } from 'express';
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
export declare function createAppError(message: string, statusCode: number, details?: Record<string, unknown>): AppError;
export declare function errorHandler(err: AppError, req: Request, res: Response, _next: NextFunction): void;
export declare function notFoundHandler(req: Request, _res: Response, next: NextFunction): void;
//# sourceMappingURL=errorHandler.d.ts.map