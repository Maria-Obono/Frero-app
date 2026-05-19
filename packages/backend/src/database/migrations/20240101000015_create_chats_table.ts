import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('chats', (table) => {
    table.increments('id').primary();
    table.enum('type', ['private', 'group']).notNullable();
    table.string('name', 100).nullable();
    table.integer('created_by').unsigned().notNullable();
    table.integer('participant_count').notNullable().defaultTo(0);
    table.timestamps(true, true);

    table.foreign('created_by').references('id').inTable('users').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('chats');
}
