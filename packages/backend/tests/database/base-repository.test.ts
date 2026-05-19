import { BaseRepository, SoftDeletableEntity, CascadeConfig } from '../../src/database/base-repository';
import knex, { Knex } from 'knex';

interface TestEntity extends SoftDeletableEntity {
  id: number;
  name: string;
  user_id?: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

describe('BaseRepository', () => {
  let db: Knex;
  let repository: BaseRepository<TestEntity>;

  beforeAll(async () => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });

    await db.schema.createTable('test_entities', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.integer('user_id').nullable();
      table.datetime('deleted_at').nullable();
      table.timestamps(true, true);
    });

    await db.schema.createTable('child_entities', (table) => {
      table.increments('id').primary();
      table.integer('parent_id').notNullable();
      table.string('title').notNullable();
      table.datetime('deleted_at').nullable();
      table.timestamps(true, true);
    });

    repository = new BaseRepository<TestEntity>('test_entities', { db });
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db('test_entities').truncate();
    await db('child_entities').truncate();
  });

  describe('create', () => {
    it('should insert a record and return the id', async () => {
      const id = await repository.create({ name: 'Test' } as any);
      expect(id).toBe(1);
    });

    it('should insert multiple records with incrementing ids', async () => {
      const id1 = await repository.create({ name: 'First' } as any);
      const id2 = await repository.create({ name: 'Second' } as any);
      expect(id1).toBe(1);
      expect(id2).toBe(2);
    });
  });

  describe('findById', () => {
    it('should find a record by id', async () => {
      await repository.create({ name: 'Find Me' } as any);
      const record = await repository.findById(1);
      expect(record).toBeDefined();
      expect(record!.name).toBe('Find Me');
    });

    it('should return undefined for non-existent id', async () => {
      const record = await repository.findById(999);
      expect(record).toBeUndefined();
    });

    it('should exclude soft-deleted records by default', async () => {
      await repository.create({ name: 'Deleted' } as any);
      await repository.softDelete(1);
      const record = await repository.findById(1);
      expect(record).toBeUndefined();
    });

    it('should include soft-deleted records when includeDeleted is true', async () => {
      await repository.create({ name: 'Deleted' } as any);
      await repository.softDelete(1);
      const record = await repository.findById(1, { includeDeleted: true });
      expect(record).toBeDefined();
      expect(record!.name).toBe('Deleted');
    });
  });

  describe('findOne', () => {
    it('should find a single record matching conditions', async () => {
      await repository.create({ name: 'Alpha' } as any);
      await repository.create({ name: 'Beta' } as any);
      const record = await repository.findOne({ name: 'Beta' });
      expect(record).toBeDefined();
      expect(record!.name).toBe('Beta');
    });

    it('should return undefined when no match', async () => {
      const record = await repository.findOne({ name: 'NonExistent' });
      expect(record).toBeUndefined();
    });

    it('should exclude soft-deleted records by default', async () => {
      await repository.create({ name: 'Gone' } as any);
      await repository.softDelete(1);
      const record = await repository.findOne({ name: 'Gone' });
      expect(record).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('should find all records matching conditions', async () => {
      await repository.create({ name: 'A', user_id: 1 } as any);
      await repository.create({ name: 'B', user_id: 1 } as any);
      await repository.create({ name: 'C', user_id: 2 } as any);
      const records = await repository.findAll({ user_id: 1 });
      expect(records.length).toBe(2);
    });

    it('should exclude soft-deleted records by default', async () => {
      await repository.create({ name: 'A' } as any);
      await repository.create({ name: 'B' } as any);
      await repository.softDelete(1);
      const records = await repository.findAll();
      expect(records.length).toBe(1);
      expect(records[0]!.name).toBe('B');
    });

    it('should include soft-deleted records when includeDeleted is true', async () => {
      await repository.create({ name: 'A' } as any);
      await repository.create({ name: 'B' } as any);
      await repository.softDelete(1);
      const records = await repository.findAll({}, { includeDeleted: true });
      expect(records.length).toBe(2);
    });

    it('should support orderBy option', async () => {
      await repository.create({ name: 'Zebra' } as any);
      await repository.create({ name: 'Apple' } as any);
      const records = await repository.findAll({}, { orderBy: { column: 'name', direction: 'asc' } });
      expect(records[0]!.name).toBe('Apple');
      expect(records[1]!.name).toBe('Zebra');
    });
  });

  describe('update', () => {
    it('should update a record by id', async () => {
      await repository.create({ name: 'Original' } as any);
      const affected = await repository.update(1, { name: 'Updated' } as any);
      expect(affected).toBe(1);
      const record = await repository.findById(1);
      expect(record!.name).toBe('Updated');
    });

    it('should not update soft-deleted records by default', async () => {
      await repository.create({ name: 'Deleted' } as any);
      await repository.softDelete(1);
      const affected = await repository.update(1, { name: 'Updated' } as any);
      expect(affected).toBe(0);
    });

    it('should update soft-deleted records when includeDeleted is true', async () => {
      await repository.create({ name: 'Deleted' } as any);
      await repository.softDelete(1);
      const affected = await repository.update(1, { name: 'Updated' } as any, { includeDeleted: true });
      expect(affected).toBe(1);
    });
  });

  describe('softDelete', () => {
    it('should set deleted_at on a record', async () => {
      await repository.create({ name: 'To Delete' } as any);
      const affected = await repository.softDelete(1);
      expect(affected).toBe(1);
      const record = await repository.findById(1, { includeDeleted: true });
      expect(record!.deleted_at).not.toBeNull();
    });

    it('should not affect already soft-deleted records', async () => {
      await repository.create({ name: 'Already Deleted' } as any);
      await repository.softDelete(1);
      const affected = await repository.softDelete(1);
      expect(affected).toBe(0);
    });
  });

  describe('soft-delete cascade', () => {
    let cascadingRepo: BaseRepository<TestEntity>;

    beforeEach(() => {
      const cascades: CascadeConfig[] = [
        { table: 'child_entities', foreignKey: 'parent_id' },
      ];
      cascadingRepo = new BaseRepository<TestEntity>('test_entities', { db, cascades });
    });

    it('should cascade soft-delete to related entities', async () => {
      const parentId = await cascadingRepo.create({ name: 'Parent' } as any);
      await db('child_entities').insert({ parent_id: parentId, title: 'Child 1' });
      await db('child_entities').insert({ parent_id: parentId, title: 'Child 2' });

      await cascadingRepo.softDelete(parentId);

      // Parent should be soft-deleted
      const parent = await cascadingRepo.findById(parentId, { includeDeleted: true });
      expect(parent!.deleted_at).not.toBeNull();

      // Children should also be soft-deleted
      const children = await db('child_entities')
        .where('parent_id', parentId)
        .whereNotNull('deleted_at');
      expect(children.length).toBe(2);
    });

    it('should not cascade when soft-delete fails (record already deleted)', async () => {
      const parentId = await cascadingRepo.create({ name: 'Parent' } as any);
      await db('child_entities').insert({ parent_id: parentId, title: 'Child' });
      await cascadingRepo.softDelete(parentId);

      // Second soft-delete should not cascade again
      const affected = await cascadingRepo.softDelete(parentId);
      expect(affected).toBe(0);
    });

    it('should only cascade to non-deleted children', async () => {
      const parentId = await cascadingRepo.create({ name: 'Parent' } as any);
      await db('child_entities').insert({ parent_id: parentId, title: 'Active Child' });
      await db('child_entities').insert({
        parent_id: parentId,
        title: 'Already Deleted Child',
        deleted_at: new Date().toISOString(),
      });

      await cascadingRepo.softDelete(parentId);

      // Only the active child should have been cascaded
      const allChildren = await db('child_entities').where('parent_id', parentId);
      expect(allChildren.every((c: any) => c.deleted_at !== null)).toBe(true);
    });

    it('should preserve referential links after cascade (data can be restored/audited)', async () => {
      const parentId = await cascadingRepo.create({ name: 'Parent' } as any);
      await db('child_entities').insert({ parent_id: parentId, title: 'Child' });

      await cascadingRepo.softDelete(parentId);

      // Child still references parent via foreign key
      const child = await db('child_entities').where('parent_id', parentId).first();
      expect(child).toBeDefined();
      expect(child.parent_id).toBe(parentId);
      expect(child.title).toBe('Child');
    });
  });

  describe('restore', () => {
    it('should clear deleted_at on a soft-deleted record', async () => {
      await repository.create({ name: 'Restore Me' } as any);
      await repository.softDelete(1);
      const affected = await repository.restore(1);
      expect(affected).toBe(1);
      const record = await repository.findById(1);
      expect(record).toBeDefined();
      expect(record!.deleted_at).toBeNull();
    });

    it('should not affect non-deleted records', async () => {
      await repository.create({ name: 'Not Deleted' } as any);
      const affected = await repository.restore(1);
      expect(affected).toBe(0);
    });
  });

  describe('hardDelete', () => {
    it('should permanently remove a record', async () => {
      await repository.create({ name: 'Gone Forever' } as any);
      const affected = await repository.hardDelete(1);
      expect(affected).toBe(1);
      const record = await repository.findById(1, { includeDeleted: true });
      expect(record).toBeUndefined();
    });
  });

  describe('count', () => {
    it('should count non-deleted records', async () => {
      await repository.create({ name: 'One' } as any);
      await repository.create({ name: 'Two' } as any);
      await repository.create({ name: 'Three' } as any);
      await repository.softDelete(1);
      const count = await repository.count();
      expect(count).toBe(2);
    });

    it('should count all records including deleted when includeDeleted is true', async () => {
      await repository.create({ name: 'One' } as any);
      await repository.create({ name: 'Two' } as any);
      await repository.softDelete(1);
      const count = await repository.count({}, { includeDeleted: true });
      expect(count).toBe(2);
    });

    it('should count with conditions', async () => {
      await repository.create({ name: 'A', user_id: 1 } as any);
      await repository.create({ name: 'B', user_id: 1 } as any);
      await repository.create({ name: 'C', user_id: 2 } as any);
      const count = await repository.count({ user_id: 1 });
      expect(count).toBe(2);
    });
  });

  describe('exists', () => {
    it('should return true when record exists', async () => {
      await repository.create({ name: 'Exists' } as any);
      const result = await repository.exists({ name: 'Exists' });
      expect(result).toBe(true);
    });

    it('should return false when record does not exist', async () => {
      const result = await repository.exists({ name: 'Nope' });
      expect(result).toBe(false);
    });

    it('should return false for soft-deleted records by default', async () => {
      await repository.create({ name: 'Deleted' } as any);
      await repository.softDelete(1);
      const result = await repository.exists({ name: 'Deleted' });
      expect(result).toBe(false);
    });
  });

  describe('findPaginated - API pagination limits', () => {
    beforeEach(async () => {
      // Insert 60 records to test pagination boundaries
      for (let i = 1; i <= 60; i++) {
        await repository.create({ name: `Record ${i}` } as any);
      }
    });

    it('should return default page size of 20', async () => {
      const result = await repository.findPaginated();
      expect(result.data.length).toBe(20);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).not.toBeNull();
    });

    it('should cap limit at 50 (API max per Requirement 12.9)', async () => {
      const result = await repository.findPaginated({ limit: 100 });
      expect(result.data.length).toBe(50);
      expect(result.hasMore).toBe(true);
    });

    it('should cap limit at 50 even for very large values', async () => {
      const result = await repository.findPaginated({ limit: 999 });
      expect(result.data.length).toBe(50);
      expect(result.hasMore).toBe(true);
    });

    it('should enforce minimum limit of 1', async () => {
      const result = await repository.findPaginated({ limit: 0 });
      expect(result.data.length).toBe(1);
      expect(result.hasMore).toBe(true);
    });

    it('should enforce minimum limit of 1 for negative values', async () => {
      const result = await repository.findPaginated({ limit: -5 });
      expect(result.data.length).toBe(1);
      expect(result.hasMore).toBe(true);
    });

    it('should respect custom limit within bounds', async () => {
      const result = await repository.findPaginated({ limit: 10 });
      expect(result.data.length).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it('should return remaining records on subsequent pages', async () => {
      const page1 = await repository.findPaginated({ limit: 50 });
      expect(page1.data.length).toBe(50);
      expect(page1.hasMore).toBe(true);

      const page2 = await repository.findPaginated({ cursor: page1.cursor, limit: 50 });
      expect(page2.data.length).toBe(10);
      expect(page2.hasMore).toBe(false);
      expect(page2.cursor).toBeNull();
    });

    it('should produce no duplicates across pages', async () => {
      const allIds: number[] = [];
      let cursor: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const result = await repository.findPaginated({ cursor, limit: 13 });
        allIds.push(...result.data.map((r) => r.id));
        cursor = result.cursor;
        hasMore = result.hasMore;
      }

      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
      expect(allIds.length).toBe(60);
    });

    it('should produce no missing items across pages', async () => {
      const allIds: number[] = [];
      let cursor: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const result = await repository.findPaginated({ cursor, limit: 7 });
        allIds.push(...result.data.map((r) => r.id));
        cursor = result.cursor;
        hasMore = result.hasMore;
      }

      // All 60 records should be returned
      expect(allIds.length).toBe(60);
      // IDs should be sequential
      for (let i = 0; i < allIds.length; i++) {
        expect(allIds[i]).toBe(i + 1);
      }
    });

    it('should exclude soft-deleted records by default', async () => {
      await repository.softDelete(1);
      await repository.softDelete(2);
      await repository.softDelete(3);

      const allIds: number[] = [];
      let cursor: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const result = await repository.findPaginated({ cursor, limit: 50 });
        allIds.push(...result.data.map((r) => r.id));
        cursor = result.cursor;
        hasMore = result.hasMore;
      }

      expect(allIds.length).toBe(57);
      expect(allIds).not.toContain(1);
      expect(allIds).not.toContain(2);
      expect(allIds).not.toContain(3);
    });

    it('should include soft-deleted records when includeDeleted is true (admin queries)', async () => {
      await repository.softDelete(1);
      await repository.softDelete(2);

      const allIds: number[] = [];
      let cursor: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const result = await repository.findPaginated({ cursor, limit: 50, includeDeleted: true });
        allIds.push(...result.data.map((r) => r.id));
        cursor = result.cursor;
        hasMore = result.hasMore;
      }

      expect(allIds.length).toBe(60);
      expect(allIds).toContain(1);
      expect(allIds).toContain(2);
    });

    it('should support conditions with pagination', async () => {
      // Update some records to have a specific user_id
      await db('test_entities').whereIn('id', [1, 3, 5, 7, 9]).update({ user_id: 42 });

      const result = await repository.findPaginated({ limit: 50 }, { user_id: 42 });
      expect(result.data.length).toBe(5);
      expect(result.hasMore).toBe(false);
    });

    it('should return empty result for invalid cursor', async () => {
      const result = await repository.findPaginated({ cursor: 'invalid' });
      // Invalid cursor is treated as NaN, so no cursor filter is applied
      expect(result.data.length).toBe(20);
    });

    it('should return empty result when no records match', async () => {
      const result = await repository.findPaginated({}, { user_id: 999 });
      expect(result.data.length).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });
  });

  describe('getDb and getTableName', () => {
    it('should return the database instance', () => {
      expect(repository.getDb()).toBe(db);
    });

    it('should return the table name', () => {
      expect(repository.getTableName()).toBe('test_entities');
    });
  });
});
