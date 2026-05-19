import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('hashtags', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable();
    table.integer('post_count').notNullable().defaultTo(0);
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());

    table.unique('name', { indexName: 'idx_hashtags_name' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('hashtags');
}
