import knex, { Knex } from 'knex';
import { config } from '../config';

let db: Knex;

export function getKnexConfig(): Knex.Config {
  const poolMin = Math.max(2, Math.min(100, config.db.poolMin));
  const poolMax = Math.max(2, Math.min(100, config.db.poolMax));

  return {
    client: 'mysql2',
    connection: {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      charset: 'utf8mb4',
    },
    pool: {
      min: poolMin,
      max: poolMax,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
      afterCreate(conn: any, done: (err: Error | null, conn: any) => void) {
        conn.query('SET NAMES utf8mb4;', (err: Error | null) => {
          done(err, conn);
        });
      },
    },
    migrations: {
      directory: './src/database/migrations',
      tableName: 'knex_migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './src/database/seeds',
      extension: 'ts',
    },
  };
}

export function getDatabase(): Knex {
  if (!db) {
    db = knex(getKnexConfig());
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy();
  }
}
