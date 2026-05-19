"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('friendships', (table) => {
        table.increments('id').primary();
        table.integer('user_id_1').unsigned().notNullable();
        table.integer('user_id_2').unsigned().notNullable();
        table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
        table.foreign('user_id_1').references('id').inTable('users').onDelete('CASCADE');
        table.foreign('user_id_2').references('id').inTable('users').onDelete('CASCADE');
        table.index('user_id_1', 'idx_friendships_user1');
        table.index('user_id_2', 'idx_friendships_user2');
        table.unique(['user_id_1', 'user_id_2'], { indexName: 'idx_friendships_pair' });
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('friendships');
}
//# sourceMappingURL=20240101000011_create_friendships_table.js.map