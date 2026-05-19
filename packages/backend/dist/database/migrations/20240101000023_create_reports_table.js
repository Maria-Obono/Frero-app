"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('reports', (table) => {
        table.increments('id').primary();
        table.integer('reporter_id').unsigned().notNullable();
        table.integer('content_id').unsigned().notNullable();
        table.enum('content_type', ['post', 'reel', 'comment', 'story', 'user', 'message']).notNullable();
        table.enum('reason', ['spam', 'harassment', 'inappropriate', 'violence', 'misinformation', 'other']).notNullable();
        table.enum('status', ['pending', 'reviewed', 'dismissed']).notNullable().defaultTo('pending');
        table.integer('moderator_id').unsigned().nullable();
        table.enum('action_taken', ['dismiss', 'warn', 'remove_content', 'suspend_user']).nullable();
        table.datetime('reviewed_at').nullable();
        table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
        table.foreign('reporter_id').references('id').inTable('users').onDelete('CASCADE');
        table.foreign('moderator_id').references('id').inTable('users').onDelete('SET NULL');
        table.index(['status', 'created_at'], 'idx_reports_status_created');
        table.index('reporter_id', 'idx_reports_reporter');
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('reports');
}
//# sourceMappingURL=20240101000023_create_reports_table.js.map