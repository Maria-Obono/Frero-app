import * as fc from 'fast-check';
import knex, { Knex } from 'knex';
import { BaseRepository, SoftDeletableEntity, CascadeConfig } from '../../src/database/base-repository';

// ============================================================================
// Test Interfaces
// ============================================================================

interface UserEntity extends SoftDeletableEntity {
  id: number;
  name: string;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Post and Comment tables are used in the test DB schema but we only
// interact with them via raw knex queries, so no typed interface needed.

// ============================================================================
// Test Setup
// ============================================================================

describe('BaseRepository Property Tests', () => {
  let db: Knex;

  beforeAll(async () => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });

    // Create users table (parent entity)
    await db.schema.createTable('users', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.datetime('deleted_at').nullable();
      table.timestamps(true, true);
    });

    // Create posts table (child of users)
    await db.schema.createTable('posts', (table) => {
      table.increments('id').primary();
      table.integer('user_id').notNullable().references('id').inTable('users');
      table.string('content').notNullable();
      table.datetime('deleted_at').nullable();
      table.timestamps(true, true);
    });

    // Create comments table (child of posts and users)
    await db.schema.createTable('comments', (table) => {
      table.increments('id').primary();
      table.integer('post_id').notNullable().references('id').inTable('posts');
      table.integer('user_id').notNullable().references('id').inTable('users');
      table.string('content').notNullable();
      table.datetime('deleted_at').nullable();
      table.timestamps(true, true);
    });
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    // Disable foreign key checks for truncation in SQLite
    await db.raw('PRAGMA foreign_keys = OFF');
    await db('comments').truncate();
    await db('posts').truncate();
    await db('users').truncate();
    await db.raw('PRAGMA foreign_keys = ON');
  });

  // ============================================================================
  // Property 35: Soft-delete cascade and exclusion
  // ============================================================================

  /**
   * **Validates: Requirements 13.4, 13.5**
   *
   * Property 35: Soft-delete cascade and exclusion
   * For any entity that is soft-deleted, the system SHALL set deleted_at to the
   * current timestamp, cascade the soft-delete to all owned content, and exclude
   * soft-deleted records from standard queries unless explicitly requested with
   * include-deleted parameter.
   */
  describe('Property 35: Soft-delete cascade and exclusion', () => {
    it('should set deleted_at timestamp on soft-deleted entity and cascade to all owned content', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a tree: 1 user with 1-5 posts, each post with 0-3 comments
          fc.record({
            userName: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
            posts: fc.array(
              fc.record({
                content: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
                commentCount: fc.integer({ min: 0, max: 3 }),
              }),
              { minLength: 1, maxLength: 5 }
            ),
          }),
          async ({ userName, posts }) => {
            // Clean up before each iteration
            await db.raw('PRAGMA foreign_keys = OFF');
            await db('comments').truncate();
            await db('posts').truncate();
            await db('users').truncate();
            await db.raw('PRAGMA foreign_keys = ON');

            // Set up cascading repository for users -> posts
            const userCascades: CascadeConfig[] = [
              { table: 'posts', foreignKey: 'user_id' },
              { table: 'comments', foreignKey: 'user_id' },
            ];
            const userRepo = new BaseRepository<UserEntity>('users', { db, cascades: userCascades });

            // Create user
            const userId = await userRepo.create({ name: userName } as any);

            // Create posts for the user
            for (const post of posts) {
              const result = await db('posts').insert({
                user_id: userId,
                content: post.content,
              });
              const currentPostId = result[0] as number;

              // Create comments for each post
              for (let c = 0; c < post.commentCount; c++) {
                await db('comments').insert({
                  post_id: currentPostId,
                  user_id: userId,
                  content: `Comment ${c}`,
                });
              }
            }

            // Soft-delete the user
            const affected = await userRepo.softDelete(userId);
            expect(affected).toBe(1);

            // Verify: user has deleted_at set
            const user = await db('users').where('id', userId).first();
            expect(user.deleted_at).not.toBeNull();

            // Verify: all posts owned by user have deleted_at set
            const userPosts = await db('posts').where('user_id', userId);
            for (const post of userPosts) {
              expect(post.deleted_at).not.toBeNull();
            }

            // Verify: all comments owned by user have deleted_at set
            const userComments = await db('comments').where('user_id', userId);
            for (const comment of userComments) {
              expect(comment.deleted_at).not.toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should exclude soft-deleted records from standard queries', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a mix of entities, some to be deleted
          fc.record({
            totalUsers: fc.integer({ min: 2, max: 10 }),
            deleteIndices: fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 5 }),
          }),
          async ({ totalUsers, deleteIndices }) => {
            // Clean up
            await db.raw('PRAGMA foreign_keys = OFF');
            await db('comments').truncate();
            await db('posts').truncate();
            await db('users').truncate();
            await db.raw('PRAGMA foreign_keys = ON');

            const userRepo = new BaseRepository<UserEntity>('users', { db });

            // Create users
            const userIds: number[] = [];
            for (let i = 0; i < totalUsers; i++) {
              const id = await userRepo.create({ name: `User ${i}` } as any);
              userIds.push(id);
            }

            // Soft-delete some users (normalize indices to valid range)
            const indicesToDelete = [...new Set(deleteIndices.map((i) => Math.abs(i) % totalUsers))];
            for (const idx of indicesToDelete) {
              await userRepo.softDelete(userIds[idx]!);
            }

            const expectedActive = totalUsers - indicesToDelete.length;

            // Standard query should exclude soft-deleted records
            const activeUsers = await userRepo.findAll();
            expect(activeUsers.length).toBe(expectedActive);

            // Verify none of the returned records have deleted_at set
            for (const user of activeUsers) {
              expect(user.deleted_at).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include soft-deleted records when include-deleted parameter is set', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            totalUsers: fc.integer({ min: 2, max: 10 }),
            deleteCount: fc.integer({ min: 1, max: 5 }),
          }),
          async ({ totalUsers, deleteCount }) => {
            // Clean up
            await db.raw('PRAGMA foreign_keys = OFF');
            await db('comments').truncate();
            await db('posts').truncate();
            await db('users').truncate();
            await db.raw('PRAGMA foreign_keys = ON');

            const userRepo = new BaseRepository<UserEntity>('users', { db });

            // Create users
            for (let i = 0; i < totalUsers; i++) {
              await userRepo.create({ name: `User ${i}` } as any);
            }

            // Soft-delete some (capped to totalUsers)
            const actualDeleteCount = Math.min(deleteCount, totalUsers);
            for (let i = 1; i <= actualDeleteCount; i++) {
              await userRepo.softDelete(i);
            }

            // With includeDeleted, should return ALL records
            const allUsers = await userRepo.findAll({}, { includeDeleted: true });
            expect(allUsers.length).toBe(totalUsers);

            // Without includeDeleted, should exclude deleted
            const activeUsers = await userRepo.findAll();
            expect(activeUsers.length).toBe(totalUsers - actualDeleteCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve referential links after cascade for audit/restore', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            postCount: fc.integer({ min: 1, max: 5 }),
          }),
          async ({ postCount }) => {
            // Clean up
            await db.raw('PRAGMA foreign_keys = OFF');
            await db('comments').truncate();
            await db('posts').truncate();
            await db('users').truncate();
            await db.raw('PRAGMA foreign_keys = ON');

            const userCascades: CascadeConfig[] = [
              { table: 'posts', foreignKey: 'user_id' },
            ];
            const userRepo = new BaseRepository<UserEntity>('users', { db, cascades: userCascades });

            // Create user with posts
            const userId = await userRepo.create({ name: 'TestUser' } as any);
            for (let i = 0; i < postCount; i++) {
              await db('posts').insert({ user_id: userId, content: `Post ${i}` });
            }

            // Soft-delete user (cascades to posts)
            await userRepo.softDelete(userId);

            // Verify referential links are preserved (foreign keys still intact)
            const posts = await db('posts').where('user_id', userId);
            expect(posts.length).toBe(postCount);
            for (const post of posts) {
              expect(post.user_id).toBe(userId);
              expect(post.deleted_at).not.toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================================================
  // Property 10: Cursor-based pagination correctness
  // ============================================================================

  /**
   * **Validates: Requirements 3.8**
   *
   * Property 10: Cursor-based pagination correctness
   * For any paginated connection request, the system SHALL return at most the
   * requested page size (default 20, max 50), provide a valid cursor for the
   * next page, and guarantee that iterating through all pages produces no
   * duplicates and no missing items.
   */
  describe('Property 10: Cursor-based pagination correctness', () => {
    it('should return at most the requested page size (default 20, max 50)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            datasetSize: fc.integer({ min: 1, max: 80 }),
            requestedLimit: fc.integer({ min: -10, max: 200 }),
          }),
          async ({ datasetSize, requestedLimit }) => {
            // Clean up
            await db.raw('PRAGMA foreign_keys = OFF');
            await db('comments').truncate();
            await db('posts').truncate();
            await db('users').truncate();
            await db.raw('PRAGMA foreign_keys = ON');

            const userRepo = new BaseRepository<UserEntity>('users', { db });

            // Insert dataset
            for (let i = 0; i < datasetSize; i++) {
              await userRepo.create({ name: `User ${i}` } as any);
            }

            // Request with arbitrary limit
            const result = await userRepo.findPaginated({ limit: requestedLimit });

            // Effective limit should be clamped: min 1, max 50, default 20
            const effectiveLimit = Math.min(Math.max(requestedLimit, 1), 50);
            const expectedSize = Math.min(datasetSize, effectiveLimit);

            expect(result.data.length).toBe(expectedSize);
            expect(result.data.length).toBeLessThanOrEqual(50);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should default to page size of 20 when no limit is specified', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 21, max: 80 }),
          async (datasetSize) => {
            // Clean up
            await db.raw('PRAGMA foreign_keys = OFF');
            await db('comments').truncate();
            await db('posts').truncate();
            await db('users').truncate();
            await db.raw('PRAGMA foreign_keys = ON');

            const userRepo = new BaseRepository<UserEntity>('users', { db });

            for (let i = 0; i < datasetSize; i++) {
              await userRepo.create({ name: `User ${i}` } as any);
            }

            // No limit specified - should default to 20
            const result = await userRepo.findPaginated();
            expect(result.data.length).toBe(20);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce no duplicates when iterating through all pages', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            datasetSize: fc.integer({ min: 1, max: 70 }),
            pageSize: fc.integer({ min: 1, max: 50 }),
          }),
          async ({ datasetSize, pageSize }) => {
            // Clean up
            await db.raw('PRAGMA foreign_keys = OFF');
            await db('comments').truncate();
            await db('posts').truncate();
            await db('users').truncate();
            await db.raw('PRAGMA foreign_keys = ON');

            const userRepo = new BaseRepository<UserEntity>('users', { db });

            for (let i = 0; i < datasetSize; i++) {
              await userRepo.create({ name: `User ${i}` } as any);
            }

            // Iterate through all pages
            const allIds: number[] = [];
            let cursor: string | null = null;
            let hasMore = true;
            let pageCount = 0;
            const maxPages = Math.ceil(datasetSize / pageSize) + 1;

            while (hasMore && pageCount < maxPages) {
              const result = await userRepo.findPaginated({ cursor, limit: pageSize });
              allIds.push(...result.data.map((r) => r.id));
              cursor = result.cursor;
              hasMore = result.hasMore;
              pageCount++;
            }

            // No duplicates
            const uniqueIds = new Set(allIds);
            expect(uniqueIds.size).toBe(allIds.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce no missing items when iterating through all pages', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            datasetSize: fc.integer({ min: 1, max: 70 }),
            pageSize: fc.integer({ min: 1, max: 50 }),
          }),
          async ({ datasetSize, pageSize }) => {
            // Clean up
            await db.raw('PRAGMA foreign_keys = OFF');
            await db('comments').truncate();
            await db('posts').truncate();
            await db('users').truncate();
            await db.raw('PRAGMA foreign_keys = ON');

            const userRepo = new BaseRepository<UserEntity>('users', { db });

            for (let i = 0; i < datasetSize; i++) {
              await userRepo.create({ name: `User ${i}` } as any);
            }

            // Iterate through all pages
            const allIds: number[] = [];
            let cursor: string | null = null;
            let hasMore = true;
            let pageCount = 0;
            const maxPages = Math.ceil(datasetSize / pageSize) + 1;

            while (hasMore && pageCount < maxPages) {
              const result = await userRepo.findPaginated({ cursor, limit: pageSize });
              allIds.push(...result.data.map((r) => r.id));
              cursor = result.cursor;
              hasMore = result.hasMore;
              pageCount++;
            }

            // No missing items - all records should be returned
            expect(allIds.length).toBe(datasetSize);

            // All IDs from 1 to datasetSize should be present
            const sortedIds = [...allIds].sort((a, b) => a - b);
            for (let i = 0; i < datasetSize; i++) {
              expect(sortedIds[i]).toBe(i + 1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should provide a valid cursor for the next page when more data exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            datasetSize: fc.integer({ min: 2, max: 60 }),
            pageSize: fc.integer({ min: 1, max: 50 }),
          }),
          async ({ datasetSize, pageSize }) => {
            // Clean up
            await db.raw('PRAGMA foreign_keys = OFF');
            await db('comments').truncate();
            await db('posts').truncate();
            await db('users').truncate();
            await db.raw('PRAGMA foreign_keys = ON');

            const userRepo = new BaseRepository<UserEntity>('users', { db });

            for (let i = 0; i < datasetSize; i++) {
              await userRepo.create({ name: `User ${i}` } as any);
            }

            const result = await userRepo.findPaginated({ limit: pageSize });

            if (datasetSize > pageSize) {
              // More data exists - cursor should be non-null and hasMore true
              expect(result.hasMore).toBe(true);
              expect(result.cursor).not.toBeNull();
              // Cursor should be a valid numeric string (the last ID in the page)
              expect(parseInt(result.cursor!, 10)).not.toBeNaN();
              expect(parseInt(result.cursor!, 10)).toBe(result.data[result.data.length - 1]!.id);
            } else {
              // All data fits in one page - no more pages
              expect(result.hasMore).toBe(false);
              expect(result.cursor).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly paginate with soft-deleted records excluded', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            datasetSize: fc.integer({ min: 5, max: 50 }),
            deleteCount: fc.integer({ min: 1, max: 10 }),
            pageSize: fc.integer({ min: 1, max: 20 }),
          }),
          async ({ datasetSize, deleteCount, pageSize }) => {
            // Clean up
            await db.raw('PRAGMA foreign_keys = OFF');
            await db('comments').truncate();
            await db('posts').truncate();
            await db('users').truncate();
            await db.raw('PRAGMA foreign_keys = ON');

            const userRepo = new BaseRepository<UserEntity>('users', { db });

            for (let i = 0; i < datasetSize; i++) {
              await userRepo.create({ name: `User ${i}` } as any);
            }

            // Soft-delete some records (capped to dataset size)
            const actualDeleteCount = Math.min(deleteCount, datasetSize - 1);
            const deletedIds = new Set<number>();
            for (let i = 1; i <= actualDeleteCount; i++) {
              await userRepo.softDelete(i);
              deletedIds.add(i);
            }

            const expectedActive = datasetSize - actualDeleteCount;

            // Iterate through all pages
            const allIds: number[] = [];
            let cursor: string | null = null;
            let hasMore = true;
            let pageCount = 0;
            const maxPages = Math.ceil(datasetSize / pageSize) + 1;

            while (hasMore && pageCount < maxPages) {
              const result = await userRepo.findPaginated({ cursor, limit: pageSize });
              allIds.push(...result.data.map((r) => r.id));
              cursor = result.cursor;
              hasMore = result.hasMore;
              pageCount++;
            }

            // Should return only active records
            expect(allIds.length).toBe(expectedActive);

            // No deleted IDs should appear
            for (const id of allIds) {
              expect(deletedIds.has(id)).toBe(false);
            }

            // No duplicates
            const uniqueIds = new Set(allIds);
            expect(uniqueIds.size).toBe(allIds.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
