import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('likes', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.integer('likeable_id').unsigned().notNullable();
    table.enum('likeable_type', ['post', 'reel', 'comment']).notNullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');

    table.unique(['user_id', 'likeable_id', 'likeable_type'], { indexName: 'idx_likes_user_likeable' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('likes');
}
