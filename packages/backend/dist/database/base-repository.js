"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseRepository = void 0;
const connection_1 = require("./connection");
/** Default page size for API pagination (Requirement 12.9) */
const DEFAULT_PAGE_SIZE = 20;
/** Maximum page size for API pagination (Requirement 12.9) */
const MAX_PAGE_SIZE = 50;
/**
 * Base repository class providing a clean service-facing interface with:
 * - CRUD operations
 * - Soft-delete with cascade support (Requirement 13.4)
 * - Exclusion of soft-deleted records from standard queries (Requirement 13.5)
 * - include-deleted parameter for admin queries (Requirement 13.5)
 * - Cursor-based pagination with API limits (default 20, max 50) (Requirement 12.9)
 *
 * Services should use this repository pattern rather than accessing the database directly.
 */
class BaseRepository {
    tableName;
    db;
    cascades;
    constructor(tableName, options) {
        this.tableName = tableName;
        this.db = options?.db || (0, connection_1.getDatabase)();
        this.cascades = options?.cascades || [];
    }
    /**
     * Returns a query builder scoped to this table.
     * By default, excludes soft-deleted records (Requirement 13.5).
     */
    query(includeDeleted = false) {
        const qb = this.db(this.tableName);
        if (!includeDeleted) {
            qb.whereNull(`${this.tableName}.deleted_at`);
        }
        return qb;
    }
    /**
     * Normalizes the pagination limit to be within API bounds.
     * Default: 20, Min: 1, Max: 50 (Requirement 12.9).
     */
    normalizePaginationLimit(limit) {
        if (limit === undefined || limit === null) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
    }
    /**
     * Find a single record by ID.
     * Excludes soft-deleted records unless includeDeleted is true.
     */
    async findById(id, options) {
        const includeDeleted = options?.includeDeleted ?? false;
        const result = await this.query(includeDeleted)
            .where(`${this.tableName}.id`, id)
            .first();
        return result;
    }
    /**
     * Find all records matching the given conditions.
     * Excludes soft-deleted records unless includeDeleted is true.
     */
    async findAll(conditions = {}, options) {
        const includeDeleted = options?.includeDeleted ?? false;
        const qb = this.query(includeDeleted);
        for (const [key, value] of Object.entries(conditions)) {
            qb.where(`${this.tableName}.${key}`, value);
        }
        if (options?.orderBy) {
            qb.orderBy(`${this.tableName}.${options.orderBy.column}`, options.orderBy.direction);
        }
        return qb;
    }
    /**
     * Find a single record matching the given conditions.
     * Excludes soft-deleted records unless includeDeleted is true.
     */
    async findOne(conditions, options) {
        const includeDeleted = options?.includeDeleted ?? false;
        const qb = this.query(includeDeleted);
        for (const [key, value] of Object.entries(conditions)) {
            qb.where(`${this.tableName}.${key}`, value);
        }
        const result = await qb.first();
        return result;
    }
    /**
     * Find records with cursor-based pagination.
     * Uses the `id` column as the cursor for consistent ordering.
     * Enforces API pagination limits: default 20, max 50 (Requirement 12.9).
     */
    async findPaginated(options = {}, conditions = {}) {
        const limit = this.normalizePaginationLimit(options.limit);
        const includeDeleted = options.includeDeleted ?? false;
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
     * Insert a new record and return its ID.
     */
    async create(data) {
        const [id] = await this.db(this.tableName).insert(data);
        return id;
    }
    /**
     * Update a record by ID.
     * Only updates non-deleted records unless includeDeleted is true.
     * Returns the number of affected rows.
     */
    async update(id, data, options) {
        const includeDeleted = options?.includeDeleted ?? false;
        const qb = this.query(includeDeleted).where(`${this.tableName}.id`, id);
        return qb.update(data);
    }
    /**
     * Soft-delete a record by setting deleted_at to the current timestamp.
     * Also cascades the soft-delete to related entities as configured (Requirement 13.4).
     *
     * When a user is deleted, this cascades to their content (posts, reels, stories, comments).
     */
    async softDelete(id) {
        const affected = await this.db(this.tableName)
            .where('id', id)
            .whereNull('deleted_at')
            .update({ deleted_at: this.db.fn.now() });
        if (affected > 0 && this.cascades.length > 0) {
            await this.cascadeSoftDelete(id);
        }
        return affected;
    }
    /**
     * Soft-delete a record within a transaction.
     * Useful when the caller needs to coordinate multiple operations atomically.
     */
    async softDeleteWithTransaction(id, trx) {
        const affected = await trx(this.tableName)
            .where('id', id)
            .whereNull('deleted_at')
            .update({ deleted_at: trx.fn.now() });
        if (affected > 0 && this.cascades.length > 0) {
            await this.cascadeSoftDeleteWithTransaction(id, trx);
        }
        return affected;
    }
    /**
     * Restore a soft-deleted record by clearing deleted_at.
     * Returns the number of affected rows.
     */
    async restore(id) {
        return this.db(this.tableName)
            .where('id', id)
            .whereNotNull('deleted_at')
            .update({ deleted_at: null });
    }
    /**
     * Hard-delete a record permanently. Use with extreme caution.
     * Returns the number of affected rows.
     */
    async hardDelete(id) {
        return this.db(this.tableName).where('id', id).delete();
    }
    /**
     * Count records matching conditions.
     * Excludes soft-deleted records unless includeDeleted is true.
     */
    async count(conditions = {}, options) {
        const includeDeleted = options?.includeDeleted ?? false;
        const qb = this.query(includeDeleted).count('* as count');
        for (const [key, value] of Object.entries(conditions)) {
            qb.where(`${this.tableName}.${key}`, value);
        }
        const result = await qb.first();
        return Number(result?.count) || 0;
    }
    /**
     * Check if a record exists matching the given conditions.
     * Excludes soft-deleted records unless includeDeleted is true.
     */
    async exists(conditions, options) {
        const count = await this.count(conditions, options);
        return count > 0;
    }
    /**
     * Cascade soft-delete to all related entities defined in cascades config.
     * This implements Requirement 13.4: when a user is deleted, cascade soft-delete
     * to all owned content while preserving referential links for audit/restore.
     */
    async cascadeSoftDelete(parentId) {
        const promises = this.cascades.map((cascade) => this.db(cascade.table)
            .where(cascade.foreignKey, parentId)
            .whereNull('deleted_at')
            .update({ deleted_at: this.db.fn.now() }));
        await Promise.all(promises);
    }
    /**
     * Cascade soft-delete within a transaction.
     */
    async cascadeSoftDeleteWithTransaction(parentId, trx) {
        const promises = this.cascades.map((cascade) => trx(cascade.table)
            .where(cascade.foreignKey, parentId)
            .whereNull('deleted_at')
            .update({ deleted_at: trx.fn.now() }));
        await Promise.all(promises);
    }
    /**
     * Get the underlying Knex instance for advanced queries.
     * Use sparingly — prefer the repository methods for standard operations.
     */
    getDb() {
        return this.db;
    }
    /**
     * Get the table name for this repository.
     */
    getTableName() {
        return this.tableName;
    }
}
exports.BaseRepository = BaseRepository;
//# sourceMappingURL=base-repository.js.map