import request from 'supertest';
import { app } from '../../src/app';

// Mock health checks so they don't try to connect to real MySQL/Redis
jest.mock('../../src/utils/healthChecks', () => ({
  checkMySQLHealth: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 1 }),
  checkRedisHealth: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 1 }),
}));

describe('Express App - Middleware Integration', () => {
  describe('Security Headers (Helmet)', () => {
    it('should include security headers in responses', async () => {
      const res = await request(app).get('/health');

      // Helmet sets various security headers
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('should not expose X-Powered-By header', async () => {
      const res = await request(app).get('/health');

      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('CORS', () => {
    it('should include CORS headers for allowed origins', async () => {
      const res = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:5173');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('should handle preflight OPTIONS requests', async () => {
      const res = await request(app)
        .options('/health')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.status).toBe(204);
    });
  });

  describe('Request ID', () => {
    it('should generate X-Request-Id header in response', async () => {
      const res = await request(app).get('/health');

      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should echo back provided X-Request-Id', async () => {
      const res = await request(app)
        .get('/health')
        .set('X-Request-Id', 'my-custom-id');

      expect(res.headers['x-request-id']).toBe('my-custom-id');
    });
  });

  describe('Health Check', () => {
    it('should return 200 with status ok when services are healthy', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unmatched routes', async () => {
      const res = await request(app).get('/api/v1/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.status).toBe(404);
      expect(res.body.error).toBe('Not Found');
      expect(res.body.requestId).toBeDefined();
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format with requestId', async () => {
      const res = await request(app).get('/api/v1/nonexistent');

      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('requestId');
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const res = await request(app).get('/health');

      expect(res.headers['x-ratelimit-limit']).toBeDefined();
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
      expect(res.headers['x-ratelimit-reset']).toBeDefined();
    });
  });
});
