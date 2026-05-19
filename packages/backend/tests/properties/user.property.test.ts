import * as fc from 'fast-check';

import { UserService } from '../../src/services/user/user.service';
import { UserServiceError, PUBLIC_VISIBLE_FIELDS, OWNER_VISIBLE_FIELDS } from '../../src/services/user/types';
import { FriendService } from '../../src/services/friend/friend.service';
import { SocialService } from '../../src/services/social/social.service';

// ============================================================================
// Mock Repositories
// ============================================================================

/**
 * In-memory mock for UserProfileRepository.
 * Stores user profiles and supports find/update operations.
 */
function createMockUserRepository() {
  const users = new Map<number, Record<string, any>>();

  return {
    _users: users,
    addUser(user: Record<string, any>) {
      users.set(user.id, { ...user });
    },
    findProfileById: jest.fn(async (userId: number) => {
      return users.get(userId) || undefined;
    }),
    updateProfile: jest.fn(async (userId: number, data: Record<string, any>) => {
      const user = users.get(userId);
      if (!user) return 0;
      Object.assign(user, data);
      return 1;
    }),
  };
}

/**
 * In-memory mock for FriendRepository.
 * Tracks friend requests, friendships, and blocks.
 */
function createMockFriendRepository() {
  let nextRequestId = 1;
  let nextFriendshipId = 1;
  const requests: Array<{ id: number; sender_id: number; recipient_id: number; status: string; created_at: Date; updated_at: Date }> = [];
  const friendships: Array<{ id: number; user_id_1: number; user_id_2: number; created_at: Date }> = [];
  const blocks: Array<{ blocker_id: number; blocked_id: number }> = [];

  return {
    _requests: requests,
    _friendships: friendships,
    _blocks: blocks,

    findRequestById: jest.fn(async (id: number) => {
      return requests.find(r => r.id === id);
    }),

    findRequestBetween: jest.fn(async (senderId: number, recipientId: number) => {
      return requests.find(r => r.sender_id === senderId && r.recipient_id === recipientId) || undefined;
    }),

    findPendingRequestBetween: jest.fn(async (userId1: number, userId2: number) => {
      return requests.find(r =>
        r.status === 'pending' &&
        ((r.sender_id === userId1 && r.recipient_id === userId2) ||
         (r.sender_id === userId2 && r.recipient_id === userId1))
      ) || undefined;
    }),

    countPendingOutbound: jest.fn(async (senderId: number) => {
      return requests.filter(r => r.sender_id === senderId && r.status === 'pending').length;
    }),

    createRequest: jest.fn(async (senderId: number, recipientId: number) => {
      const id = nextRequestId++;
      requests.push({
        id,
        sender_id: senderId,
        recipient_id: recipientId,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
      });
      return id;
    }),

    updateRequestStatus: jest.fn(async (requestId: number, status: string) => {
      const req = requests.find(r => r.id === requestId);
      if (req) {
        req.status = status;
        req.updated_at = new Date();
      }
      return req ? 1 : 0;
    }),

    deleteRequest: jest.fn(async (requestId: number) => {
      const idx = requests.findIndex(r => r.id === requestId);
      if (idx >= 0) {
        requests.splice(idx, 1);
        return 1;
      }
      return 0;
    }),

    friendshipExists: jest.fn(async (userId1: number, userId2: number) => {
      return friendships.some(f =>
        (f.user_id_1 === userId1 && f.user_id_2 === userId2) ||
        (f.user_id_1 === userId2 && f.user_id_2 === userId1)
      );
    }),

    countFriends: jest.fn(async (userId: number) => {
      return friendships.filter(f => f.user_id_1 === userId || f.user_id_2 === userId).length;
    }),

    createFriendship: jest.fn(async (userId1: number, userId2: number) => {
      const id = nextFriendshipId++;
      const [lower, higher] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
      friendships.push({ id, user_id_1: lower, user_id_2: higher, created_at: new Date() });
      return id;
    }),

    findFriendship: jest.fn(async (userId1: number, userId2: number) => {
      const [lower, higher] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
      return friendships.find(f => f.user_id_1 === lower && f.user_id_2 === higher) || undefined;
    }),

    blockExists: jest.fn(async (userId1: number, userId2: number) => {
      return blocks.some(b =>
        (b.blocker_id === userId1 && b.blocked_id === userId2) ||
        (b.blocker_id === userId2 && b.blocked_id === userId1)
      );
    }),
  };
}

/**
 * In-memory mock for SocialRepository.
 * Tracks follows, blocks, friendships, and friend requests for the block operation.
 */
function createMockSocialRepository() {
  const follows: Array<{ id: number; follower_id: number; followed_id: number }> = [];
  const blocks: Array<{ id: number; blocker_id: number; blocked_id: number }> = [];
  const friendships: Array<{ id: number; user_id_1: number; user_id_2: number }> = [];
  const friendRequests: Array<{ id: number; sender_id: number; recipient_id: number; status: string }> = [];
  let nextId = 1;

  return {
    _follows: follows,
    _blocks: blocks,
    _friendships: friendships,
    _friendRequests: friendRequests,

    addFollow(followerId: number, followedId: number) {
      follows.push({ id: nextId++, follower_id: followerId, followed_id: followedId });
    },
    addFriendship(userId1: number, userId2: number) {
      const [lower, higher] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
      friendships.push({ id: nextId++, user_id_1: lower, user_id_2: higher });
    },
    addFriendRequest(senderId: number, recipientId: number, status = 'pending') {
      friendRequests.push({ id: nextId++, sender_id: senderId, recipient_id: recipientId, status });
    },

    followExists: jest.fn(async (followerId: number, followedId: number) => {
      return follows.some(f => f.follower_id === followerId && f.followed_id === followedId);
    }),

    createFollow: jest.fn(async (followerId: number, followedId: number) => {
      const id = nextId++;
      follows.push({ id, follower_id: followerId, followed_id: followedId });
      return id;
    }),

    deleteFollow: jest.fn(async (followerId: number, followedId: number) => {
      const idx = follows.findIndex(f => f.follower_id === followerId && f.followed_id === followedId);
      if (idx >= 0) { follows.splice(idx, 1); return 1; }
      return 0;
    }),

    blockExistsBetween: jest.fn(async (userId1: number, userId2: number) => {
      return blocks.some(b =>
        (b.blocker_id === userId1 && b.blocked_id === userId2) ||
        (b.blocker_id === userId2 && b.blocked_id === userId1)
      );
    }),

    createBlock: jest.fn(async (blockerId: number, blockedId: number) => {
      const id = nextId++;
      blocks.push({ id, blocker_id: blockerId, blocked_id: blockedId });
      return id;
    }),

    deleteFollowsBetween: jest.fn(async (userId1: number, userId2: number) => {
      const toRemove = follows.filter(f =>
        (f.follower_id === userId1 && f.followed_id === userId2) ||
        (f.follower_id === userId2 && f.followed_id === userId1)
      );
      toRemove.forEach(f => {
        const idx = follows.indexOf(f);
        if (idx >= 0) follows.splice(idx, 1);
      });
      return toRemove.length;
    }),

    deleteFriendshipBetween: jest.fn(async (userId1: number, userId2: number) => {
      const toRemove = friendships.filter(f =>
        (f.user_id_1 === userId1 && f.user_id_2 === userId2) ||
        (f.user_id_1 === userId2 && f.user_id_2 === userId1)
      );
      toRemove.forEach(f => {
        const idx = friendships.indexOf(f);
        if (idx >= 0) friendships.splice(idx, 1);
      });
      return toRemove.length;
    }),

    deletePendingRequestsBetween: jest.fn(async (userId1: number, userId2: number) => {
      const toRemove = friendRequests.filter(r =>
        r.status === 'pending' &&
        ((r.sender_id === userId1 && r.recipient_id === userId2) ||
         (r.sender_id === userId2 && r.recipient_id === userId1))
      );
      toRemove.forEach(r => {
        const idx = friendRequests.indexOf(r);
        if (idx >= 0) friendRequests.splice(idx, 1);
      });
      return toRemove.length;
    }),

    getFriendIds: jest.fn(async (userId: number) => {
      return friendships
        .filter(f => f.user_id_1 === userId || f.user_id_2 === userId)
        .map(f => f.user_id_1 === userId ? f.user_id_2 : f.user_id_1);
    }),

    countMutualFriends: jest.fn(async (userId1: number, userId2: number) => {
      const friends1 = friendships
        .filter(f => f.user_id_1 === userId1 || f.user_id_2 === userId1)
        .map(f => f.user_id_1 === userId1 ? f.user_id_2 : f.user_id_1);
      const friends2 = friendships
        .filter(f => f.user_id_1 === userId2 || f.user_id_2 === userId2)
        .map(f => f.user_id_1 === userId2 ? f.user_id_2 : f.user_id_1);
      const set2 = new Set(friends2);
      return friends1.filter(id => set2.has(id)).length;
    }),

    getFriendsPaginated: jest.fn(async () => ({ data: [], hasMore: false })),
    getFollowersPaginated: jest.fn(async () => ({ data: [], hasMore: false })),
    getFollowingPaginated: jest.fn(async () => ({ data: [], hasMore: false })),
  };
}

// ============================================================================
// Generators
// ============================================================================

/** Generator for valid bio (0-500 characters) */
const validBioArb = fc.string({ minLength: 0, maxLength: 500 });

/** Generator for invalid bio (>500 characters) */
const invalidBioArb = fc.string({ minLength: 501, maxLength: 600 });

/** Generator for valid display name (1-50 characters) */
const validDisplayNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

/** Generator for invalid display name (empty or >50 characters) */
const invalidDisplayNameTooLongArb = fc.string({ minLength: 51, maxLength: 100 });
const invalidDisplayNameEmptyArb = fc.constant('');

/** Generator for valid location (0-100 characters) */
const validLocationArb = fc.string({ minLength: 0, maxLength: 100 });

/** Generator for invalid location (>100 characters) */
const invalidLocationArb = fc.string({ minLength: 101, maxLength: 200 });

/** Generator for valid website (0-200 characters) */
const validWebsiteArb = fc.string({ minLength: 0, maxLength: 200 });

/** Generator for invalid website (>200 characters) */
const invalidWebsiteArb = fc.string({ minLength: 201, maxLength: 300 });

/** Generator for distinct user IDs */
const distinctUserIdsArb = fc.tuple(
  fc.integer({ min: 1, max: 10000 }),
  fc.integer({ min: 1, max: 10000 }),
).filter(([a, b]) => a !== b);

/** Generator for a set of friend IDs for a user */
const friendSetArb = fc.uniqueArray(fc.integer({ min: 1, max: 1000 }), { minLength: 0, maxLength: 20 });

// ============================================================================
// Property 6: Profile field validation
// ============================================================================

/**
 * **Validates: Requirements 2.1, 2.2**
 *
 * Property 6: Profile field validation
 * For any profile update, the User_Service SHALL accept the update if and only if
 * bio does not exceed 500 characters, display name is between 1 and 50 characters,
 * location does not exceed 100 characters, and website does not exceed 200 characters.
 * Invalid updates SHALL be rejected with field-specific errors while preserving existing data.
 */
describe('Property 6: Profile field validation', () => {
  it('should accept any profile update where all fields are within valid bounds', () => {
    return fc.assert(
      fc.asyncProperty(
        validDisplayNameArb,
        validBioArb,
        validLocationArb,
        validWebsiteArb,
        async (displayName, bio, location, website) => {
          const mockRepo = createMockUserRepository();
          mockRepo.addUser({
            id: 1,
            username: 'testuser',
            email: 'test@example.com',
            display_name: 'Old Name',
            bio: 'Old bio',
            location: 'Old location',
            website: 'Old website',
            avatar_url: null,
            cover_url: null,
            role: 'user',
            created_at: new Date(),
          });

          const service = new UserService({ repository: mockRepo as any });

          const result = await service.updateProfile(1, {
            display_name: displayName,
            bio,
            location,
            website,
          });

          expect(result).toBeDefined();
          expect(result.display_name).toBe(displayName);
          expect(result.bio).toBe(bio);
          expect(result.location).toBe(location);
          expect(result.website).toBe(website);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject profile update when bio exceeds 500 characters', () => {
    return fc.assert(
      fc.asyncProperty(invalidBioArb, async (bio) => {
        const mockRepo = createMockUserRepository();
        mockRepo.addUser({
          id: 1, username: 'testuser', email: 'test@example.com',
          display_name: 'Name', bio: 'Original', location: null, website: null,
          avatar_url: null, cover_url: null, role: 'user', created_at: new Date(),
        });

        const service = new UserService({ repository: mockRepo as any });

        try {
          await service.updateProfile(1, { bio });
          expect(true).toBe(false); // Should not reach here
        } catch (err: any) {
          expect(err).toBeInstanceOf(UserServiceError);
          expect(err.statusCode).toBe(400);
          expect(err.errors.some((e: any) => e.field === 'bio')).toBe(true);
        }

        // Verify existing data is preserved
        const user = mockRepo._users.get(1);
        expect(user!.bio).toBe('Original');
      }),
      { numRuns: 100 },
    );
  });

  it('should reject profile update when display name exceeds 50 characters', () => {
    return fc.assert(
      fc.asyncProperty(invalidDisplayNameTooLongArb, async (displayName) => {
        const mockRepo = createMockUserRepository();
        mockRepo.addUser({
          id: 1, username: 'testuser', email: 'test@example.com',
          display_name: 'Original', bio: null, location: null, website: null,
          avatar_url: null, cover_url: null, role: 'user', created_at: new Date(),
        });

        const service = new UserService({ repository: mockRepo as any });

        try {
          await service.updateProfile(1, { display_name: displayName });
          expect(true).toBe(false);
        } catch (err: any) {
          expect(err).toBeInstanceOf(UserServiceError);
          expect(err.statusCode).toBe(400);
          expect(err.errors.some((e: any) => e.field === 'display_name')).toBe(true);
        }

        // Verify existing data is preserved
        const user = mockRepo._users.get(1);
        expect(user!.display_name).toBe('Original');
      }),
      { numRuns: 100 },
    );
  });

  it('should reject profile update when display name is empty', () => {
    return fc.assert(
      fc.asyncProperty(invalidDisplayNameEmptyArb, async (displayName) => {
        const mockRepo = createMockUserRepository();
        mockRepo.addUser({
          id: 1, username: 'testuser', email: 'test@example.com',
          display_name: 'Original', bio: null, location: null, website: null,
          avatar_url: null, cover_url: null, role: 'user', created_at: new Date(),
        });

        const service = new UserService({ repository: mockRepo as any });

        try {
          await service.updateProfile(1, { display_name: displayName });
          expect(true).toBe(false);
        } catch (err: any) {
          expect(err).toBeInstanceOf(UserServiceError);
          expect(err.statusCode).toBe(400);
          expect(err.errors.some((e: any) => e.field === 'display_name')).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should reject profile update when location exceeds 100 characters', () => {
    return fc.assert(
      fc.asyncProperty(invalidLocationArb, async (location) => {
        const mockRepo = createMockUserRepository();
        mockRepo.addUser({
          id: 1, username: 'testuser', email: 'test@example.com',
          display_name: 'Name', bio: null, location: 'Original', website: null,
          avatar_url: null, cover_url: null, role: 'user', created_at: new Date(),
        });

        const service = new UserService({ repository: mockRepo as any });

        try {
          await service.updateProfile(1, { location });
          expect(true).toBe(false);
        } catch (err: any) {
          expect(err).toBeInstanceOf(UserServiceError);
          expect(err.statusCode).toBe(400);
          expect(err.errors.some((e: any) => e.field === 'location')).toBe(true);
        }

        const user = mockRepo._users.get(1);
        expect(user!.location).toBe('Original');
      }),
      { numRuns: 100 },
    );
  });

  it('should reject profile update when website exceeds 200 characters', () => {
    return fc.assert(
      fc.asyncProperty(invalidWebsiteArb, async (website) => {
        const mockRepo = createMockUserRepository();
        mockRepo.addUser({
          id: 1, username: 'testuser', email: 'test@example.com',
          display_name: 'Name', bio: null, location: null, website: 'Original',
          avatar_url: null, cover_url: null, role: 'user', created_at: new Date(),
        });

        const service = new UserService({ repository: mockRepo as any });

        try {
          await service.updateProfile(1, { website });
          expect(true).toBe(false);
        } catch (err: any) {
          expect(err).toBeInstanceOf(UserServiceError);
          expect(err.statusCode).toBe(400);
          expect(err.errors.some((e: any) => e.field === 'website')).toBe(true);
        }

        const user = mockRepo._users.get(1);
        expect(user!.website).toBe('Original');
      }),
      { numRuns: 100 },
    );
  });
});


// ============================================================================
// Property 7: Profile visibility respects privacy settings
// ============================================================================

/**
 * **Validates: Requirements 2.5**
 *
 * Property 7: Profile visibility respects privacy settings
 * For any profile requested by a non-owner user, the User_Service SHALL return
 * only the fields that the profile owner has marked as publicly visible.
 */
describe('Property 7: Profile visibility respects privacy settings', () => {
  it('should return all fields when the requester is the profile owner', () => {
    return fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),
        fc.string({ minLength: 3, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 30 }),
        async (userId, username, email) => {
          const mockRepo = createMockUserRepository();
          mockRepo.addUser({
            id: userId,
            username,
            email: `${email}@test.com`,
            display_name: 'Test User',
            bio: 'A bio',
            location: 'Somewhere',
            website: 'https://example.com',
            avatar_url: 'https://s3.example.com/avatar.jpg',
            cover_url: 'https://s3.example.com/cover.jpg',
            role: 'user',
            created_at: new Date(),
          });

          const service = new UserService({ repository: mockRepo as any });
          const profile = await service.getProfile(userId, userId);

          // Owner should see all owner-visible fields including email
          for (const field of OWNER_VISIBLE_FIELDS) {
            expect(field in profile).toBe(true);
          }
          expect((profile as any).email).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return only public fields when the requester is NOT the profile owner', () => {
    return fc.assert(
      fc.asyncProperty(
        distinctUserIdsArb,
        fc.string({ minLength: 3, maxLength: 20 }),
        async ([ownerId, requesterId], username) => {
          const mockRepo = createMockUserRepository();
          mockRepo.addUser({
            id: ownerId,
            username,
            email: 'owner@test.com',
            display_name: 'Owner',
            bio: 'Owner bio',
            location: 'Owner city',
            website: 'https://owner.com',
            avatar_url: 'https://s3.example.com/avatar.jpg',
            cover_url: 'https://s3.example.com/cover.jpg',
            role: 'user',
            created_at: new Date(),
          });

          const service = new UserService({ repository: mockRepo as any });
          const profile = await service.getProfile(ownerId, requesterId);

          // Non-owner should only see public fields
          for (const field of PUBLIC_VISIBLE_FIELDS) {
            expect(field in profile).toBe(true);
          }

          // Email should NOT be visible to non-owners
          expect((profile as any).email).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return only public fields when no requester is specified', () => {
    return fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),
        async (ownerId) => {
          const mockRepo = createMockUserRepository();
          mockRepo.addUser({
            id: ownerId,
            username: 'testuser',
            email: 'test@test.com',
            display_name: 'Test',
            bio: 'Bio',
            location: 'City',
            website: 'https://test.com',
            avatar_url: null,
            cover_url: null,
            role: 'user',
            created_at: new Date(),
          });

          const service = new UserService({ repository: mockRepo as any });
          // No requesterId means anonymous/non-owner access
          const profile = await service.getProfile(ownerId);

          // Should only see public fields
          expect((profile as any).email).toBeUndefined();

          for (const field of PUBLIC_VISIBLE_FIELDS) {
            expect(field in profile).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 8: Block removes all relationships and prevents interactions
// ============================================================================

/**
 * **Validates: Requirements 3.6**
 *
 * Property 8: Block removes all relationships and prevents interactions
 * For any two users where one blocks the other, the system SHALL remove all
 * existing friendships, follower relationships, and pending friend requests
 * between them.
 */
describe('Property 8: Block removes all relationships and prevents interactions', () => {
  it('should remove all friendships, follows, and pending requests when a user blocks another', () => {
    return fc.assert(
      fc.asyncProperty(
        distinctUserIdsArb,
        fc.boolean(), // whether they have a friendship
        fc.boolean(), // whether blocker follows blocked
        fc.boolean(), // whether blocked follows blocker
        fc.boolean(), // whether there's a pending request from blocker to blocked
        fc.boolean(), // whether there's a pending request from blocked to blocker
        async ([blockerId, blockedId], hasFriendship, blockerFollowsBlocked, blockedFollowsBlocker, hasPendingFromBlocker, hasPendingFromBlocked) => {
          const mockRepo = createMockSocialRepository();

          // Set up initial relationships
          if (hasFriendship) {
            mockRepo.addFriendship(blockerId, blockedId);
          }
          if (blockerFollowsBlocked) {
            mockRepo.addFollow(blockerId, blockedId);
          }
          if (blockedFollowsBlocker) {
            mockRepo.addFollow(blockedId, blockerId);
          }
          if (hasPendingFromBlocker) {
            mockRepo.addFriendRequest(blockerId, blockedId, 'pending');
          }
          if (hasPendingFromBlocked) {
            mockRepo.addFriendRequest(blockedId, blockerId, 'pending');
          }

          const service = new SocialService({ repository: mockRepo as any });
          await service.block(blockerId, blockedId);

          // After blocking: no friendships between them
          const remainingFriendships = mockRepo._friendships.filter(f =>
            (f.user_id_1 === blockerId && f.user_id_2 === blockedId) ||
            (f.user_id_1 === blockedId && f.user_id_2 === blockerId)
          );
          expect(remainingFriendships).toHaveLength(0);

          // After blocking: no follows between them
          const remainingFollows = mockRepo._follows.filter(f =>
            (f.follower_id === blockerId && f.followed_id === blockedId) ||
            (f.follower_id === blockedId && f.followed_id === blockerId)
          );
          expect(remainingFollows).toHaveLength(0);

          // After blocking: no pending friend requests between them
          const remainingRequests = mockRepo._friendRequests.filter(r =>
            r.status === 'pending' &&
            ((r.sender_id === blockerId && r.recipient_id === blockedId) ||
             (r.sender_id === blockedId && r.recipient_id === blockerId))
          );
          expect(remainingRequests).toHaveLength(0);

          // A block record should exist
          const blockExists = mockRepo._blocks.some(b =>
            b.blocker_id === blockerId && b.blocked_id === blockedId
          );
          expect(blockExists).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should prevent following after a block exists', () => {
    return fc.assert(
      fc.asyncProperty(distinctUserIdsArb, async ([blockerId, blockedId]) => {
        const mockRepo = createMockSocialRepository();

        // First block the user
        const service = new SocialService({ repository: mockRepo as any });
        await service.block(blockerId, blockedId);

        // Now try to follow - should fail
        try {
          await service.follow(blockerId, blockedId);
          expect(true).toBe(false); // Should not reach here
        } catch (err: any) {
          expect(err.code).toBe('USER_BLOCKED');
        }

        // Also try the reverse direction
        try {
          await service.follow(blockedId, blockerId);
          expect(true).toBe(false);
        } catch (err: any) {
          expect(err.code).toBe('USER_BLOCKED');
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 9: Mutual friends count equals set intersection
// ============================================================================

/**
 * **Validates: Requirements 3.7**
 *
 * Property 9: Mutual friends count equals set intersection
 * For any two users, the mutual friends count SHALL equal the size of the
 * intersection of their respective friend sets.
 */
describe('Property 9: Mutual friends count equals set intersection', () => {
  it('should return the correct mutual friends count as the set intersection size', () => {
    return fc.assert(
      fc.asyncProperty(
        distinctUserIdsArb,
        friendSetArb,
        friendSetArb,
        async ([userId1, userId2], friendsOfUser1, friendsOfUser2) => {
          // Filter out the two users themselves from friend sets
          const cleanFriends1 = friendsOfUser1.filter(id => id !== userId1 && id !== userId2);
          const cleanFriends2 = friendsOfUser2.filter(id => id !== userId1 && id !== userId2);

          const mockRepo = createMockSocialRepository();

          // Set up friendships for user1
          for (const friendId of cleanFriends1) {
            mockRepo.addFriendship(userId1, friendId);
          }

          // Set up friendships for user2
          for (const friendId of cleanFriends2) {
            mockRepo.addFriendship(userId2, friendId);
          }

          const service = new SocialService({ repository: mockRepo as any });
          const mutualCount = await service.getMutualFriendsCount(userId1, userId2);

          // Calculate expected intersection
          const set1 = new Set(cleanFriends1);
          const set2 = new Set(cleanFriends2);
          const intersection = [...set1].filter(id => set2.has(id));

          expect(mutualCount).toBe(intersection.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return 0 mutual friends when users have no common friends', () => {
    return fc.assert(
      fc.asyncProperty(
        distinctUserIdsArb,
        fc.uniqueArray(fc.integer({ min: 100, max: 200 }), { minLength: 1, maxLength: 10 }),
        fc.uniqueArray(fc.integer({ min: 300, max: 400 }), { minLength: 1, maxLength: 10 }),
        async ([userId1, userId2], friends1, friends2) => {
          const mockRepo = createMockSocialRepository();

          // Disjoint friend sets (100-200 vs 300-400)
          for (const friendId of friends1) {
            mockRepo.addFriendship(userId1, friendId);
          }
          for (const friendId of friends2) {
            mockRepo.addFriendship(userId2, friendId);
          }

          const service = new SocialService({ repository: mockRepo as any });
          const mutualCount = await service.getMutualFriendsCount(userId1, userId2);

          expect(mutualCount).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return 0 when the same user is passed for both arguments', () => {
    return fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),
        async (userId) => {
          const mockRepo = createMockSocialRepository();
          mockRepo.addFriendship(userId, 9999);

          const service = new SocialService({ repository: mockRepo as any });
          const mutualCount = await service.getMutualFriendsCount(userId, userId);

          expect(mutualCount).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 11: Mutual pending requests auto-accept
// ============================================================================

/**
 * **Validates: Requirements 3.10**
 *
 * Property 11: Mutual pending requests auto-accept
 * For any two users where both have sent pending friend requests to each other,
 * the system SHALL automatically accept both requests and create a mutual
 * friendship record.
 */
describe('Property 11: Mutual pending requests auto-accept', () => {
  it('should auto-accept and create friendship when both users have pending requests to each other', () => {
    return fc.assert(
      fc.asyncProperty(distinctUserIdsArb, async ([userA, userB]) => {
        const mockRepo = createMockFriendRepository();

        const service = new FriendService({ repository: mockRepo as any });

        // User A sends a request to User B first
        const result1 = await service.sendFriendRequest(userA, userB);
        expect(result1.autoAccepted).toBe(false);
        expect(result1.request).toBeDefined();

        // User B sends a request to User A - should auto-accept
        const result2 = await service.sendFriendRequest(userB, userA);
        expect(result2.autoAccepted).toBe(true);
        expect(result2.friendship).toBeDefined();

        // Verify friendship was created
        const friendship = mockRepo._friendships.find(f =>
          (f.user_id_1 === userA && f.user_id_2 === userB) ||
          (f.user_id_1 === userB && f.user_id_2 === userA)
        );
        expect(friendship).toBeDefined();

        // Verify the original request was accepted
        const originalRequest = mockRepo._requests.find(r =>
          r.sender_id === userA && r.recipient_id === userB
        );
        expect(originalRequest!.status).toBe('accepted');
      }),
      { numRuns: 100 },
    );
  });

  it('should not auto-accept when only one direction has a pending request', () => {
    return fc.assert(
      fc.asyncProperty(distinctUserIdsArb, async ([userA, userB]) => {
        const mockRepo = createMockFriendRepository();

        const service = new FriendService({ repository: mockRepo as any });

        // Only User A sends a request to User B
        const result = await service.sendFriendRequest(userA, userB);

        expect(result.autoAccepted).toBe(false);
        expect(result.request).toBeDefined();
        expect(result.request!.status).toBe('pending');

        // No friendship should exist yet
        expect(mockRepo._friendships).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it('should create a friendship record with correct user IDs on auto-accept', () => {
    return fc.assert(
      fc.asyncProperty(distinctUserIdsArb, async ([userA, userB]) => {
        const mockRepo = createMockFriendRepository();

        const service = new FriendService({ repository: mockRepo as any });

        // Create mutual pending requests
        await service.sendFriendRequest(userA, userB);
        const result = await service.sendFriendRequest(userB, userA);

        expect(result.autoAccepted).toBe(true);

        // Verify the friendship record has the correct canonical ordering
        const friendship = mockRepo._friendships[0];
        expect(friendship).toBeDefined();
        const [lower, higher] = userA < userB ? [userA, userB] : [userB, userA];
        expect(friendship!.user_id_1).toBe(lower);
        expect(friendship!.user_id_2).toBe(higher);
      }),
      { numRuns: 100 },
    );
  });
});
