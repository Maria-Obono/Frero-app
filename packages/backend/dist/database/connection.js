"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKnexConfig = getKnexConfig;
exports.getDatabase = getDatabase;
exports.closeDatabase = closeDatabase;
const knex_1 = __importDefault(require("knex"));
const config_1 = require("../config");
let db;
function getKnexConfig() {
    const poolMin = Math.max(2, Math.min(100, config_1.config.db.poolMin));
    const poolMax = Math.max(2, Math.min(100, config_1.config.db.poolMax));
    return {
        client: 'mysql2',
        connection: {
            host: config_1.config.db.host,
            port: config_1.config.db.port,
            user: config_1.config.db.user,
            password: config_1.config.db.password,
            database: config_1.config.db.name,
            charset: 'utf8mb4',
        },
        pool: {
            min: poolMin,
            max: poolMax,
            acquireTimeoutMillis: 30000,
            createTimeoutMillis: 30000,
            idleTimeoutMillis: 30000,
        },
        migrations: {
            directory: './src/database/migrations',
            tableName: 'knex_migrations',
            extension: 'ts',
        },
        seeds: {
            directory: './src/database/seeds',
            extension: 'ts',
        },
    };
}
function getDatabase() {
    if (!db) {
        db = (0, knex_1.default)(getKnexConfig());
    }
    return db;
}
async function closeDatabase() {
    if (db) {
        await db.destroy();
    }
}
//# sourceMappingURL=connection.js.map