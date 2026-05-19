"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('reels', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable();
        table.string('video_url', 500).notNullable();
        table.string('thumbnail_url', 500).nullable();
        table.integer('duration_seconds').notNullable();
        table.text('caption').nullable();
        table.integer('like_count').notNullable().defaultTo(0);
        table.integer('comment_count').notNullable().defaultTo(0);
        table.integer('share_count').notNullable().defaultTo(0);
        table.datetime('deleted_at').nullable();
        table.timestamps(true, true);
        table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.index(['user_id', 'created_at'], 'idx_reels_user_created');
        table.index('deleted_at', 'idx_reels_deleted_at');
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('reels');
}
//# sourceMappingURL=20240101000004_create_reels_table.js.map