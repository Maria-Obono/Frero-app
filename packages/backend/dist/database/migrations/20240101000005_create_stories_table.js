"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('stories', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable();
        table.string('media_url', 500).notNullable();
        table.enum('media_type', ['image', 'video']).notNullable();
        table.datetime('expires_at').notNullable();
        table.datetime('deleted_at').nullable();
        table.timestamps(true, true);
        table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.index(['user_id', 'expires_at'], 'idx_stories_user_expires');
        table.index('deleted_at', 'idx_stories_deleted_at');
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('stories');
}
//# sourceMappingURL=20240101000005_create_stories_table.js.map