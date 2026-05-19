"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const config_1 = require("./config");
const middleware_1 = require("./middleware");
const healthChecks_1 = require("./utils/healthChecks");
const app = (0, express_1.default)();
exports.app = app;
// Security headers
app.use((0, helmet_1.default)());
// CORS configuration - only allow origins from environment config
app.use((0, cors_1.default)({
    origin: config_1.config.cors.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
}));
// Request ID generation (must be before logging)
app.use(middleware_1.requestIdMiddleware);
// Request logging
app.use(middleware_1.requestLogger);
// Body parsing
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Rate limiting
app.use(middleware_1.rateLimiter);
// Health check endpoint verifying MySQL and Redis connectivity
app.get('/health', async (_req, res) => {
    const timestamp = new Date().toISOString();
    const [mysqlHealth, redisHealth] = await Promise.all([
        (0, healthChecks_1.checkMySQLHealth)(),
        (0, healthChecks_1.checkRedisHealth)(),
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
// API routes will be mounted here
// app.use('/api/v1', apiRouter);
// 404 handler for unmatched routes
app.use(middleware_1.notFoundHandler);
// Global error handler (must be last)
app.use(middleware_1.errorHandler);
//# sourceMappingURL=app.js.map