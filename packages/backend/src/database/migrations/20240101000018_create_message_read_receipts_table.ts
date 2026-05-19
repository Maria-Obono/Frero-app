import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('message_read_receipts', (table) => {
    table.increments('id').primary();
    table.integer('message_id').unsigned().notNullable();
    table.integer('user_id').unsigned().notNullable();
    table.datetime('read_at').notNullable().defaultTo(knex.fn.now());

    table.foreign('message_id').references('id').inTable('messages').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');

    table.unique(['message_id', 'user_id'], { indexName: 'idx_read_receipts_message_user' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('message_read_receipts');
}
