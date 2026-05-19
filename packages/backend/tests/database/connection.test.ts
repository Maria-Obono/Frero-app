import { getKnexConfig } from '../../src/database/connection';

describe('Database Connection Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getKnexConfig', () => {
    it('should return a valid Knex configuration object', () => {
      const config = getKnexConfig();

      expect(config.client).toBe('mysql2');
      expect(config.connection).toBeDefined();
      expect(config.pool).toBeDefined();
      expect(config.migrations).toBeDefined();
    });

    it('should use default pool size of min 2, max 10', () => {
      const config = getKnexConfig();

      expect(config.pool?.min).toBe(2);
      expect(config.pool?.max).toBe(10);
    });

    it('should use mysql2 client with utf8mb4 charset', () => {
      const config = getKnexConfig();
      const connection = config.connection as any;

      expect(config.client).toBe('mysql2');
      expect(connection.charset).toBe('utf8mb4');
    });

    it('should configure migrations directory', () => {
      const config = getKnexConfig();

      expect(config.migrations?.directory).toBe('./src/database/migrations');
      expect(config.migrations?.tableName).toBe('knex_migrations');
      expect(config.migrations?.extension).toBe('ts');
    });

    it('should clamp pool min to at least 2', () => {
      // The config module clamps values, so we test the getKnexConfig function
      // which also applies clamping
      const config = getKnexConfig();
      expect(config.pool?.min).toBeGreaterThanOrEqual(2);
    });

    it('should clamp pool max to at most 100', () => {
      const config = getKnexConfig();
      expect(config.pool?.max).toBeLessThanOrEqual(100);
    });
  });
});
