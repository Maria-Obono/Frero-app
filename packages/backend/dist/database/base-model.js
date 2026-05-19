"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseModel = void 0;
const connection_1 = require("./connection");
/**
 * Base model class providing CRUD operations with soft-delete support.
 * All content models extend this to get consistent soft-delete behavior.
 */
class BaseModel {
    tableName;
    db;
    constructor(tableName, db) {
        this.tableName = tableName;
        this.db = db || (0, connection_1.getDatabase)();
    }
    /**
     * Returns a query builder scoped to this table.
     * By default, excludes soft-deleted records.
     */
    query(includeDeleted = false) {
        const qb = this.db(this.tableName);
        if (!includeDeleted) {
            qb.whereNull(`${this.tableName}.deleted_at`);
        }
        return qb;
    }
    /**
     * Find a record by ID, excluding soft-deleted by default.
     */
    async findById(id, includeDeleted = false) {
        const result = await this.query(includeDeleted)
            .where(`${this.tableName}.id`, id)
            .first();
        return result;
    }
    /**
     * Find all records matching conditions, excluding soft-deleted by default.
     */
    async findAll(conditions = {}, includeDeleted = false) {
        const qb = this.query(includeDeleted);
        for (const [key, value] of Object.entries(conditions)) {
            qb.where(`${this.tableName}.${key}`, value);
        }
        return qb;
    }
    /**
     * Find records with cursor-based pagination.
     * Uses the `id` column as the cursor for consistent ordering.
     */
    async findPaginated(options = {}, conditions = {}) {
        const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
        const includeDeleted = options.includeDeleted || false;
        const qb = this.query(includeDeleted);
        for (const [key, value] of Object.entries(conditions)) {
            qb.where(`${this.tableName}.${key}`, value);
        }
        if (options.cursor) {
            const cursorId = parseInt(options.cursor, 10);
            if (!isNaN(cursorId)) {
                qb.where(`${this.tableName}.id`, '>', cursorId);
            }
        }
        qb.orderBy(`${this.tableName}.id`, 'asc');
        qb.limit(limit + 1); // Fetch one extra to determine hasMore
        const results = (await qb);
        const hasMore = results.length > limit;
        const data = hasMore ? results.slice(0, limit) : results;
        const cursor = data.length > 0 ? String(data[data.length - 1].id) : null;
        return {
            data,
            cursor: hasMore ? cursor : null,
            hasMore,
        };
    }
    /**
     * Insert a new record.
     */
    async create(data) {
        const [id] = await this.db(this.tableName).insert(data);
        return id;
    }
    /**
     * Update a record by ID (only non-deleted records by default).
     */
    async update(id, data, includeDeleted = false) {
        const qb = this.query(includeDeleted).where(`${this.tableName}.id`, id);
        return qb.update(data);
    }
    /**
     * Soft-delete a record by setting deleted_at to current timestamp.
     */
    async softDelete(id) {
        return this.db(this.tableName)
            .where('id', id)
            .whereNull('deleted_at')
            .update({ deleted_at: this.db.fn.now() });
    }
    /**
     * Restore a soft-deleted record by clearing deleted_at.
     */
    async restore(id) {
        return this.db(this.tableName)
            .where('id', id)
            .whereNotNull('deleted_at')
            .update({ deleted_at: null });
    }
    /**
     * Hard-delete a record permanently. Use with caution.
     */
    async hardDelete(id) {
        return this.db(this.tableName).where('id', id).delete();
    }
    /**
     * Count records matching conditions, excluding soft-deleted by default.
     */
    async count(conditions = {}, includeDeleted = false) {
        const qb = this.query(includeDeleted).count('* as count');
        for (const [key, value] of Object.entries(conditions)) {
            qb.where(`${this.tableName}.${key}`, value);
        }
        const result = await qb.first();
        return result?.count || 0;
    }
}
exports.BaseModel = BaseModel;
//# sourceMappingURL=base-model.js.map