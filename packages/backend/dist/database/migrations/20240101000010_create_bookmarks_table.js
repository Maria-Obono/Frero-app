"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('bookmarks', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable();
        table.integer('post_id').unsigned().notNullable();
        table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
        table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.foreign('post_id').references('id').inTable('posts').onDelete('CASCADE');
        table.unique(['user_id', 'post_id'], { indexName: 'idx_bookmarks_user_post' });
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('bookmarks');
}
//# sourceMappingURL=20240101000010_create_bookmarks_table.js.map