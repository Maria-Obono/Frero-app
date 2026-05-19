import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('follows', (table) => {
    table.increments('id').primary();
    table.integer('follower_id').unsigned().notNullable();
    table.integer('followed_id').unsigned().notNullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());

    table.foreign('follower_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('followed_id').references('id').inTable('users').onDelete('CASCADE');

    table.index('follower_id', 'idx_follows_follower');
    table.index('followed_id', 'idx_follows_followed');
    table.unique(['follower_id', 'followed_id'], { indexName: 'idx_follows_pair' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('follows');
}
