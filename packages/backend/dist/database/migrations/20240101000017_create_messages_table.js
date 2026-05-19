"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('messages', (table) => {
        table.increments('id').primary();
        table.integer('chat_id').unsigned().notNullable();
        table.integer('sender_id').unsigned().notNullable();
        table.text('content_encrypted').nullable();
        table.enum('type', ['text', 'image', 'video', 'audio', 'document']).notNullable().defaultTo('text');
        table.string('media_url', 500).nullable();
        table.datetime('deleted_at').nullable();
        table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
        table.foreign('chat_id').references('id').inTable('chats').onDelete('CASCADE');
        table.foreign('sender_id').references('id').inTable('users').onDelete('CASCADE');
        table.index(['chat_id', 'created_at'], 'idx_messages_chat_created');
        table.index('deleted_at', 'idx_messages_deleted_at');
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('messages');
}
//# sourceMappingURL=20240101000017_create_messages_table.js.map