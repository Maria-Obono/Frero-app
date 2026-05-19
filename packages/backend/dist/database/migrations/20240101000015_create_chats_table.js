"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('chats', (table) => {
        table.increments('id').primary();
        table.enum('type', ['private', 'group']).notNullable();
        table.string('name', 100).nullable();
        table.integer('created_by').unsigned().notNullable();
        table.integer('participant_count').notNullable().defaultTo(0);
        table.timestamps(true, true);
        table.foreign('created_by').references('id').inTable('users').onDelete('CASCADE');
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('chats');
}
//# sourceMappingURL=20240101000015_create_chats_table.js.map