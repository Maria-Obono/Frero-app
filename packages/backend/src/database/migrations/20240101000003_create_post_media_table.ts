import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('post_media', (table) => {
    table.increments('id').primary();
    table.integer('post_id').unsigned().notNullable();
    table.string('url', 500).notNullable();
    table.enum('type', ['image', 'video']).notNullable();
    table.integer('order_index').notNullable().defaultTo(0);
    table.integer('width').nullable();
    table.integer('height').nullable();
    table.integer('duration_seconds').nullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());

    table.foreign('post_id').references('id').inTable('posts').onDelete('CASCADE');

    table.index('post_id', 'idx_post_media_post_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('post_media');
}
