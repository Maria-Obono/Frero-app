"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('post_media', (table) => {
        table.increments('id').primary();
        table.integer('post_id').unsigned().notNullable();
        table.string('url', 500).notNullable();
        table.enum('type', ['image', 'video']).notNullable();
        table.integer('order_index').notNullable().defaultTo(0);
        table.integer('width').nullable();
        table.integer('height').nullable();
        table.integer('duration_seconds').nullable();
        table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
        table.foreign('post_id').references('id').inTable('posts').onDelete('CASCADE');
        table.index('post_id', 'idx_post_media_post_id');
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('post_media');
}
//# sourceMappingURL=20240101000003_create_post_media_table.js.map