"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
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
async function down(knex) {
    await knex.schema.dropTableIfExists('notifications');
}
//# sourceMappingURL=20240101000019_create_notifications_table.js.map