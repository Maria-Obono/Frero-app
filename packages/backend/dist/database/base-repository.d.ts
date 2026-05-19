import { Knex } from 'knex';
/**
 * Interface for entities that support soft-delete.
 */
export interface SoftDeletableEntity {
    id: number;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}
/**
 * Pagination options for API-level queries.
 * Enforces the API pagination limits: default 20, max 50 (Requirement 12.9).
 */
export interface RepositoryPaginationOptions {
    cursor?: string | null;
    limit?: number;
    includeDeleted?: boolean;
}
/**
 * Paginated result returned by repository queries.
 */
export interface PaginatedResult<T> {
    data: T[];
    cursor: string | null;
    hasMore: boolean;
    total?: number;
}
/**
 * Options for find operations.
 */
export interface FindOptions {
    includeDeleted?: boolean;
    orderBy?: {
        column: string;
        direction: 'asc' | 'desc';
    };
}
/**
 * Configuration for soft-delete cascade relationships.
 * When a parent entity is soft-deleted, all related entities in the
 * specified tables will also be soft-deleted.
 */
export interface CascadeConfig {
    /** The table to cascade the soft-delete to */
    table: string;
    /** The foreign key column in the related table that references this entity */
    foreignKey: string;
}
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
export declare class BaseRepository<T extends SoftDeletableEntity> {
    protected readonly tableName: string;
    protected readonly db: Knex;
    protected readonly cascades: CascadeConfig[];
    constructor(tableName: string, options?: {
        db?: Knex;
        cascades?: CascadeConfig[];
    });
    /**
     * Returns a query builder scoped to this table.
     * By default, excludes soft-deleted records (Requirement 13.5).
     */
    protected query(includeDeleted?: boolean): Knex.QueryBuilder;
    /**
     * Normalizes the pagination limit to be within API bounds.
     * Default: 20, Min: 1, Max: 50 (Requirement 12.9).
     */
    protected normalizePaginationLimit(limit?: number): number;
    /**
     * Find a single record by ID.
     * Excludes soft-deleted records unless includeDeleted is true.
     */
    findById(id: number, options?: FindOptions): Promise<T | undefined>;
    /**
     * Find all records matching the given conditions.
     * Excludes soft-deleted records unless includeDeleted is true.
     */
    findAll(conditions?: Partial<Record<string, unknown>>, options?: FindOptions): Promise<T[]>;
    /**
     * Find a single record matching the given conditions.
     * Excludes soft-deleted records unless includeDeleted is true.
     */
    findOne(conditions: Partial<Record<string, unknown>>, options?: FindOptions): Promise<T | undefined>;
    /**
     * Find records with cursor-based pagination.
     * Uses the `id` column as the cursor for consistent ordering.
     * Enforces API pagination limits: default 20, max 50 (Requirement 12.9).
     */
    findPaginated(options?: RepositoryPaginationOptions, conditions?: Partial<Record<string, unknown>>): Promise<PaginatedResult<T>>;
    /**
     * Insert a new record and return its ID.
     */
    create(data: Omit<Partial<T>, 'id' | 'deleted_at' | 'created_at' | 'updated_at'>): Promise<number>;
    /**
     * Update a record by ID.
     * Only updates non-deleted records unless includeDeleted is true.
     * Returns the number of affected rows.
     */
    update(id: number, data: Partial<Omit<T, 'id' | 'created_at'>>, options?: FindOptions): Promise<number>;
    /**
     * Soft-delete a record by setting deleted_at to the current timestamp.
     * Also cascades the soft-delete to related entities as configured (Requirement 13.4).
     *
     * When a user is deleted, this cascades to their content (posts, reels, stories, comments).
     */
    softDelete(id: number): Promise<number>;
    /**
     * Soft-delete a record within a transaction.
     * Useful when the caller needs to coordinate multiple operations atomically.
     */
    softDeleteWithTransaction(id: number, trx: Knex.Transaction): Promise<number>;
    /**
     * Restore a soft-deleted record by clearing deleted_at.
     * Returns the number of affected rows.
     */
    restore(id: number): Promise<number>;
    /**
     * Hard-delete a record permanently. Use with extreme caution.
     * Returns the number of affected rows.
     */
    hardDelete(id: number): Promise<number>;
    /**
     * Count records matching conditions.
     * Excludes soft-deleted records unless includeDeleted is true.
     */
    count(conditions?: Partial<Record<string, unknown>>, options?: FindOptions): Promise<number>;
    /**
     * Check if a record exists matching the given conditions.
     * Excludes soft-deleted records unless includeDeleted is true.
     */
    exists(conditions: Partial<Record<string, unknown>>, options?: FindOptions): Promise<boolean>;
    /**
     * Cascade soft-delete to all related entities defined in cascades config.
     * This implements Requirement 13.4: when a user is deleted, cascade soft-delete
     * to all owned content while preserving referential links for audit/restore.
     */
    private cascadeSoftDelete;
    /**
     * Cascade soft-delete within a transaction.
     */
    private cascadeSoftDeleteWithTransaction;
    /**
     * Get the underlying Knex instance for advanced queries.
     * Use sparingly — prefer the repository methods for standard operations.
     */
    getDb(): Knex;
    /**
     * Get the table name for this repository.
     */
    getTableName(): string;
}
//# sourceMappingURL=base-repository.d.ts.map