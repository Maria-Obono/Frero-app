"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('post_hashtags', (table) => {
        table.increments('id').primary();
        table.integer('post_id').unsigned().notNullable();
        table.integer('hashtag_id').unsigned().notNullable();
        table.foreign('post_id').references('id').inTable('posts').onDelete('CASCADE');
        table.foreign('hashtag_id').references('id').inTable('hashtags').onDelete('CASCADE');
        table.index(['hashtag_id', 'post_id'], 'idx_post_hashtags_hashtag');
        table.unique(['post_id', 'hashtag_id'], { indexName: 'idx_post_hashtags_unique' });
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('post_hashtags');
}
//# sourceMappingURL=20240101000022_create_post_hashtags_table.js.map