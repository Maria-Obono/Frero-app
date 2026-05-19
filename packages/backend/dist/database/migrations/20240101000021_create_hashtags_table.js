"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('hashtags', (table) => {
        table.increments('id').primary();
        table.string('name', 100).notNullable();
        table.integer('post_count').notNullable().defaultTo(0);
        table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
        table.unique('name', { indexName: 'idx_hashtags_name' });
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('hashtags');
}
//# sourceMappingURL=20240101000021_create_hashtags_table.js.map