"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
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
async function down(knex) {
    await knex.schema.dropTableIfExists('message_read_receipts');
}
//# sourceMappingURL=20240101000018_create_message_read_receipts_table.js.map