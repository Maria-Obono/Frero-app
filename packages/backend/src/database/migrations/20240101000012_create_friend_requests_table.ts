import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('friend_requests', (table) => {
    table.increments('id').primary();
    table.integer('sender_id').unsigned().notNullable();
    table.integer('recipient_id').unsigned().notNullable();
    table.enum('status', ['pending', 'accepted', 'declined']).notNullable().defaultTo('pending');
    table.timestamps(true, true);

    table.foreign('sender_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('recipient_id').references('id').inTable('users').onDelete('CASCADE');

    table.index(['sender_id', 'status'], 'idx_friend_requests_sender_status');
    table.index(['recipient_id', 'status'], 'idx_friend_requests_recipient_status');
    table.unique(['sender_id', 'recipient_id'], { indexName: 'idx_friend_requests_pair' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('friend_requests');
}
