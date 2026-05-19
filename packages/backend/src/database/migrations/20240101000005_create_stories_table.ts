import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('stories', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('media_url', 500).notNullable();
    table.enum('media_type', ['image', 'video']).notNullable();
    table.datetime('expires_at').notNullable();
    table.datetime('deleted_at').nullable();
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');

    table.index(['user_id', 'expires_at'], 'idx_stories_user_expires');
    table.index('deleted_at', 'idx_stories_deleted_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('stories');
}
