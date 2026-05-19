import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('story_views', (table) => {
    table.increments('id').primary();
    table.integer('story_id').unsigned().notNullable();
    table.integer('viewer_id').unsigned().notNullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());

    table.foreign('story_id').references('id').inTable('stories').onDelete('CASCADE');
    table.foreign('viewer_id').references('id').inTable('users').onDelete('CASCADE');

    table.unique(['story_id', 'viewer_id'], { indexName: 'idx_story_views_unique' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('story_views');
}
