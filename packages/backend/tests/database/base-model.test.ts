import { BaseModel, SoftDeletable } from '../../src/database/base-model';
import knex, { Knex } from 'knex';

interface TestRecord extends SoftDeletable {
  id: number;
  name: string;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

describe('BaseModel', () => {
  let db: Knex;
  let model: BaseModel<TestRecord>;

  beforeAll(async () => {
    // Use better-sqlite3 in-memory for unit tests (no MySQL dependency needed)
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });

    await db.schema.createTable('test_records', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.datetime('deleted_at').nullable();
      table.timestamps(true, true);
    });

    model = new BaseModel<TestRecord>('test_records', db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db('test_records').truncate();
  });

  describe('create', () => {
    it('should insert a record and return the id', async () => {
      const id = await model.create({ name: 'Test Record' } as any);
      expect(id).toBe(1);
    });

    it('should insert multiple records with incrementing ids', async () => {
      const id1 = await model.create({ name: 'Record 1' } as any);
      const id2 = await model.create({ name: 'Record 2' } as any);
      expect(id1).toBe(1);
      expect(id2).toBe(2);
    });
  });

  describe('findById', () => {
    it('should find a record by id', async () => {
      await model.create({ name: 'Find Me' } as any);
      const record = await model.findById(1);
      expect(record).toBeDefined();
      expect(record!.name).toBe('Find Me');
    });

    it('should return undefined for non-existent id', async () => {
      const record = await model.findById(999);
      expect(record).toBeUndefined();
    });

    it('should exclude soft-deleted records by default', async () => {
      await model.create({ name: 'Deleted' } as any);
      await model.softDelete(1);
      const record = await model.findById(1);
      expect(record).toBeUndefined();
    });

    it('should include soft-deleted records when includeDeleted is true', async () => {
      await model.create({ name: 'Deleted' } as any);
      await model.softDelete(1);
      const record = await model.findById(1, true);
      expect(record).toBeDefined();
      expect(record!.name).toBe('Deleted');
    });
  });

  describe('softDelete', () => {
    it('should set deleted_at on a record', async () => {
      await model.create({ name: 'To Delete' } as any);
      const affected = await model.softDelete(1);
      expect(affected).toBe(1);

      const record = await model.findById(1, true);
      expect(record!.deleted_at).not.toBeNull();
    });

    it('should not affect already soft-deleted records', async () => {
      await model.create({ name: 'Already Deleted' } as any);
      await model.softDelete(1);
      const affected = await model.softDelete(1);
      expect(affected).toBe(0);
    });
  });

  describe('restore', () => {
    it('should clear deleted_at on a soft-deleted record', async () => {
      await model.create({ name: 'Restore Me' } as any);
      await model.softDelete(1);
      const affected = await model.restore(1);
      expect(affected).toBe(1);

      const record = await model.findById(1);
      expect(record).toBeDefined();
      expect(record!.deleted_at).toBeNull();
    });

    it('should not affect non-deleted records', async () => {
      await model.create({ name: 'Not Deleted' } as any);
      const affected = await model.restore(1);
      expect(affected).toBe(0);
    });
  });

  describe('update', () => {
    it('should update a record by id', async () => {
      await model.create({ name: 'Original' } as any);
      const affected = await model.update(1, { name: 'Updated' } as any);
      expect(affected).toBe(1);

      const record = await model.findById(1);
      expect(record!.name).toBe('Updated');
    });

    it('should not update soft-deleted records by default', async () => {
      await model.create({ name: 'Deleted' } as any);
      await model.softDelete(1);
      const affected = await model.update(1, { name: 'Updated' } as any);
      expect(affected).toBe(0);
    });

    it('should update soft-deleted records when includeDeleted is true', async () => {
      await model.create({ name: 'Deleted' } as any);
      await model.softDelete(1);
      const affected = await model.update(1, { name: 'Updated' } as any, true);
      expect(affected).toBe(1);
    });
  });

  describe('hardDelete', () => {
    it('should permanently remove a record', async () => {
      await model.create({ name: 'Gone Forever' } as any);
      const affected = await model.hardDelete(1);
      expect(affected).toBe(1);

      const record = await model.findById(1, true);
      expect(record).toBeUndefined();
    });
  });

  describe('findPaginated', () => {
    beforeEach(async () => {
      // Insert 25 records
      for (let i = 1; i <= 25; i++) {
        await model.create({ name: `Record ${i}` } as any);
      }
    });

    it('should return default page size of 20', async () => {
      const result = await model.findPaginated();
      expect(result.data.length).toBe(20);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).not.toBeNull();
    });

    it('should return remaining records on second page', async () => {
      const page1 = await model.findPaginated();
      const page2 = await model.findPaginated({ cursor: page1.cursor });
      expect(page2.data.length).toBe(5);
      expect(page2.hasMore).toBe(false);
      expect(page2.cursor).toBeNull();
    });

    it('should respect custom limit', async () => {
      const result = await model.findPaginated({ limit: 5 });
      expect(result.data.length).toBe(5);
      expect(result.hasMore).toBe(true);
    });

    it('should cap limit at 100', async () => {
      const result = await model.findPaginated({ limit: 200 });
      // We only have 25 records, so all are returned
      expect(result.data.length).toBe(25);
      expect(result.hasMore).toBe(false);
    });

    it('should enforce minimum limit of 1', async () => {
      const result = await model.findPaginated({ limit: 0 });
      expect(result.data.length).toBe(1);
      expect(result.hasMore).toBe(true);
    });

    it('should exclude soft-deleted records by default', async () => {
      await model.softDelete(1);
      await model.softDelete(2);
      const result = await model.findPaginated({ limit: 100 });
      expect(result.data.length).toBe(23);
    });

    it('should include soft-deleted records when includeDeleted is true', async () => {
      await model.softDelete(1);
      await model.softDelete(2);
      const result = await model.findPaginated({ limit: 100, includeDeleted: true });
      expect(result.data.length).toBe(25);
    });

    it('should produce no duplicates across pages', async () => {
      const allIds: number[] = [];
      let cursor: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const result = await model.findPaginated({ cursor, limit: 7 });
        allIds.push(...result.data.map((r: any) => r.id));
        cursor = result.cursor;
        hasMore = result.hasMore;
      }

      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
      expect(allIds.length).toBe(25);
    });
  });

  describe('count', () => {
    it('should count all non-deleted records', async () => {
      await model.create({ name: 'One' } as any);
      await model.create({ name: 'Two' } as any);
      await model.create({ name: 'Three' } as any);
      await model.softDelete(1);

      const count = await model.count();
      expect(count).toBe(2);
    });

    it('should count all records including deleted when includeDeleted is true', async () => {
      await model.create({ name: 'One' } as any);
      await model.create({ name: 'Two' } as any);
      await model.softDelete(1);

      const count = await model.count({}, true);
      expect(count).toBe(2);
    });
  });
});
