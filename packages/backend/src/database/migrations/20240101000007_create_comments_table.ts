import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('comments', (table) => {
    table.increments('id').primary();
    table.integer('post_id').unsigned().notNullable();
    table.integer('user_id').unsigned().notNullable();
    table.integer('parent_comment_id').unsigned().nullable();
    table.text('content').notNullable();
    table.integer('depth').notNullable().defaultTo(0);
    table.datetime('deleted_at').nullable();
    table.timestamps(true, true);

    table.foreign('post_id').references('id').inTable('posts').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('parent_comment_id').references('id').inTable('comments').onDelete('CASCADE');

    table.index(['post_id', 'created_at'], 'idx_comments_post');
    table.index('parent_comment_id', 'idx_comments_parent');
    table.index('deleted_at', 'idx_comments_deleted_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('comments');
}
