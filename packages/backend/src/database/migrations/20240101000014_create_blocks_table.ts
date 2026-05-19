import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('blocks', (table) => {
    table.increments('id').primary();
    table.integer('blocker_id').unsigned().notNullable();
    table.integer('blocked_id').unsigned().notNullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());

    table.foreign('blocker_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('blocked_id').references('id').inTable('users').onDelete('CASCADE');

    table.unique(['blocker_id', 'blocked_id'], { indexName: 'idx_blocks_pair' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('blocks');
}
