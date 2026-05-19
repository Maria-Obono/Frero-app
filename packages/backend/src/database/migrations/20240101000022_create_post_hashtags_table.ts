import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('post_hashtags', (table) => {
    table.increments('id').primary();
    table.integer('post_id').unsigned().notNullable();
    table.integer('hashtag_id').unsigned().notNullable();

    table.foreign('post_id').references('id').inTable('posts').onDelete('CASCADE');
    table.foreign('hashtag_id').references('id').inTable('hashtags').onDelete('CASCADE');

    table.index(['hashtag_id', 'post_id'], 'idx_post_hashtags_hashtag');
    table.unique(['post_id', 'hashtag_id'], { indexName: 'idx_post_hashtags_unique' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('post_hashtags');
}
