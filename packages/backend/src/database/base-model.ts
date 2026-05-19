import { Knex } from 'knex';
import { getDatabase } from './connection';

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
export class BaseModel<T extends SoftDeletable> {
  protected tableName: string;
  protected db: Knex;

  constructor(tableName: string, db?: Knex) {
    this.tableName = tableName;
    this.db = db || getDatabase();
  }

  /**
   * Returns a query builder scoped to this table.
   * By default, excludes soft-deleted records.
   */
  protected query(includeDeleted = false): Knex.QueryBuilder {
    const qb = this.db(this.tableName);
    if (!includeDeleted) {
      qb.whereNull(`${this.tableName}.deleted_at`);
    }
    return qb;
  }

  /**
   * Find a record by ID, excluding soft-deleted by default.
   */
  async findById(id: number, includeDeleted = false): Promise<T | undefined> {
    const result = await this.query(includeDeleted)
      .where(`${this.tableName}.id`, id)
      .first();
    return result as T | undefined;
  }

  /**
   * Find all records matching conditions, excluding soft-deleted by default.
   */
  async findAll(
    conditions: Partial<Record<string, unknown>> = {},
    includeDeleted = false
  ): Promise<T[]> {
    const qb = this.query(includeDeleted);
    for (const [key, value] of Object.entries(conditions)) {
      qb.where(`${this.tableName}.${key}`, value as any);
    }
    return qb as unknown as T[];
  }

  /**
   * Find records with cursor-based pagination.
   * Uses the `id` column as the cursor for consistent ordering.
   */
  async findPaginated(
    options: PaginationOptions = {},
    conditions: Partial<Record<string, unknown>> = {}
  ): Promise<PaginatedResult<T>> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const includeDeleted = options.includeDeleted || false;

    const qb = this.query(includeDeleted);

    for (const [key, value] of Object.entries(conditions)) {
      qb.where(`${this.tableName}.${key}`, value as any);
    }

    if (options.cursor) {
      const cursorId = parseInt(options.cursor, 10);
      if (!isNaN(cursorId)) {
        qb.where(`${this.tableName}.id`, '>', cursorId);
      }
    }

    qb.orderBy(`${this.tableName}.id`, 'asc');
    qb.limit(limit + 1); // Fetch one extra to determine hasMore

    const results = (await qb) as T[];
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;
    const cursor = data.length > 0 ? String((data[data.length - 1] as any).id) : null;

    return {
      data,
      cursor: hasMore ? cursor : null,
      hasMore,
    };
  }

  /**
   * Insert a new record.
   */
  async create(data: Partial<T>): Promise<number> {
    const [id] = await this.db(this.tableName).insert(data as any);
    return id as number;
  }

  /**
   * Update a record by ID (only non-deleted records by default).
   */
  async update(id: number, data: Partial<T>, includeDeleted = false): Promise<number> {
    const qb = this.query(includeDeleted).where(`${this.tableName}.id`, id);
    return qb.update(data);
  }

  /**
   * Soft-delete a record by setting deleted_at to current timestamp.
   */
  async softDelete(id: number): Promise<number> {
    return this.db(this.tableName)
      .where('id', id)
      .whereNull('deleted_at')
      .update({ deleted_at: this.db.fn.now() });
  }

  /**
   * Restore a soft-deleted record by clearing deleted_at.
   */
  async restore(id: number): Promise<number> {
    return this.db(this.tableName)
      .where('id', id)
      .whereNotNull('deleted_at')
      .update({ deleted_at: null });
  }

  /**
   * Hard-delete a record permanently. Use with caution.
   */
  async hardDelete(id: number): Promise<number> {
    return this.db(this.tableName).where('id', id).delete();
  }

  /**
   * Count records matching conditions, excluding soft-deleted by default.
   */
  async count(
    conditions: Partial<Record<string, unknown>> = {},
    includeDeleted = false
  ): Promise<number> {
    const qb = this.query(includeDeleted).count('* as count');
    for (const [key, value] of Object.entries(conditions)) {
      qb.where(`${this.tableName}.${key}`, value as any);
    }
    const result = await qb.first();
    return (result as any)?.count || 0;
  }
}
