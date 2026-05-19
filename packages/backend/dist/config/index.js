"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.config = {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    // Database
    db: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        name: process.env.DB_NAME || 'frero',
        poolMin: Math.max(2, Math.min(100, parseInt(process.env.DB_POOL_MIN || '2', 10))),
        poolMax: Math.max(2, Math.min(100, parseInt(process.env.DB_POOL_MAX || '10', 10))),
    },
    // Redis
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0', 10),
    },
    // JWT
    jwt: {
        accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
        accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
    // AWS S3
    aws: {
        region: process.env.AWS_REGION || 'us-east-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        s3Bucket: process.env.AWS_S3_BUCKET || 'frero-media',
        cloudfrontUrl: process.env.AWS_CLOUDFRONT_URL || '',
    },
    // CORS
    cors: {
        origins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
    },
    // Rate Limiting
    rateLimit: {
        authenticatedMaxRequests: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '100', 10),
        unauthenticatedMaxRequests: parseInt(process.env.RATE_LIMIT_UNAUTH_MAX || '20', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    },
    // Bcrypt
    bcrypt: {
        saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
    },
};
//# sourceMappingURL=index.js.map