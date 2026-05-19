import request from 'supertest';
import { app } from '../src/app';

// Mock the health check utilities
jest.mock('../src/utils/healthChecks', () => ({
  checkMySQLHealth: jest.fn(),
  checkRedisHealth: jest.fn(),
}));

import { checkMySQLHealth, checkRedisHealth } from '../src/utils/healthChecks';

const mockCheckMySQL = checkMySQLHealth as jest.MockedFunction<typeof checkMySQLHealth>;
const mockCheckRedis = checkRedisHealth as jest.MockedFunction<typeof checkRedisHealth>;

describe('GET /health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200 with status ok when both services are healthy', async () => {
    mockCheckMySQL.mockResolvedValue({ status: 'up', latencyMs: 5 });
    mockCheckRedis.mockResolvedValue({ status: 'up', latencyMs: 2 });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.services.mysql.status).toBe('up');
    expect(response.body.services.redis.status).toBe('up');
  });

  it('should return 503 with status degraded when MySQL is down', async () => {
    mockCheckMySQL.mockResolvedValue({ status: 'down', latencyMs: 5000, error: 'Connection refused' });
    mockCheckRedis.mockResolvedValue({ status: 'up', latencyMs: 2 });

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.services.mysql.status).toBe('down');
    expect(response.body.services.mysql.error).toBe('Connection refused');
    expect(response.body.services.redis.status).toBe('up');
  });

  it('should return 503 with status degraded when Redis is down', async () => {
    mockCheckMySQL.mockResolvedValue({ status: 'up', latencyMs: 5 });
    mockCheckRedis.mockResolvedValue({ status: 'down', latencyMs: 5000, error: 'Connection refused' });

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.services.mysql.status).toBe('up');
    expect(response.body.services.redis.status).toBe('down');
    expect(response.body.services.redis.error).toBe('Connection refused');
  });

  it('should return 503 with status degraded when both services are down', async () => {
    mockCheckMySQL.mockResolvedValue({ status: 'down', latencyMs: 5000, error: 'MySQL error' });
    mockCheckRedis.mockResolvedValue({ status: 'down', latencyMs: 5000, error: 'Redis error' });

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.services.mysql.status).toBe('down');
    expect(response.body.services.redis.status).toBe('down');
  });

  it('should include latency information for healthy services', async () => {
    mockCheckMySQL.mockResolvedValue({ status: 'up', latencyMs: 12 });
    mockCheckRedis.mockResolvedValue({ status: 'up', latencyMs: 3 });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.services.mysql.latencyMs).toBe(12);
    expect(response.body.services.redis.latencyMs).toBe(3);
  });
});
