import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('notifications', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.integer('source_user_id').unsigned().nullable();
    table.enum('event_type', ['like', 'comment', 'message', 'follow', 'mention', 'friend_request']).notNullable();
    table.integer('reference_id').unsigned().nullable();
    table.enum('reference_type', ['post', 'reel', 'comment', 'story', 'chat', 'user']).nullable();
    table.boolean('is_read').notNullable().defaultTo(false);
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('source_user_id').references('id').inTable('users').onDelete('SET NULL');

    table.index(['user_id', 'is_read', 'created_at'], 'idx_notif_user_read');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('notifications');
}
