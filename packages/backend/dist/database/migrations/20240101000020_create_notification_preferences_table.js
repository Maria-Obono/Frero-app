"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('notification_preferences', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable();
        table.enum('event_type', ['like', 'comment', 'message', 'follow', 'mention', 'friend_request']).notNullable();
        table.boolean('in_app_enabled').notNullable().defaultTo(true);
        table.boolean('push_enabled').notNullable().defaultTo(true);
        table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());
        table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.unique(['user_id', 'event_type'], { indexName: 'idx_notif_prefs_user_event' });
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('notification_preferences');
}
//# sourceMappingURL=20240101000020_create_notification_preferences_table.js.map