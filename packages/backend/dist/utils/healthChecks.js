"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkMySQLHealth = checkMySQLHealth;
exports.checkRedisHealth = checkRedisHealth;
const promise_1 = require("mysql2/promise");
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../config");
async function checkMySQLHealth() {
    const start = Date.now();
    let connection;
    try {
        connection = await (0, promise_1.createConnection)({
            host: config_1.config.db.host,
            port: config_1.config.db.port,
            user: config_1.config.db.user,
            password: config_1.config.db.password,
            database: config_1.config.db.name,
            connectTimeout: 5000,
        });
        await connection.ping();
        const latencyMs = Date.now() - start;
        return { status: 'up', latencyMs };
    }
    catch (err) {
        const latencyMs = Date.now() - start;
        const error = err instanceof Error ? err.message : 'Unknown error';
        return { status: 'down', latencyMs, error };
    }
    finally {
        if (connection) {
            await connection.end().catch(() => { });
        }
    }
}
async function checkRedisHealth() {
    const start = Date.now();
    let client = null;
    try {
        client = new ioredis_1.default({
            host: config_1.config.redis.host,
            port: config_1.config.redis.port,
            password: config_1.config.redis.password,
            db: config_1.config.redis.db,
            connectTimeout: 5000,
            lazyConnect: true,
        });
        await client.connect();
        const pong = await client.ping();
        if (pong !== 'PONG') {
            throw new Error(`Unexpected ping response: ${pong}`);
        }
        const latencyMs = Date.now() - start;
        return { status: 'up', latencyMs };
    }
    catch (err) {
        const latencyMs = Date.now() - start;
        const error = err instanceof Error ? err.message : 'Unknown error';
        return { status: 'down', latencyMs, error };
    }
    finally {
        if (client) {
            await client.quit().catch(() => { });
        }
    }
}
//# sourceMappingURL=healthChecks.js.map