"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('user_interest_signals', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable();
        table.integer('target_user_id').unsigned().notNullable();
        table.enum('interaction_type', ['like', 'comment', 'share', 'view', 'message']).notNullable();
        table.integer('weight').notNullable().defaultTo(1);
        table.datetime('last_interaction_at').notNullable().defaultTo(knex.fn.now());
        table.timestamps(true, true);
        table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.foreign('target_user_id').references('id').inTable('users').onDelete('CASCADE');
        table.index(['user_id', 'last_interaction_at'], 'idx_signals_user');
        table.unique(['user_id', 'target_user_id', 'interaction_type'], { indexName: 'idx_signals_unique' });
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('user_interest_signals');
}
//# sourceMappingURL=20240101000024_create_user_interest_signals_table.js.map