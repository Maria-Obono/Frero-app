import knex from 'knex';

const db = knex({
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
  },
  pool: {
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    afterCreate(conn: any, done: (err: Error | null, conn: any) => void) {
      conn.query('SET NAMES utf8mb4;', (err: Error | null) => {
        done(err, conn);
      });
    },
  },
  migrations: {
    directory: './dist/database/migrations',
    tableName: 'knex_migrations',
    loadExtensions: ['.js'],
  },
});

/**
 * Fix migration tracking table when switching from .ts to .js extensions.
 * This happens when migrations were previously run with ts-node (dev) but
 * now run from compiled JS (Docker production build).
 */
async function fixMigrationExtensions() {
  const hasTable = await db.schema.hasTable('knex_migrations');
  if (!hasTable) return;

  const rows = await db('knex_migrations').select('id', 'name');
  const tsRows = rows.filter((r: { name: string }) => r.name.endsWith('.ts'));

  if (tsRows.length > 0) {
    console.log(`[migrate-and-start] Fixing ${tsRows.length} migration record(s) with .ts extension...`);
    for (const row of tsRows) {
      const fixedName = (row as { name: string }).name.replace(/\.ts$/, '.js');
      await db('knex_migrations').where('id', (row as { id: number }).id).update({ name: fixedName });
    }
  }
}

async function run() {
  console.log('[migrate-and-start] Running pending migrations...');
  try {
    await fixMigrationExtensions();
    const [batch, migrations] = await db.migrate.latest();
    if (migrations.length === 0) {
      console.log('[migrate-and-start] Database already up to date.');
    } else {
      console.log(
        `[migrate-and-start] Ran ${migrations.length} migration(s) in batch ${batch}:`,
      );
      migrations.forEach((m: string) => console.log(`  - ${m}`));
    }
  } catch (error) {
    console.error('[migrate-and-start] Migration failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }

  console.log('[migrate-and-start] Starting server...');
  await import('./index.js');
}

run();
