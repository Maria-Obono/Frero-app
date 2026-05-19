"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('posts', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable();
        table.enum('type', ['text', 'photo', 'video', 'carousel']).notNullable();
        table.text('content').nullable();
        table.enum('privacy', ['public', 'friends', 'private']).notNullable().defaultTo('public');
        table.integer('like_count').notNullable().defaultTo(0);
        table.integer('comment_count').notNullable().defaultTo(0);
        table.integer('share_count').notNullable().defaultTo(0);
        table.datetime('deleted_at').nullable();
        table.timestamps(true, true);
        table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.index(['user_id', 'created_at'], 'idx_posts_user_created');
        table.index(['privacy', 'created_at'], 'idx_posts_privacy_created');
        table.index('deleted_at', 'idx_posts_deleted_at');
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('posts');
}
//# sourceMappingURL=20240101000002_create_posts_table.js.map