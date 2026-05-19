"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('blocks', (table) => {
        table.increments('id').primary();
        table.integer('blocker_id').unsigned().notNullable();
        table.integer('blocked_id').unsigned().notNullable();
        table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
        table.foreign('blocker_id').references('id').inTable('users').onDelete('CASCADE');
        table.foreign('blocked_id').references('id').inTable('users').onDelete('CASCADE');
        table.unique(['blocker_id', 'blocked_id'], { indexName: 'idx_blocks_pair' });
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('blocks');
}
//# sourceMappingURL=20240101000014_create_blocks_table.js.map