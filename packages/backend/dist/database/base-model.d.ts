import { Knex } from 'knex';
export interface SoftDeletable {
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}
export interface PaginationOptions {
    cursor?: string | null;
    limit?: number;
    includeDeleted?: boolean;
}
export interface PaginatedResult<T> {
    data: T[];
    cursor: string | null;
    hasMore: boolean;
}
/**
 * Base model class providing CRUD operations with soft-delete support.
 * All content models extend this to get consistent soft-delete behavior.
 */
export declare class BaseModel<T extends SoftDeletable> {
    protected tableName: string;
    protected db: Knex;
    constructor(tableName: string, db?: Knex);
    /**
     * Returns a query builder scoped to this table.
     * By default, excludes soft-deleted records.
     */
    protected query(includeDeleted?: boolean): Knex.QueryBuilder;
    /**
     * Find a record by ID, excluding soft-deleted by default.
     */
    findById(id: number, includeDeleted?: boolean): Promise<T | undefined>;
    /**
     * Find all records matching conditions, excluding soft-deleted by default.
     */
    findAll(conditions?: Partial<Record<string, unknown>>, includeDeleted?: boolean): Promise<T[]>;
    /**
     * Find records with cursor-based pagination.
     * Uses the `id` column as the cursor for consistent ordering.
     */
    findPaginated(options?: PaginationOptions, conditions?: Partial<Record<string, unknown>>): Promise<PaginatedResult<T>>;
    /**
     * Insert a new record.
     */
    create(data: Partial<T>): Promise<number>;
    /**
     * Update a record by ID (only non-deleted records by default).
     */
    update(id: number, data: Partial<T>, includeDeleted?: boolean): Promise<number>;
    /**
     * Soft-delete a record by setting deleted_at to current timestamp.
     */
    softDelete(id: number): Promise<number>;
    /**
     * Restore a soft-deleted record by clearing deleted_at.
     */
    restore(id: number): Promise<number>;
    /**
     * Hard-delete a record permanently. Use with caution.
     */
    hardDelete(id: number): Promise<number>;
    /**
     * Count records matching conditions, excluding soft-deleted by default.
     */
    count(conditions?: Partial<Record<string, unknown>>, includeDeleted?: boolean): Promise<number>;
}
//# sourceMappingURL=base-model.d.ts.map