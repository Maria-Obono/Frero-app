"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.createTable('users', (table) => {
        table.increments('id').primary();
        table.string('email', 255).notNullable().unique();
        table.string('username', 30).notNullable().unique();
        table.string('password_hash', 255).notNullable();
        table.string('display_name', 50).nullable();
        table.text('bio').nullable();
        table.string('location', 100).nullable();
        table.string('website', 200).nullable();
        table.string('avatar_url', 500).nullable();
        table.string('cover_url', 500).nullable();
        table.enum('role', ['user', 'moderator', 'admin']).notNullable().defaultTo('user');
        table.boolean('is_2fa_enabled').notNullable().defaultTo(false);
        table.string('totp_secret', 255).nullable();
        table.datetime('locked_until').nullable();
        table.integer('failed_login_attempts').notNullable().defaultTo(0);
        table.datetime('deleted_at').nullable();
        table.timestamps(true, true);
        // Indexes for frequently queried columns
        table.index('created_at', 'idx_users_created_at');
        table.index('role', 'idx_users_role');
        table.index('deleted_at', 'idx_users_deleted_at');
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('users');
}
//# sourceMappingURL=20240101000001_create_users_table.js.map