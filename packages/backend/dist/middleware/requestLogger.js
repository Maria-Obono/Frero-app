"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = requestLogger;
const logger_1 = require("../utils/logger");
function requestLogger(req, res, next) {
    const startTime = Date.now();
    // Capture the original end method to log after response is sent
    const originalEnd = res.end;
    res.end = function (...args) {
        const responseTime = Date.now() - startTime;
        const logData = {
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.originalUrl || req.url,
            status: res.statusCode,
            responseTime: `${responseTime}ms`,
            requestId: req.requestId || 'unknown',
            ip: req.ip || req.socket.remoteAddress,
            userAgent: req.get('user-agent'),
        };
        if (res.statusCode >= 500) {
            logger_1.logger.error('Request completed with server error', logData);
        }
        else if (res.statusCode >= 400) {
            logger_1.logger.warn('Request completed with client error', logData);
        }
        else {
            logger_1.logger.info('Request completed', logData);
        }
        return originalEnd.apply(this, args);
    };
    next();
}
//# sourceMappingURL=requestLogger.js.map