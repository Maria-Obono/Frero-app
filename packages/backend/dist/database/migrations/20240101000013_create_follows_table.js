"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('follows', (table) => {
        table.increments('id').primary();
        table.integer('follower_id').unsigned().notNullable();
        table.integer('followed_id').unsigned().notNullable();
        table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
        table.foreign('follower_id').references('id').inTable('users').onDelete('CASCADE');
        table.foreign('followed_id').references('id').inTable('users').onDelete('CASCADE');
        table.index('follower_id', 'idx_follows_follower');
        table.index('followed_id', 'idx_follows_followed');
        table.unique(['follower_id', 'followed_id'], { indexName: 'idx_follows_pair' });
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('follows');
}
//# sourceMappingURL=20240101000013_create_follows_table.js.map