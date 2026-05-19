import { createConnection } from 'mysql2/promise';
import Redis from 'ioredis';
import { config } from '../config';

export interface ServiceHealth {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

export async function checkMySQLHealth(): Promise<ServiceHealth> {
  const start = Date.now();
  let connection;

  try {
    connection = await createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      connectTimeout: 5000,
    });

    await connection.ping();
    const latencyMs = Date.now() - start;

    return { status: 'up', latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { status: 'down', latencyMs, error };
  } finally {
    if (connection) {
      await connection.end().catch(() => {});
    }
  }
}

export async function checkRedisHealth(): Promise<ServiceHealth> {
  const start = Date.now();
  let client: Redis | null = null;

  try {
    client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      connectTimeout: 5000,
      lazyConnect: true,
    });

    await client.connect();
    const pong = await client.ping();

    if (pong !== 'PONG') {
      throw new Error(`Unexpected ping response: ${pong}`);
    }

    const latencyMs = Date.now() - start;
    return { status: 'up', latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { status: 'down', latencyMs, error };
  } finally {
    if (client) {
      await client.quit().catch(() => {});
    }
  }
}
