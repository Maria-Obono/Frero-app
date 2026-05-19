"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('shares', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable();
        table.integer('post_id').unsigned().notNullable();
        table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
        table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.foreign('post_id').references('id').inTable('posts').onDelete('CASCADE');
        table.index(['user_id', 'created_at'], 'idx_shares_user_created');
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('shares');
}
//# sourceMappingURL=20240101000009_create_shares_table.js.map