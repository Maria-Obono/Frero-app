import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.string('password_reset_token', 255).nullable();
    table.datetime('password_reset_expires').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('password_reset_token');
    table.dropColumn('password_reset_expires');
  });
}
