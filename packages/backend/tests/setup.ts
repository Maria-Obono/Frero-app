/**
 * Jest global setup file.
 * Configures test environment variables and global test utilities.
 */

// Set test environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing-only';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.BCRYPT_ROUNDS = '4'; // Lower rounds for faster tests
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'frero_test';
process.env.CORS_ORIGINS = 'http://localhost:3000,http://localhost:5173';
process.env.AWS_S3_BUCKET = 'frero-test-bucket';
process.env.AWS_REGION = 'us-east-1';

// Increase timeout for property-based tests
jest.setTimeout(30000);
