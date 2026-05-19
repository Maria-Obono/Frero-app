"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAppError = createAppError;
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
const logger_1 = require("../utils/logger");
function createAppError(message, statusCode, details) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.isOperational = true;
    error.details = details;
    return error;
}
function errorHandler(err, req, res, _next) {
    const statusCode = err.statusCode || 500;
    const requestId = req.requestId || 'unknown';
    const errorResponse = {
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
        logger_1.logger.error('Unhandled error', {
            requestId,
            error: err.message,
            stack: err.stack,
            path: req.originalUrl || req.url,
            method: req.method,
        });
    }
    else {
        logger_1.logger.warn('Client error', {
            requestId,
            error: err.message,
            path: req.originalUrl || req.url,
            method: req.method,
        });
    }
    res.status(statusCode).json(errorResponse);
}
function notFoundHandler(req, _res, next) {
    const error = createAppError(`Route not found: ${req.method} ${req.originalUrl || req.url}`, 404);
    next(error);
}
function getErrorName(statusCode) {
    const errorNames = {
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
//# sourceMappingURL=errorHandler.js.map