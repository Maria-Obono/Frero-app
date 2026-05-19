import * as fc from 'fast-check';
import { PostService, INotificationTrigger } from '../../src/services/post/post.service';
import {
  EngagementService,
  IEngagementNotificationTrigger,
  IRedisCache,
} from '../../src/services/post/engagement.service';
import {
  PostType,
  PostPrivacy,
  PostServiceError,
  MAX_HASHTAGS_PER_POST,
  MAX_MENTIONS_PER_POST,
  MAX_REEL_SIZE,
  STORY_EXPIRATION_MS,
  StoryMediaType,
  LikeableType,
  Post,
  Comment,
  Story,
  Bookmark,
  Like,
} from '../../src/services/post/types';

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockRepository() {
  let postIdCounter = 1;
  let reelIdCounter = 1;
  let storyIdCounter = 1;
  let commentIdCounter = 1;
  let likeIdCounter = 1;
  let bookmarkIdCounter = 1;
  let shareIdCounter = 1;
  let hashtagIdCounter = 1;

  const posts = new Map<number, Post>();
  const postMedia = new Map<number, any[]>();
  const hashtags = new Map<string, number>();
  const postHashtags = new Map<number, string[]>();
  const reels = new Map<number, any>();
  const stories = new Map<number, Story>();
  const storyViews = new Map<number, Set<number>>();
  const likes = new Map<string, Like>();
  const comments = new Map<number, Comment>();
  const bookmarks = new Map<string, Bookmark>();
  const shares = new Map<string, any>();

  return {
    // State accessors for assertions
    _posts: posts,
    _postMedia: postMedia,
    _hashtags: hashtags,
    _postHashtags: postHashtags,
    _stories: stories,
    _storyViews: storyViews,
    _likes: likes,
    _comments: comments,
    _bookmarks: bookmarks,
    _shares: shares,

    create: jest.fn(async (data: any) => {
      const id = postIdCounter++;
      const post: Post = {
        id,
        user_id: data.user_id,
        type: data.type,
        content: data.content,
        privacy: data.privacy,
        like_count: 0,
        comment_count: 0,
        share_count: 0,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      posts.set(id, post);
      return id;
    }),

    findById: jest.fn(async (id: number) => {
      return posts.get(id) || undefined;
    }),

    createPostMedia: jest.fn(async (data: any) => {
      const existing = postMedia.get(data.post_id) || [];
      existing.push(data);
      postMedia.set(data.post_id, existing);
      return existing.length;
    }),

    getPostMedia: jest.fn(async (postId: number) => {
      const media = postMedia.get(postId) || [];
      return media.sort((a: any, b: any) => a.order_index - b.order_index);
    }),

    findOrCreateHashtag: jest.fn(async (name: string) => {
      if (hashtags.has(name)) {
        return hashtags.get(name)!;
      }
      const id = hashtagIdCounter++;
      hashtags.set(name, id);
      return id;
    }),

    createPostHashtag: jest.fn(async (postId: number, hashtagId: number) => {
      const existing = postHashtags.get(postId) || [];
      const name = [...hashtags.entries()].find(([, v]) => v === hashtagId)?.[0] || '';
      existing.push(name);
      postHashtags.set(postId, existing);
    }),

    getPostHashtags: jest.fn(async (postId: number) => {
      return postHashtags.get(postId) || [];
    }),

    createReel: jest.fn(async (data: any) => {
      const id = reelIdCounter++;
      reels.set(id, {
        id,
        ...data,
        like_count: 0,
        comment_count: 0,
        share_count: 0,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
      return id;
    }),

    findReelById: jest.fn(async (id: number) => {
      return reels.get(id) || undefined;
    }),

    createStory: jest.fn(async (data: any) => {
      const id = storyIdCounter++;
      const story: Story = {
        id,
        user_id: data.user_id,
        media_url: data.media_url,
        media_type: data.media_type,
        expires_at: data.expires_at,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      stories.set(id, story);
      storyViews.set(id, new Set());
      return id;
    }),

    findStoryById: jest.fn(async (id: number) => {
      return stories.get(id) || undefined;
    }),

    getActiveStories: jest.fn(async (userId: number) => {
      const now = new Date();
      return [...stories.values()].filter(
        (s) => s.user_id === userId && new Date(s.expires_at) > now && !s.deleted_at
      );
    }),

    getActiveStoriesForUsers: jest.fn(async (userIds: number[]) => {
      const now = new Date();
      return [...stories.values()].filter(
        (s) => userIds.includes(s.user_id) && new Date(s.expires_at) > now && !s.deleted_at
      );
    }),

    recordStoryView: jest.fn(async (storyId: number, viewerId: number) => {
      const views = storyViews.get(storyId);
      if (!views) return false;
      if (views.has(viewerId)) return false;
      views.add(viewerId);
      return true;
    }),

    getStoryViewers: jest.fn(async (storyId: number) => {
      const views = storyViews.get(storyId);
      if (!views) return [];
      return [...views].map((viewerId) => ({
        id: viewerId,
        story_id: storyId,
        viewer_id: viewerId,
        created_at: new Date(),
      }));
    }),

    findLike: jest.fn(async (userId: number, likeableId: number, likeableType: LikeableType) => {
      const key = `${userId}:${likeableId}:${likeableType}`;
      return likes.get(key) || undefined;
    }),

    createLike: jest.fn(async (userId: number, likeableId: number, likeableType: LikeableType) => {
      const id = likeIdCounter++;
      const key = `${userId}:${likeableId}:${likeableType}`;
      likes.set(key, {
        id,
        user_id: userId,
        likeable_id: likeableId,
        likeable_type: likeableType,
        created_at: new Date(),
      });
      return id;
    }),

    deleteLike: jest.fn(async (userId: number, likeableId: number, likeableType: LikeableType) => {
      const key = `${userId}:${likeableId}:${likeableType}`;
      likes.delete(key);
      return 1;
    }),

    incrementLikeCount: jest.fn(async (postId: number) => {
      const post = posts.get(postId);
      if (post) post.like_count++;
    }),

    decrementLikeCount: jest.fn(async (postId: number) => {
      const post = posts.get(postId);
      if (post) post.like_count--;
    }),

    createComment: jest.fn(async (data: any) => {
      const id = commentIdCounter++;
      const comment: Comment = {
        id,
        post_id: data.post_id,
        user_id: data.user_id,
        parent_comment_id: data.parent_comment_id,
        content: data.content,
        depth: data.depth,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      comments.set(id, comment);
      return id;
    }),

    findCommentById: jest.fn(async (commentId: number) => {
      return comments.get(commentId) || undefined;
    }),

    incrementCommentCount: jest.fn(async (postId: number) => {
      const post = posts.get(postId);
      if (post) post.comment_count++;
    }),

    createShare: jest.fn(async (userId: number, postId: number) => {
      const id = shareIdCounter++;
      const key = `${userId}:${postId}:${id}`;
      shares.set(key, { id, user_id: userId, post_id: postId, created_at: new Date() });
      return id;
    }),

    incrementShareCount: jest.fn(async (postId: number) => {
      const post = posts.get(postId);
      if (post) post.share_count++;
    }),

    findBookmark: jest.fn(async (userId: number, postId: number) => {
      const key = `${userId}:${postId}`;
      return bookmarks.get(key) || undefined;
    }),

    createBookmark: jest.fn(async (userId: number, postId: number) => {
      const id = bookmarkIdCounter++;
      const key = `${userId}:${postId}`;
      bookmarks.set(key, {
        id,
        user_id: userId,
        post_id: postId,
        created_at: new Date(),
      });
      return id;
    }),

    deleteBookmark: jest.fn(async (userId: number, postId: number) => {
      const key = `${userId}:${postId}`;
      bookmarks.delete(key);
      return 1;
    }),
  };
}

function createMockNotificationTrigger(): INotificationTrigger & { calls: any[] } {
  const calls: any[] = [];
  return {
    calls,
    notifyMention: jest.fn(async (postId, postAuthorId, mentionedUsername) => {
      calls.push({ type: 'mention', postId, postAuthorId, mentionedUsername });
    }),
  };
}

function createMockEngagementNotificationTrigger(): IEngagementNotificationTrigger & { calls: any[] } {
  const calls: any[] = [];
  return {
    calls,
    notifyLike: jest.fn(async (postId, postOwnerId, likerId) => {
      calls.push({ type: 'like', postId, postOwnerId, likerId });
    }),
    notifyComment: jest.fn(async (postId, postOwnerId, commenterId, commentId) => {
      calls.push({ type: 'comment', postId, postOwnerId, commenterId, commentId });
    }),
    notifyReply: jest.fn(async (parentCommentId, parentCommentAuthorId, replierId, replyId) => {
      calls.push({ type: 'reply', parentCommentId, parentCommentAuthorId, replierId, replyId });
    }),
    notifyShare: jest.fn(async (postId, postOwnerId, sharerId) => {
      calls.push({ type: 'share', postId, postOwnerId, sharerId });
    }),
  };
}

function createMockRedisCache(): IRedisCache {
  const store = new Map<string, string>();
  return {
    get: jest.fn(async (key: string) => store.get(key) || null),
    set: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
    setex: jest.fn(async (key: string, _ttl: number, value: string) => { store.set(key, value); }),
    del: jest.fn(async (key: string) => { store.delete(key); return 1; }),
  };
}

// ============================================================================
// Generators
// ============================================================================

/** Generate valid post content (1-5000 chars) */
const validContentArb = fc.string({ minLength: 1, maxLength: 5000 }).filter((s) => s.length >= 1);

/** Generate content that is too long (>5000 chars) */
const tooLongContentArb = fc.string({ minLength: 5001, maxLength: 6000 });

/** Generate a valid carousel item count (2-10) */
const validCarouselCountArb = fc.integer({ min: 2, max: 10 });

/** Generate an invalid carousel item count (<2 or >10) */
const invalidCarouselCountArb = fc.oneof(
  fc.integer({ min: 0, max: 1 }),
  fc.integer({ min: 11, max: 20 })
);



/** Generate a valid reel duration (1-90 seconds) */
const validReelDurationArb = fc.integer({ min: 1, max: 90 });

/** Generate an invalid reel duration (<1 or >90) */
const invalidReelDurationArb = fc.oneof(
  fc.integer({ min: -100, max: 0 }),
  fc.integer({ min: 91, max: 300 })
);

/** Generate valid comment content (1-2000 chars) */
const validCommentContentArb = fc.string({ minLength: 1, maxLength: 2000 }).filter((s) => s.length >= 1);

/** Generate invalid comment content (empty or >2000 chars) */
const tooLongCommentContentArb = fc.string({ minLength: 2001, maxLength: 3000 });

/** Generate a user ID */
const userIdArb = fc.integer({ min: 1, max: 100000 });



// ============================================================================
// Property 12: Post content length validation
// ============================================================================

/**
 * **Validates: Requirements 4.4-4.9**
 *
 * Property 12: Post content length validation
 * For any text content, the Post_Service SHALL accept posts with content between
 * 1 and 5000 characters and reject posts with empty content or content exceeding
 * 5000 characters.
 */
describe('Property 12: Post content length validation', () => {
  it('should accept text posts with content between 1 and 5000 characters', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, validContentArb, async (userId, content) => {
        const repo = createMockRepository();
        const service = new PostService({ repository: repo as any });

        const result = await service.createPost(userId, {
          type: PostType.TEXT,
          content,
          privacy: PostPrivacy.PUBLIC,
        });

        expect(result).toBeDefined();
        expect(result.content).toBe(content);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject text posts with empty content', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const repo = createMockRepository();
        const service = new PostService({ repository: repo as any });

        await expect(
          service.createPost(userId, {
            type: PostType.TEXT,
            content: '',
            privacy: PostPrivacy.PUBLIC,
          })
        ).rejects.toThrow(PostServiceError);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject text posts with content exceeding 5000 characters', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, tooLongContentArb, async (userId, content) => {
        const repo = createMockRepository();
        const service = new PostService({ repository: repo as any });

        await expect(
          service.createPost(userId, {
            type: PostType.TEXT,
            content,
            privacy: PostPrivacy.PUBLIC,
          })
        ).rejects.toThrow(PostServiceError);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject text posts with undefined content', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const repo = createMockRepository();
        const service = new PostService({ repository: repo as any });

        await expect(
          service.createPost(userId, {
            type: PostType.TEXT,
            content: undefined,
            privacy: PostPrivacy.PUBLIC,
          })
        ).rejects.toThrow(PostServiceError);
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 13: Carousel item count validation
// ============================================================================

/**
 * **Validates: Requirements 4.9**
 *
 * Property 13: Carousel item count validation
 * Accept 2-10 items, reject <2 or >10.
 */
describe('Property 13: Carousel item count validation', () => {
  it('should accept carousel posts with 2-10 media items', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, validCarouselCountArb, async (userId, count) => {
        const repo = createMockRepository();
        const service = new PostService({ repository: repo as any });

        const media = Array.from({ length: count }, (_, i) => ({
          file: Buffer.alloc(100),
          mimeType: 'image/jpeg',
          filename: `image${i}.jpg`,
        }));

        const result = await service.createPost(userId, {
          type: PostType.CAROUSEL,
          content: 'carousel post',
          privacy: PostPrivacy.PUBLIC,
          media,
        });

        expect(result).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  it('should reject carousel posts with fewer than 2 or more than 10 items', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, invalidCarouselCountArb, async (userId, count) => {
        const repo = createMockRepository();
        const service = new PostService({ repository: repo as any });

        const media = Array.from({ length: count }, (_, i) => ({
          file: Buffer.alloc(100),
          mimeType: 'image/jpeg',
          filename: `image${i}.jpg`,
        }));

        await expect(
          service.createPost(userId, {
            type: PostType.CAROUSEL,
            content: 'carousel post',
            privacy: PostPrivacy.PUBLIC,
            media,
          })
        ).rejects.toThrow(PostServiceError);
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 14: Hashtag extraction and indexing
// ============================================================================

/**
 * **Validates: Requirements 4.5**
 *
 * Property 14: Hashtag extraction and indexing
 * Extract and index all hashtags up to max 30, preserving text without # prefix.
 */
describe('Property 14: Hashtag extraction and indexing', () => {
  it('should extract hashtags from content without the # prefix', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{1,10}$/), { minLength: 1, maxLength: 10 }),
        (tags) => {
          const service = new PostService({ repository: createMockRepository() as any });
          const content = tags.map((t) => `#${t}`).join(' some text ');
          const extracted = service.extractHashtags(content);

          // All extracted tags should not have # prefix
          for (const tag of extracted) {
            expect(tag).not.toContain('#');
          }

          // All unique tags should be present (lowercased)
          const uniqueTags = [...new Set(tags.map((t) => t.toLowerCase()))];
          for (const tag of uniqueTags.slice(0, MAX_HASHTAGS_PER_POST)) {
            expect(extracted).toContain(tag);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should limit extracted hashtags to maximum 30', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{1,8}$/), { minLength: 31, maxLength: 50 }),
        (tags) => {
          // Ensure all tags are unique
          const uniqueTags = [...new Set(tags)];
          fc.pre(uniqueTags.length > 30);

          const service = new PostService({ repository: createMockRepository() as any });
          const content = uniqueTags.map((t) => `#${t}`).join(' ');
          const extracted = service.extractHashtags(content);

          expect(extracted.length).toBeLessThanOrEqual(MAX_HASHTAGS_PER_POST);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return empty array for content without hashtags', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }).filter((s) => !s.includes('#')),
        (content) => {
          const service = new PostService({ repository: createMockRepository() as any });
          const extracted = service.extractHashtags(content);
          expect(extracted).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should deduplicate hashtags (case-insensitive)', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,8}$/),
        (tag) => {
          const service = new PostService({ repository: createMockRepository() as any });
          const content = `#${tag} #${tag.toUpperCase()} #${tag.toLowerCase()}`;
          const extracted = service.extractHashtags(content);
          expect(extracted.length).toBe(1);
          expect(extracted[0]).toBe(tag.toLowerCase());
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 15: Mention extraction and notification
// ============================================================================

/**
 * **Validates: Requirements 4.6**
 *
 * Property 15: Mention extraction and notification
 * Identify and notify each mentioned user up to max 20.
 */
describe('Property 15: Mention extraction and notification', () => {
  it('should extract mentions from content and notify each mentioned user', () => {
    return fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.array(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,10}$/), { minLength: 1, maxLength: 5 }),
        async (userId, usernames) => {
          const repo = createMockRepository();
          const notifTrigger = createMockNotificationTrigger();
          const service = new PostService({
            repository: repo as any,
            notificationTrigger: notifTrigger,
          });

          const uniqueUsernames = [...new Set(usernames.map((u) => u.toLowerCase()))];
          const content = uniqueUsernames.map((u) => `@${u}`).join(' hello ');

          await service.createPost(userId, {
            type: PostType.TEXT,
            content,
            privacy: PostPrivacy.PUBLIC,
          });

          // Each unique mention should trigger a notification
          expect(notifTrigger.calls.length).toBe(uniqueUsernames.length);
          for (const username of uniqueUsernames) {
            expect(
              notifTrigger.calls.some((c) => c.mentionedUsername === username)
            ).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should limit mentions to maximum 20', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,8}$/), { minLength: 21, maxLength: 30 }),
        (usernames) => {
          const uniqueUsernames = [...new Set(usernames)];
          fc.pre(uniqueUsernames.length > 20);

          const service = new PostService({ repository: createMockRepository() as any });
          const content = uniqueUsernames.map((u) => `@${u}`).join(' ');
          const extracted = service.extractMentions(content);

          expect(extracted.length).toBeLessThanOrEqual(MAX_MENTIONS_PER_POST);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 16: Post privacy enforcement
// ============================================================================

/**
 * **Validates: Requirements 4.7**
 *
 * Property 16: Post privacy enforcement
 * Public visible to all, friends-only to friends/owner, private to owner only.
 */
describe('Property 16: Post privacy enforcement', () => {
  it('should create posts with the specified privacy setting', () => {
    return fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.constantFrom(PostPrivacy.PUBLIC, PostPrivacy.FRIENDS, PostPrivacy.PRIVATE),
        validContentArb,
        async (userId, privacy, content) => {
          const repo = createMockRepository();
          const service = new PostService({ repository: repo as any });

          const result = await service.createPost(userId, {
            type: PostType.TEXT,
            content,
            privacy,
          });

          expect(result.privacy).toBe(privacy);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should persist the privacy setting correctly in the repository', () => {
    return fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.constantFrom(PostPrivacy.PUBLIC, PostPrivacy.FRIENDS, PostPrivacy.PRIVATE),
        async (userId, privacy) => {
          const repo = createMockRepository();
          const service = new PostService({ repository: repo as any });

          const result = await service.createPost(userId, {
            type: PostType.TEXT,
            content: 'test content',
            privacy,
          });

          const storedPost = repo._posts.get(result.id);
          expect(storedPost).toBeDefined();
          expect(storedPost!.privacy).toBe(privacy);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 17: Carousel media order preservation
// ============================================================================

/**
 * **Validates: Requirements 4.4**
 *
 * Property 17: Carousel media order preservation
 * Retrieving carousel returns media in same order submitted.
 */
describe('Property 17: Carousel media order preservation', () => {
  it('should preserve media order in carousel posts', () => {
    return fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 2, max: 10 }),
        async (userId, count) => {
          const repo = createMockRepository();
          const service = new PostService({ repository: repo as any });

          const media = Array.from({ length: count }, (_, i) => ({
            file: Buffer.alloc(100),
            mimeType: 'image/jpeg',
            filename: `image_${i}_unique.jpg`,
          }));

          await service.createPost(userId, {
            type: PostType.CAROUSEL,
            content: 'carousel',
            privacy: PostPrivacy.PUBLIC,
            media,
          });

          // Verify order_index was set correctly
          const calls = repo.createPostMedia.mock.calls;
          for (let i = 0; i < count; i++) {
            expect((calls[i] as any[])[0].order_index).toBe(i);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================================
// Property 18: Reel duration and size validation
// ============================================================================

/**
 * **Validates: Requirements 5.2, 5.3**
 *
 * Property 18: Reel duration and size validation
 * Accept 1-90s and ≤500MB, reject outside.
 */
describe('Property 18: Reel duration and size validation', () => {
  it('should accept reels with duration between 1 and 90 seconds', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, validReelDurationArb, async (userId, duration) => {
        const repo = createMockRepository();
        const service = new PostService({ repository: repo as any });

        const result = await service.createReel(userId, {
          file: Buffer.alloc(1000),
          mimeType: 'video/mp4',
          filename: 'reel.mp4',
          durationSeconds: duration,
        });

        expect(result).toBeDefined();
        expect(result.duration_seconds).toBe(duration);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject reels with duration outside 1-90 seconds', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, invalidReelDurationArb, async (userId, duration) => {
        const repo = createMockRepository();
        const service = new PostService({ repository: repo as any });

        await expect(
          service.createReel(userId, {
            file: Buffer.alloc(1000),
            mimeType: 'video/mp4',
            filename: 'reel.mp4',
            durationSeconds: duration,
          })
        ).rejects.toThrow(PostServiceError);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject reels exceeding 500MB file size', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const repo = createMockRepository();
        const service = new PostService({ repository: repo as any });

        // Create a buffer slightly over 500MB (we simulate with length check)
        const oversizedFile = Buffer.alloc(MAX_REEL_SIZE + 1);

        await expect(
          service.createReel(userId, {
            file: oversizedFile,
            mimeType: 'video/mp4',
            filename: 'reel.mp4',
            durationSeconds: 30,
          })
        ).rejects.toThrow(PostServiceError);
      }),
      { numRuns: 10 } // Fewer runs due to large buffer allocation
    );
  });
});

// ============================================================================
// Property 19: Story 24-hour expiration lifecycle
// ============================================================================

/**
 * **Validates: Requirements 5.4, 5.5**
 *
 * Property 19: Story 24-hour expiration lifecycle
 * Story expires after 24h, excluded from active queries.
 */
describe('Property 19: Story 24-hour expiration lifecycle', () => {
  it('should create stories with a 24-hour expiration timestamp', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const repo = createMockRepository();
        const service = new PostService({ repository: repo as any });

        const beforeCreation = Date.now();

        const result = await service.createStory(userId, {
          file: Buffer.alloc(100),
          mimeType: 'image/jpeg',
          filename: 'story.jpg',
          mediaType: StoryMediaType.IMAGE,
        });

        const afterCreation = Date.now();

        // The story should have an expiration ~24 hours from now
        const story = repo._stories.get(result.id)!;
        const expiresAtMs = new Date(story.expires_at).getTime();

        // Expiration should be within the 24-hour window (with small tolerance)
        expect(expiresAtMs).toBeGreaterThanOrEqual(beforeCreation + STORY_EXPIRATION_MS - 100);
        expect(expiresAtMs).toBeLessThanOrEqual(afterCreation + STORY_EXPIRATION_MS + 100);
      }),
      { numRuns: 100 }
    );
  });

  it('should exclude expired stories from active queries', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const repo = createMockRepository();
        const service = new PostService({ repository: repo as any });

        // Create a story that is already expired (manually set expires_at in the past)
        const storyId = await repo.createStory({
          user_id: userId,
          media_url: 'http://example.com/story.jpg',
          media_type: StoryMediaType.IMAGE,
          expires_at: new Date(Date.now() - 1000), // expired 1 second ago
        });

        const activeStories = await service.getActiveStories(userId);

        // The expired story should not be in active stories
        expect(activeStories.find((s) => s.id === storyId)).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it('should include non-expired stories in active queries', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const repo = createMockRepository();
        const service = new PostService({ repository: repo as any });

        // Create a story that expires in the future
        const storyId = await repo.createStory({
          user_id: userId,
          media_url: 'http://example.com/story.jpg',
          media_type: StoryMediaType.IMAGE,
          expires_at: new Date(Date.now() + STORY_EXPIRATION_MS),
        });

        const activeStories = await service.getActiveStories(userId);

        // The non-expired story should be in active stories
        expect(activeStories.find((s) => s.id === storyId)).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 20: Story view recording
// ============================================================================

/**
 * **Validates: Requirements 5.6**
 *
 * Property 20: Story view recording
 * Record views, prevent duplicates.
 */
describe('Property 20: Story view recording', () => {
  it('should record a view and prevent duplicate views from the same viewer', () => {
    return fc.assert(
      fc.asyncProperty(
        userIdArb,
        userIdArb.filter((id) => id > 1000), // ensure different from owner
        async (ownerId, viewerId) => {
          fc.pre(ownerId !== viewerId);

          const repo = createMockRepository();
          const service = new PostService({ repository: repo as any });

          // Create a non-expired story
          const storyId = await repo.createStory({
            user_id: ownerId,
            media_url: 'http://example.com/story.jpg',
            media_type: StoryMediaType.IMAGE,
            expires_at: new Date(Date.now() + STORY_EXPIRATION_MS),
          });

          // First view should succeed
          const firstView = await service.recordStoryView(storyId, viewerId);
          expect(firstView).toBe(true);

          // Second view from same viewer should return false (duplicate)
          const secondView = await service.recordStoryView(storyId, viewerId);
          expect(secondView).toBe(false);

          // Verify only one view is recorded
          const views = repo._storyViews.get(storyId)!;
          expect(views.size).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not record self-views', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const repo = createMockRepository();
        const service = new PostService({ repository: repo as any });

        const storyId = await repo.createStory({
          user_id: userId,
          media_url: 'http://example.com/story.jpg',
          media_type: StoryMediaType.IMAGE,
          expires_at: new Date(Date.now() + STORY_EXPIRATION_MS),
        });

        // Self-view should return false
        const result = await service.recordStoryView(storyId, userId);
        expect(result).toBe(false);

        // No view should be recorded
        const views = repo._storyViews.get(storyId)!;
        expect(views.size).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 21: Like idempotency guard
// ============================================================================

/**
 * **Validates: Requirements 6.1, 6.2**
 *
 * Property 21: Like idempotency guard
 * One like per user per post, reject duplicates.
 */
describe('Property 21: Like idempotency guard', () => {
  it('should allow a user to like a post once and reject duplicate likes', () => {
    return fc.assert(
      fc.asyncProperty(
        userIdArb,
        userIdArb,
        async (postOwnerId, likerId) => {
          const repo = createMockRepository();
          const notifTrigger = createMockEngagementNotificationTrigger();
          const service = new EngagementService({
            repository: repo as any,
            notificationTrigger: notifTrigger,
          });

          // Create a post
          const postId = await repo.create({
            user_id: postOwnerId,
            type: PostType.TEXT,
            content: 'test post',
            privacy: PostPrivacy.PUBLIC,
          });

          // First like should succeed
          await service.likePost(postId, likerId);

          // Second like should throw
          await expect(service.likePost(postId, likerId)).rejects.toThrow(PostServiceError);

          // Like count should be 1
          const post = repo._posts.get(postId)!;
          expect(post.like_count).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 22: Comment length validation
// ============================================================================

/**
 * **Validates: Requirements 6.5, 6.6**
 *
 * Property 22: Comment length validation
 * Accept 1-2000 chars, reject outside.
 */
describe('Property 22: Comment length validation', () => {
  it('should accept comments with content between 1 and 2000 characters', () => {
    return fc.assert(
      fc.asyncProperty(
        userIdArb,
        userIdArb,
        validCommentContentArb,
        async (postOwnerId, commenterId, content) => {
          const repo = createMockRepository();
          const service = new EngagementService({ repository: repo as any });

          const postId = await repo.create({
            user_id: postOwnerId,
            type: PostType.TEXT,
            content: 'test post',
            privacy: PostPrivacy.PUBLIC,
          });

          const comment = await service.commentOnPost(postId, commenterId, { content });
          expect(comment).toBeDefined();
          expect(comment.content).toBe(content);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject comments with empty content', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, userIdArb, async (postOwnerId, commenterId) => {
        const repo = createMockRepository();
        const service = new EngagementService({ repository: repo as any });

        const postId = await repo.create({
          user_id: postOwnerId,
          type: PostType.TEXT,
          content: 'test post',
          privacy: PostPrivacy.PUBLIC,
        });

        await expect(
          service.commentOnPost(postId, commenterId, { content: '' })
        ).rejects.toThrow(PostServiceError);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject comments exceeding 2000 characters', () => {
    return fc.assert(
      fc.asyncProperty(
        userIdArb,
        userIdArb,
        tooLongCommentContentArb,
        async (postOwnerId, commenterId, content) => {
          const repo = createMockRepository();
          const service = new EngagementService({ repository: repo as any });

          const postId = await repo.create({
            user_id: postOwnerId,
            type: PostType.TEXT,
            content: 'test post',
            privacy: PostPrivacy.PUBLIC,
          });

          await expect(
            service.commentOnPost(postId, commenterId, { content })
          ).rejects.toThrow(PostServiceError);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 23: Comment nesting depth enforcement
// ============================================================================

/**
 * **Validates: Requirements 6.7, 6.8**
 *
 * Property 23: Comment nesting depth enforcement
 * Max depth 3.
 */
describe('Property 23: Comment nesting depth enforcement', () => {
  it('should allow replies up to depth 3 and reject beyond', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, userIdArb, async (postOwnerId, commenterId) => {
        const repo = createMockRepository();
        const service = new EngagementService({ repository: repo as any });

        const postId = await repo.create({
          user_id: postOwnerId,
          type: PostType.TEXT,
          content: 'test post',
          privacy: PostPrivacy.PUBLIC,
        });

        // Create top-level comment (depth 0)
        const comment0 = await service.commentOnPost(postId, commenterId, { content: 'level 0' });
        expect(comment0.depth).toBe(0);

        // Reply to create depth 1
        const comment1 = await service.replyToComment(comment0.id, commenterId, { content: 'level 1' });
        expect(comment1.depth).toBe(1);

        // Reply to create depth 2
        const comment2 = await service.replyToComment(comment1.id, commenterId, { content: 'level 2' });
        expect(comment2.depth).toBe(2);

        // Reply to create depth 3
        const comment3 = await service.replyToComment(comment2.id, commenterId, { content: 'level 3' });
        expect(comment3.depth).toBe(3);

        // Reply to depth 3 should be rejected (would be depth 4)
        await expect(
          service.replyToComment(comment3.id, commenterId, { content: 'level 4' })
        ).rejects.toThrow(PostServiceError);
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 24: Bookmark round-trip
// ============================================================================

/**
 * **Validates: Requirements 6.10, 6.11**
 *
 * Property 24: Bookmark round-trip
 * Bookmark then remove returns to original state.
 */
describe('Property 24: Bookmark round-trip', () => {
  it('should return to original state after bookmark and remove', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, userIdArb, async (postOwnerId, userId) => {
        const repo = createMockRepository();
        const service = new EngagementService({ repository: repo as any });

        const postId = await repo.create({
          user_id: postOwnerId,
          type: PostType.TEXT,
          content: 'test post',
          privacy: PostPrivacy.PUBLIC,
        });

        // Initially no bookmark
        const key = `${userId}:${postId}`;
        expect(repo._bookmarks.has(key)).toBe(false);

        // Bookmark the post
        await service.bookmarkPost(postId, userId);
        expect(repo._bookmarks.has(key)).toBe(true);

        // Remove the bookmark
        await service.removeBookmark(postId, userId);
        expect(repo._bookmarks.has(key)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject duplicate bookmarks', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, userIdArb, async (postOwnerId, userId) => {
        const repo = createMockRepository();
        const service = new EngagementService({ repository: repo as any });

        const postId = await repo.create({
          user_id: postOwnerId,
          type: PostType.TEXT,
          content: 'test post',
          privacy: PostPrivacy.PUBLIC,
        });

        // First bookmark should succeed
        await service.bookmarkPost(postId, userId);

        // Second bookmark should throw
        await expect(service.bookmarkPost(postId, userId)).rejects.toThrow(PostServiceError);
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 25: Self-engagement notification suppression
// ============================================================================

/**
 * **Validates: Requirements 6.15**
 *
 * Property 25: Self-engagement notification suppression
 * No notification when engaging with own content.
 */
describe('Property 25: Self-engagement notification suppression', () => {
  it('should not send notification when user likes their own post', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const repo = createMockRepository();
        const notifTrigger = createMockEngagementNotificationTrigger();
        const service = new EngagementService({
          repository: repo as any,
          notificationTrigger: notifTrigger,
        });

        const postId = await repo.create({
          user_id: userId,
          type: PostType.TEXT,
          content: 'my own post',
          privacy: PostPrivacy.PUBLIC,
        });

        await service.likePost(postId, userId);

        // No notification should be sent for self-engagement
        expect(notifTrigger.calls.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it('should not send notification when user comments on their own post', () => {
    return fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const repo = createMockRepository();
        const notifTrigger = createMockEngagementNotificationTrigger();
        const service = new EngagementService({
          repository: repo as any,
          notificationTrigger: notifTrigger,
        });

        const postId = await repo.create({
          user_id: userId,
          type: PostType.TEXT,
          content: 'my own post',
          privacy: PostPrivacy.PUBLIC,
        });

        await service.commentOnPost(postId, userId, { content: 'self comment' });

        // No notification should be sent for self-engagement
        expect(notifTrigger.calls.length).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it('should send notification when a different user engages with a post', () => {
    return fc.assert(
      fc.asyncProperty(
        userIdArb,
        userIdArb.filter((id) => id > 50000), // ensure different
        async (postOwnerId, engagerId) => {
          fc.pre(postOwnerId !== engagerId);

          const repo = createMockRepository();
          const notifTrigger = createMockEngagementNotificationTrigger();
          const service = new EngagementService({
            repository: repo as any,
            notificationTrigger: notifTrigger,
          });

          const postId = await repo.create({
            user_id: postOwnerId,
            type: PostType.TEXT,
            content: 'someone else post',
            privacy: PostPrivacy.PUBLIC,
          });

          await service.likePost(postId, engagerId);

          // Notification should be sent
          expect(notifTrigger.calls.length).toBe(1);
          expect(notifTrigger.calls[0].type).toBe('like');
          expect(notifTrigger.calls[0].postOwnerId).toBe(postOwnerId);
          expect(notifTrigger.calls[0].likerId).toBe(engagerId);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 26: Engagement counts accuracy
// ============================================================================

/**
 * **Validates: Requirements 6.13, 6.14**
 *
 * Property 26: Engagement counts accuracy
 * Counts reflect actual engagement actions.
 */
describe('Property 26: Engagement counts accuracy', () => {
  it('should accurately reflect like count after multiple likes from different users', () => {
    return fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 10 }),
        async (postOwnerId, likeCount) => {
          const repo = createMockRepository();
          const redisCache = createMockRedisCache();
          const service = new EngagementService({
            repository: repo as any,
            redisCache,
          });

          const postId = await repo.create({
            user_id: postOwnerId,
            type: PostType.TEXT,
            content: 'test post',
            privacy: PostPrivacy.PUBLIC,
          });

          // Like from different users
          for (let i = 0; i < likeCount; i++) {
            const likerId = postOwnerId + i + 1; // ensure different user IDs
            await service.likePost(postId, likerId);
          }

          const counts = await service.getEngagementCounts(postId);
          expect(counts.likes).toBe(likeCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accurately reflect comment count after multiple comments', () => {
    return fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 10 }),
        async (postOwnerId, commentCount) => {
          const repo = createMockRepository();
          const redisCache = createMockRedisCache();
          const service = new EngagementService({
            repository: repo as any,
            redisCache,
          });

          const postId = await repo.create({
            user_id: postOwnerId,
            type: PostType.TEXT,
            content: 'test post',
            privacy: PostPrivacy.PUBLIC,
          });

          // Add comments from different users
          for (let i = 0; i < commentCount; i++) {
            const commenterId = postOwnerId + i + 1;
            await service.commentOnPost(postId, commenterId, { content: `comment ${i}` });
          }

          const counts = await service.getEngagementCounts(postId);
          expect(counts.comments).toBe(commentCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accurately reflect counts after like and unlike', () => {
    return fc.assert(
      fc.asyncProperty(
        userIdArb,
        userIdArb.filter((id) => id > 50000),
        async (postOwnerId, likerId) => {
          fc.pre(postOwnerId !== likerId);

          const repo = createMockRepository();
          const redisCache = createMockRedisCache();
          const service = new EngagementService({
            repository: repo as any,
            redisCache,
          });

          const postId = await repo.create({
            user_id: postOwnerId,
            type: PostType.TEXT,
            content: 'test post',
            privacy: PostPrivacy.PUBLIC,
          });

          // Like then unlike
          await service.likePost(postId, likerId);
          let counts = await service.getEngagementCounts(postId);
          expect(counts.likes).toBe(1);

          await service.unlikePost(postId, likerId);
          counts = await service.getEngagementCounts(postId);
          expect(counts.likes).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accurately reflect share count after shares', () => {
    return fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.integer({ min: 1, max: 5 }),
        async (postOwnerId, shareCount) => {
          const repo = createMockRepository();
          const redisCache = createMockRedisCache();
          const service = new EngagementService({
            repository: repo as any,
            redisCache,
          });

          const postId = await repo.create({
            user_id: postOwnerId,
            type: PostType.TEXT,
            content: 'test post',
            privacy: PostPrivacy.PUBLIC,
          });

          // Share from different users
          for (let i = 0; i < shareCount; i++) {
            const sharerId = postOwnerId + i + 1;
            await service.sharePost(postId, sharerId);
          }

          const counts = await service.getEngagementCounts(postId);
          expect(counts.shares).toBe(shareCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});
