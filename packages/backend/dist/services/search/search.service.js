"use strict";
/**
 * Search service implementing search and discovery functionality.
 *
 * Requirements covered:
 * - 10.1: Text search with engagement ranking (1-100 chars, 20 results/page)
 * - 10.2: Hashtag search in reverse chronological order, paginated
 * - 10.3: Explore page with trending posts, hashtags, and suggested users
 * - 10.4: Typeahead suggestions (2+ chars, 8 results, within 200ms)
 * - 10.5: Content type filtering (users, posts, hashtags, reels)
 * - 10.6: Hashtag page with post count and recent posts
 * - 10.7: Empty state with suggestions when no results found
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchService = void 0;
const search_repository_1 = require("./search.repository");
const redis_utils_1 = require("../../utils/redis-utils");
const types_1 = require("./types");
class SearchService {
    repository;
    getTrendingPostIds;
    getTrendingHashtagIds;
    updateTrendingPostIds;
    updateTrendingHashtagIds;
    constructor(deps) {
        this.repository = deps?.repository || new search_repository_1.SearchRepository();
        this.getTrendingPostIds = deps?.getTrendingPostIds || redis_utils_1.getTrendingPosts;
        this.getTrendingHashtagIds = deps?.getTrendingHashtagIds || redis_utils_1.getTrendingHashtags;
        this.updateTrendingPostIds = deps?.updateTrendingPostIds || redis_utils_1.updateTrendingPosts;
        this.updateTrendingHashtagIds = deps?.updateTrendingHashtagIds || redis_utils_1.updateTrendingHashtags;
    }
    /**
     * Search across users, posts, hashtags, and reels with text match + engagement ranking.
     *
     * Requirement 10.1: 1-100 char queries, 20 results/page
     * Requirement 10.5: Content type filtering
     * Requirement 10.7: Empty state with suggestions
     */
    async search(query, filters, cursor, limit = types_1.DEFAULT_PAGE_SIZE) {
        // Validate query length (Requirement 10.1)
        if (!query || query.length < types_1.MIN_QUERY_LENGTH) {
            throw new types_1.SearchServiceError(`Search query must be at least ${types_1.MIN_QUERY_LENGTH} character(s)`, 400);
        }
        if (query.length > types_1.MAX_QUERY_LENGTH) {
            throw new types_1.SearchServiceError(`Search query must not exceed ${types_1.MAX_QUERY_LENGTH} characters`, 400);
        }
        // Clamp limit to valid range
        const pageSize = Math.min(Math.max(1, limit), types_1.DEFAULT_PAGE_SIZE);
        const offset = cursor ? parseInt(cursor, 10) : 0;
        if (cursor && isNaN(offset)) {
            throw new types_1.SearchServiceError('Invalid cursor format', 400);
        }
        const trimmedQuery = query.trim();
        const contentType = filters?.type;
        // Requirement 10.5: If a content type filter is applied, return only that type
        if (contentType) {
            return this.searchByType(trimmedQuery, contentType, pageSize, offset);
        }
        // Search across all content types and merge results
        return this.searchAll(trimmedQuery, pageSize, offset);
    }
    /**
     * Search filtered by a specific content type.
     * Requirement 10.5.
     */
    async searchByType(query, type, limit, offset) {
        let items = [];
        switch (type) {
            case 'users': {
                const users = await this.repository.searchUsers(query, limit + 1, offset);
                const hasMore = users.length > limit;
                const pageUsers = users.slice(0, limit);
                items = pageUsers.map((u) => ({ type: 'user', data: u }));
                return {
                    data: items,
                    cursor: hasMore ? String(offset + limit) : null,
                    hasMore,
                };
            }
            case 'posts': {
                const posts = await this.repository.searchPosts(query, limit + 1, offset);
                const hasMore = posts.length > limit;
                const pagePosts = posts.slice(0, limit);
                items = pagePosts.map((p) => ({ type: 'post', data: p }));
                return {
                    data: items,
                    cursor: hasMore ? String(offset + limit) : null,
                    hasMore,
                };
            }
            case 'hashtags': {
                const hashtags = await this.repository.searchHashtags(query, limit + 1, offset);
                const hasMore = hashtags.length > limit;
                const pageHashtags = hashtags.slice(0, limit);
                items = pageHashtags.map((h) => ({ type: 'hashtag', data: h }));
                return {
                    data: items,
                    cursor: hasMore ? String(offset + limit) : null,
                    hasMore,
                };
            }
            case 'reels': {
                const reels = await this.repository.searchReels(query, limit + 1, offset);
                const hasMore = reels.length > limit;
                const pageReels = reels.slice(0, limit);
                items = pageReels.map((r) => ({ type: 'reel', data: r }));
                return {
                    data: items,
                    cursor: hasMore ? String(offset + limit) : null,
                    hasMore,
                };
            }
            default:
                throw new types_1.SearchServiceError(`Invalid content type filter: ${type}`, 400);
        }
    }
    /**
     * Search across all content types and merge results ranked by engagement.
     * Distributes results across types for a balanced result set.
     */
    async searchAll(query, limit, offset) {
        // Fetch from all types in parallel
        const perTypeLimit = Math.ceil(limit / 2); // Fetch more per type to allow ranking
        const [users, posts, hashtags, reels] = await Promise.all([
            this.repository.searchUsers(query, perTypeLimit, offset),
            this.repository.searchPosts(query, perTypeLimit, offset),
            this.repository.searchHashtags(query, perTypeLimit, offset),
            this.repository.searchReels(query, perTypeLimit, offset),
        ]);
        // Merge all results into a single ranked list
        const allItems = [
            ...users.map((u) => ({ type: 'user', data: u })),
            ...posts.map((p) => ({ type: 'post', data: p })),
            ...hashtags.map((h) => ({ type: 'hashtag', data: h })),
            ...reels.map((r) => ({ type: 'reel', data: r })),
        ];
        // Sort by engagement score (higher is better)
        allItems.sort((a, b) => this.getEngagementScore(b) - this.getEngagementScore(a));
        // Paginate the merged results
        const pageItems = allItems.slice(0, limit);
        const hasMore = allItems.length > limit;
        // Requirement 10.7: Empty state
        if (pageItems.length === 0) {
            return {
                data: [],
                cursor: null,
                hasMore: false,
            };
        }
        return {
            data: pageItems,
            cursor: hasMore ? String(offset + limit) : null,
            hasMore,
        };
    }
    /**
     * Get engagement score for a search result item for ranking purposes.
     */
    getEngagementScore(item) {
        switch (item.type) {
            case 'user':
                return item.data.follower_count || 0;
            case 'post':
                return item.data.like_count + item.data.comment_count + item.data.share_count;
            case 'hashtag':
                return item.data.post_count;
            case 'reel':
                return item.data.like_count + item.data.comment_count + item.data.share_count;
            default:
                return 0;
        }
    }
    /**
     * Typeahead suggestions for search.
     *
     * Requirement 10.4: 2+ chars, 8 results, within 200ms target.
     */
    async typeahead(query) {
        if (!query || query.length < types_1.MIN_TYPEAHEAD_LENGTH) {
            return [];
        }
        const trimmedQuery = query.trim().toLowerCase();
        if (trimmedQuery.length < types_1.MIN_TYPEAHEAD_LENGTH) {
            return [];
        }
        // Fetch users and hashtags in parallel for fast response
        const perTypeLimit = Math.ceil(types_1.MAX_TYPEAHEAD_RESULTS / 2);
        const [users, hashtags] = await Promise.all([
            this.repository.typeaheadUsers(trimmedQuery, perTypeLimit),
            this.repository.typeaheadHashtags(trimmedQuery, perTypeLimit),
        ]);
        const suggestions = [];
        // Add user suggestions
        for (const user of users) {
            suggestions.push({
                type: 'users',
                id: user.id,
                text: user.username,
                subtitle: user.display_name || undefined,
            });
        }
        // Add hashtag suggestions
        for (const hashtag of hashtags) {
            suggestions.push({
                type: 'hashtags',
                id: hashtag.id,
                text: `#${hashtag.name}`,
                subtitle: `${hashtag.post_count} posts`,
            });
        }
        // Return up to MAX_TYPEAHEAD_RESULTS
        return suggestions.slice(0, types_1.MAX_TYPEAHEAD_RESULTS);
    }
    /**
     * Get trending content for the explore page.
     *
     * Requirement 10.3: 10 trending posts, 10 trending hashtags, 10 suggested users.
     * Uses Redis cache with 5-min TTL.
     */
    async getTrending() {
        // Try to get from Redis cache first
        const [cachedPostIds, cachedHashtagIds] = await Promise.all([
            this.getTrendingPostIds(types_1.TRENDING_POSTS_COUNT),
            this.getTrendingHashtagIds(types_1.TRENDING_HASHTAGS_COUNT),
        ]);
        let posts;
        let hashtags;
        if (cachedPostIds.length > 0) {
            // Fetch post details from DB using cached IDs
            posts = await this.fetchPostsByIds(cachedPostIds.map(Number));
        }
        else {
            // Compute trending posts from DB and cache them
            posts = await this.repository.getTrendingPosts(types_1.TRENDING_POSTS_COUNT);
            if (posts.length > 0) {
                const postScores = posts.map((p, i) => ({
                    id: String(p.id),
                    score: posts.length - i, // Higher score for higher ranked
                }));
                await this.updateTrendingPostIds(postScores);
            }
        }
        if (cachedHashtagIds.length > 0) {
            // Fetch hashtag details from DB using cached IDs
            hashtags = await this.fetchHashtagsByIds(cachedHashtagIds.map(Number));
        }
        else {
            // Compute trending hashtags from DB and cache them
            hashtags = await this.repository.getTrendingHashtags(types_1.TRENDING_HASHTAGS_COUNT);
            if (hashtags.length > 0) {
                const hashtagScores = hashtags.map((h, i) => ({
                    id: String(h.id),
                    score: hashtags.length - i,
                }));
                await this.updateTrendingHashtagIds(hashtagScores);
            }
        }
        // Always fetch suggested users fresh (they're personalized)
        const suggestedUsers = await this.repository.getSuggestedUsers(types_1.SUGGESTED_USERS_COUNT);
        return {
            posts: posts || [],
            hashtags: hashtags || [],
            suggestedUsers,
        };
    }
    /**
     * Get posts for a specific hashtag page.
     *
     * Requirement 10.2: Reverse chronological order, paginated.
     * Requirement 10.6: Display total post count and recent posts.
     */
    async getHashtagPosts(hashtag, cursor) {
        if (!hashtag || hashtag.trim().length === 0) {
            throw new types_1.SearchServiceError('Hashtag name is required', 400);
        }
        const normalizedHashtag = hashtag.trim().toLowerCase().replace(/^#/, '');
        // Get the hashtag record
        const hashtagRecord = await this.repository.getHashtagByName(normalizedHashtag);
        if (!hashtagRecord) {
            throw new types_1.SearchServiceError(`Hashtag #${normalizedHashtag} not found`, 404);
        }
        const offset = cursor ? parseInt(cursor, 10) : 0;
        if (cursor && isNaN(offset)) {
            throw new types_1.SearchServiceError('Invalid cursor format', 400);
        }
        // Fetch posts for this hashtag (Requirement 10.2: reverse chronological)
        const posts = await this.repository.getHashtagPosts(hashtagRecord.id, types_1.DEFAULT_PAGE_SIZE + 1, offset);
        const hasMore = posts.length > types_1.DEFAULT_PAGE_SIZE;
        const pagePosts = posts.slice(0, types_1.DEFAULT_PAGE_SIZE);
        return {
            hashtag: hashtagRecord,
            posts: pagePosts,
            cursor: hasMore ? String(offset + types_1.DEFAULT_PAGE_SIZE) : null,
            hasMore,
        };
    }
    /**
     * Fetch posts by their IDs, preserving order.
     */
    async fetchPostsByIds(postIds) {
        if (postIds.length === 0)
            return [];
        const posts = await this.repository.getDb()('posts')
            .whereIn('id', postIds)
            .whereNull('deleted_at')
            .where('privacy', 'public')
            .select('id', 'user_id', 'content', 'type', 'like_count', 'comment_count', 'share_count', 'created_at');
        // Preserve order of input IDs
        const postMap = new Map(posts.map((p) => [p.id, p]));
        return postIds
            .map((id) => postMap.get(id))
            .filter((p) => p !== undefined);
    }
    /**
     * Fetch hashtags by their IDs, preserving order.
     */
    async fetchHashtagsByIds(hashtagIds) {
        if (hashtagIds.length === 0)
            return [];
        const hashtags = await this.repository.getDb()('hashtags')
            .whereIn('id', hashtagIds)
            .select('id', 'name', 'post_count');
        // Preserve order of input IDs
        const hashtagMap = new Map(hashtags.map((h) => [h.id, h]));
        return hashtagIds
            .map((id) => hashtagMap.get(id))
            .filter((h) => h !== undefined);
    }
}
exports.SearchService = SearchService;
//# sourceMappingURL=search.service.js.map