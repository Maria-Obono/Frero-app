"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('chat_participants', (table) => {
        table.increments('id').primary();
        table.integer('chat_id').unsigned().notNullable();
        table.integer('user_id').unsigned().notNullable();
        table.enum('role', ['member', 'admin']).notNullable().defaultTo('member');
        table.datetime('joined_at').notNullable().defaultTo(knex.fn.now());
        table.foreign('chat_id').references('id').inTable('chats').onDelete('CASCADE');
        table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.unique(['chat_id', 'user_id'], { indexName: 'idx_chat_participants_chat_user' });
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('chat_participants');
}
//# sourceMappingURL=20240101000016_create_chat_participants_table.js.map