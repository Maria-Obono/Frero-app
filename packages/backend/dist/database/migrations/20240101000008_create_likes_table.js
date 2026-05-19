"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('likes', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable();
        table.integer('likeable_id').unsigned().notNullable();
        table.enum('likeable_type', ['post', 'reel', 'comment']).notNullable();
        table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
        table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.unique(['user_id', 'likeable_id', 'likeable_type'], { indexName: 'idx_likes_user_likeable' });
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('likes');
}
//# sourceMappingURL=20240101000008_create_likes_table.js.map