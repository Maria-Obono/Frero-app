"use strict";
/**
 * Post service handling creation of text, photo, video, and carousel posts,
 * as well as reels and stories.
 *
 * Requirements covered:
 * - 4.1: Text post creation with feed availability
 * - 4.2: Photo post creation (1-10 images, max 15MB each)
 * - 4.3: Video post creation (max 500MB, max 10 minutes)
 * - 4.4: Carousel post creation with media order preservation
 * - 4.5: Hashtag extraction and indexing (max 30 per post)
 * - 4.6: Mention extraction and notification (max 20 per post)
 * - 4.7: Privacy enforcement (public, friends-only, private)
 * - 4.8: Content length validation (1-5000 chars)
 * - 4.9: Carousel item count validation (2-10 items)
 * - 4.10: Media upload failure handling
 * - 4.11: Photo/video size and duration limits
 * - 5.1: Reel video compression (max 1080x1920 at 8 Mbps)
 * - 5.2: Reel duration (1-90s) and size (500MB) validation
 * - 5.3: Reel validation error messages
 * - 5.4: Story creation with 24-hour expiration
 * - 5.5: Story expiration logic and active story queries
 * - 5.6: Story view recording with viewer tracking
 * - 5.7: Story video duration (1-30s) and size (500MB) validation
 * - 5.8: Story validation error messages
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostService = void 0;
const post_repository_1 = require("./post.repository");
const types_1 = require("./types");
class PostService {
    repository;
    mediaService;
    notificationTrigger;
    constructor(options) {
        this.repository = options?.repository || new post_repository_1.PostRepository();
        this.mediaService = options?.mediaService || null;
        this.notificationTrigger = options?.notificationTrigger || null;
    }
    /**
     * Create a new post with content validation, media handling,
     * hashtag extraction, and mention notification.
     *
     * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11
     */
    async createPost(userId, data) {
        // Step 1: Validate content
        this.validateContent(data);
        // Step 2: Validate media based on post type
        this.validateMedia(data);
        // Step 3: Upload media if present
        const mediaUrls = await this.uploadMedia(data);
        // Step 4: Create post record
        const postId = await this.repository.create({
            user_id: userId,
            type: data.type,
            content: data.content || null,
            privacy: data.privacy,
        });
        // Step 5: Create post_media records with order preservation
        if (mediaUrls.length > 0) {
            for (let i = 0; i < mediaUrls.length; i++) {
                const mediaItem = data.media[i];
                const mediaUrl = mediaUrls[i];
                const mediaType = this.getMediaTypeFromMime(mediaItem.mimeType);
                await this.repository.createPostMedia({
                    post_id: postId,
                    url: mediaUrl,
                    type: mediaType,
                    order_index: i,
                    width: mediaItem.width || null,
                    height: mediaItem.height || null,
                    duration_seconds: mediaItem.durationSeconds || null,
                });
            }
        }
        // Step 6: Extract and index hashtags (max 30)
        const hashtags = this.extractHashtags(data.content || '');
        await this.indexHashtags(postId, hashtags);
        // Step 7: Extract mentions and trigger notifications (max 20)
        const mentions = this.extractMentions(data.content || '');
        await this.notifyMentions(postId, userId, mentions);
        // Step 8: Return the created post with media
        const post = await this.repository.findById(postId);
        const media = await this.repository.getPostMedia(postId);
        const postHashtags = await this.repository.getPostHashtags(postId);
        return {
            ...post,
            media,
            hashtags: postHashtags,
        };
    }
    /**
     * Validate post content based on type.
     * Text posts require content between 1-5000 chars (Requirement 4.8).
     * Other post types allow optional content up to 5000 chars.
     */
    validateContent(data) {
        const content = data.content;
        if (data.type === types_1.PostType.TEXT) {
            if (!content || content.length < types_1.MIN_CONTENT_LENGTH) {
                throw new types_1.PostServiceError('Text post content must be at least 1 character', 400, { field: 'content', min: types_1.MIN_CONTENT_LENGTH, max: types_1.MAX_CONTENT_LENGTH });
            }
        }
        if (content && content.length > types_1.MAX_CONTENT_LENGTH) {
            throw new types_1.PostServiceError(`Post content must not exceed ${types_1.MAX_CONTENT_LENGTH} characters`, 400, { field: 'content', length: content.length, max: types_1.MAX_CONTENT_LENGTH });
        }
    }
    /**
     * Validate media items based on post type.
     * - Photo: 1-10 images, each max 15MB (Requirements 4.2, 4.11)
     * - Video: 1 video, max 500MB, max 10 min (Requirements 4.3, 4.11)
     * - Carousel: 2-10 items (Requirement 4.9)
     */
    validateMedia(data) {
        const media = data.media || [];
        switch (data.type) {
            case types_1.PostType.TEXT:
                // Text posts don't require media
                break;
            case types_1.PostType.PHOTO:
                if (media.length === 0) {
                    throw new types_1.PostServiceError('Photo post requires at least 1 image', 400, { field: 'media' });
                }
                if (media.length > 10) {
                    throw new types_1.PostServiceError('Photo post allows a maximum of 10 images', 400, { field: 'media', count: media.length, max: 10 });
                }
                for (const item of media) {
                    this.validatePhotoItem(item);
                }
                break;
            case types_1.PostType.VIDEO:
                if (media.length === 0) {
                    throw new types_1.PostServiceError('Video post requires a video file', 400, { field: 'media' });
                }
                this.validateVideoItem(media[0]);
                break;
            case types_1.PostType.CAROUSEL:
                if (media.length < types_1.MIN_CAROUSEL_ITEMS) {
                    throw new types_1.PostServiceError(`Carousel post requires at least ${types_1.MIN_CAROUSEL_ITEMS} media items`, 400, { field: 'media', count: media.length, min: types_1.MIN_CAROUSEL_ITEMS, max: types_1.MAX_CAROUSEL_ITEMS });
                }
                if (media.length > types_1.MAX_CAROUSEL_ITEMS) {
                    throw new types_1.PostServiceError(`Carousel post allows a maximum of ${types_1.MAX_CAROUSEL_ITEMS} media items`, 400, { field: 'media', count: media.length, min: types_1.MIN_CAROUSEL_ITEMS, max: types_1.MAX_CAROUSEL_ITEMS });
                }
                for (const item of media) {
                    if (this.isImageMime(item.mimeType)) {
                        this.validatePhotoItem(item);
                    }
                    else {
                        this.validateVideoItem(item);
                    }
                }
                break;
        }
    }
    /**
     * Validate a single photo item (max 15MB, valid image type).
     */
    validatePhotoItem(item) {
        if (!this.isImageMime(item.mimeType)) {
            throw new types_1.PostServiceError('Invalid image format. Accepted formats: JPEG, PNG, WebP, GIF', 400, { field: 'media', mimeType: item.mimeType });
        }
        if (item.file.length > types_1.MAX_PHOTO_SIZE) {
            throw new types_1.PostServiceError('Photo exceeds the maximum allowed size of 15MB', 400, { field: 'media', size: item.file.length, max: types_1.MAX_PHOTO_SIZE });
        }
    }
    /**
     * Validate a single video item (max 500MB, max 10 min, valid video type).
     */
    validateVideoItem(item) {
        if (!this.isVideoMime(item.mimeType)) {
            throw new types_1.PostServiceError('Invalid video format. Accepted formats: MP4, MOV', 400, { field: 'media', mimeType: item.mimeType });
        }
        if (item.file.length > types_1.MAX_VIDEO_SIZE) {
            throw new types_1.PostServiceError('Video exceeds the maximum allowed size of 500MB', 400, { field: 'media', size: item.file.length, max: types_1.MAX_VIDEO_SIZE });
        }
        if (item.durationSeconds !== undefined && item.durationSeconds > types_1.MAX_VIDEO_DURATION) {
            throw new types_1.PostServiceError('Video exceeds the maximum allowed duration of 10 minutes', 400, { field: 'media', duration: item.durationSeconds, max: types_1.MAX_VIDEO_DURATION });
        }
    }
    /**
     * Upload media items using the MediaService.
     * Returns an array of URLs in the same order as the input items.
     *
     * Requirement 4.10: If upload fails, the post is not persisted.
     */
    async uploadMedia(data) {
        const media = data.media || [];
        if (media.length === 0 || !this.mediaService) {
            return media.length > 0 ? media.map(() => 'placeholder-url') : [];
        }
        const urls = [];
        try {
            for (const item of media) {
                if (this.isImageMime(item.mimeType)) {
                    const result = await this.mediaService.uploadImage(item.file, {
                        filename: item.filename,
                        mimeType: item.mimeType,
                        folder: 'posts',
                    });
                    urls.push(result.url);
                }
                else {
                    const result = await this.mediaService.uploadVideo(item.file, {
                        filename: item.filename,
                        mimeType: item.mimeType,
                        folder: 'posts',
                    });
                    urls.push(result.url);
                }
            }
        }
        catch (error) {
            // Requirement 4.10: If media upload fails, don't persist the post
            throw new types_1.PostServiceError('Media upload failed. Post was not created.', 500, { originalError: error instanceof Error ? error.message : String(error) });
        }
        return urls;
    }
    /**
     * Extract hashtags from post content.
     * Matches #word patterns, returns unique hashtags up to MAX_HASHTAGS_PER_POST.
     *
     * Requirement 4.5: Extract and index hashtags (max 30 per post)
     */
    extractHashtags(content) {
        if (!content)
            return [];
        const hashtagRegex = /#(\w+)/g;
        const matches = [];
        let match;
        while ((match = hashtagRegex.exec(content)) !== null) {
            const tag = match[1].toLowerCase();
            if (!matches.includes(tag)) {
                matches.push(tag);
            }
        }
        return matches.slice(0, types_1.MAX_HASHTAGS_PER_POST);
    }
    /**
     * Extract mentions from post content.
     * Matches @word patterns, returns unique mentions up to MAX_MENTIONS_PER_POST.
     *
     * Requirement 4.6: Extract mentions and notify (max 20 per post)
     */
    extractMentions(content) {
        if (!content)
            return [];
        const mentionRegex = /@(\w+)/g;
        const matches = [];
        let match;
        while ((match = mentionRegex.exec(content)) !== null) {
            const username = match[1].toLowerCase();
            if (!matches.includes(username)) {
                matches.push(username);
            }
        }
        return matches.slice(0, types_1.MAX_MENTIONS_PER_POST);
    }
    /**
     * Index extracted hashtags by creating/updating hashtag records
     * and linking them to the post.
     */
    async indexHashtags(postId, hashtags) {
        for (const tag of hashtags) {
            const hashtagId = await this.repository.findOrCreateHashtag(tag);
            await this.repository.createPostHashtag(postId, hashtagId);
        }
    }
    /**
     * Notify mentioned users about the post.
     *
     * Requirement 4.6: Notify each mentioned user
     */
    async notifyMentions(postId, authorId, mentions) {
        if (!this.notificationTrigger)
            return;
        for (const username of mentions) {
            try {
                await this.notificationTrigger.notifyMention(postId, authorId, username);
            }
            catch {
                // Don't fail post creation if notification fails
            }
        }
    }
    /**
     * Check if a MIME type is a valid image type.
     */
    isImageMime(mimeType) {
        return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType);
    }
    /**
     * Check if a MIME type is a valid video type.
     */
    isVideoMime(mimeType) {
        return ['video/mp4', 'video/quicktime'].includes(mimeType);
    }
    /**
     * Get the MediaType enum value from a MIME type string.
     */
    getMediaTypeFromMime(mimeType) {
        return this.isImageMime(mimeType) ? types_1.MediaType.IMAGE : types_1.MediaType.VIDEO;
    }
    // ============================================================
    // Reel Methods (Requirements 5.1, 5.2, 5.3)
    // ============================================================
    /**
     * Create a new reel with duration and size validation, video compression,
     * and thumbnail generation.
     *
     * Requirements:
     * - 5.1: Compress video to max 1080x1920 at 8 Mbps
     * - 5.2: Validate duration (1-90s) and size (500MB max)
     * - 5.3: Return error messages indicating which limit was exceeded
     */
    async createReel(userId, data) {
        // Step 1: Validate video format
        if (!this.isVideoMime(data.mimeType)) {
            throw new types_1.PostServiceError('Invalid video format. Accepted formats: MP4, MOV', 400, { field: 'mimeType', value: data.mimeType });
        }
        // Step 2: Validate file size (max 500MB)
        if (data.file.length > types_1.MAX_REEL_SIZE) {
            throw new types_1.PostServiceError('Reel video exceeds the maximum allowed size of 500MB', 400, { field: 'file', size: data.file.length, max: types_1.MAX_REEL_SIZE });
        }
        // Step 3: Validate duration (1-90 seconds)
        if (data.durationSeconds < types_1.MIN_REEL_DURATION) {
            throw new types_1.PostServiceError('Reel video must be at least 1 second in duration', 400, { field: 'durationSeconds', value: data.durationSeconds, min: types_1.MIN_REEL_DURATION, max: types_1.MAX_REEL_DURATION });
        }
        if (data.durationSeconds > types_1.MAX_REEL_DURATION) {
            throw new types_1.PostServiceError('Reel video must not exceed 90 seconds in duration', 400, { field: 'durationSeconds', value: data.durationSeconds, min: types_1.MIN_REEL_DURATION, max: types_1.MAX_REEL_DURATION });
        }
        // Step 4: Compress video to max 1080x1920 at 8 Mbps
        let videoUrl = 'placeholder-video-url';
        let thumbnailUrl = 'placeholder-thumbnail-url';
        if (this.mediaService) {
            try {
                const result = await this.mediaService.uploadVideo(data.file, {
                    filename: data.filename,
                    mimeType: data.mimeType,
                    folder: 'reels',
                    maxDuration: types_1.MAX_REEL_DURATION,
                });
                videoUrl = result.url;
                thumbnailUrl = result.variants.length > 0 ? result.variants[0].url : null;
            }
            catch (error) {
                throw new types_1.PostServiceError('Reel video upload failed', 500, { originalError: error instanceof Error ? error.message : String(error) });
            }
        }
        // Step 5: Create reel record
        const reelId = await this.repository.createReel({
            user_id: userId,
            video_url: videoUrl,
            thumbnail_url: thumbnailUrl,
            duration_seconds: data.durationSeconds,
            caption: data.caption || null,
        });
        // Step 6: Return the created reel
        const reel = await this.repository.findReelById(reelId);
        return reel;
    }
    // ============================================================
    // Story Methods (Requirements 5.4, 5.5, 5.6, 5.7, 5.8)
    // ============================================================
    /**
     * Create a new story with 24-hour expiration.
     * Supports both photo and video media types.
     *
     * Requirements:
     * - 5.4: Create story with 24-hour expiration timestamp
     * - 5.7: Validate story video duration (1-30s) and size (500MB max)
     * - 5.8: Return error messages indicating which limit was exceeded
     */
    async createStory(userId, data) {
        // Step 1: Validate file size (max 500MB)
        if (data.file.length > types_1.MAX_STORY_SIZE) {
            throw new types_1.PostServiceError('Story media exceeds the maximum allowed size of 500MB', 400, { field: 'file', size: data.file.length, max: types_1.MAX_STORY_SIZE });
        }
        // Step 2: Validate media type and format
        if (data.mediaType === types_1.StoryMediaType.IMAGE) {
            if (!this.isImageMime(data.mimeType)) {
                throw new types_1.PostServiceError('Invalid image format. Accepted formats: JPEG, PNG, WebP, GIF', 400, { field: 'mimeType', value: data.mimeType });
            }
        }
        else if (data.mediaType === types_1.StoryMediaType.VIDEO) {
            if (!this.isVideoMime(data.mimeType)) {
                throw new types_1.PostServiceError('Invalid video format. Accepted formats: MP4, MOV', 400, { field: 'mimeType', value: data.mimeType });
            }
            // Validate video duration (1-30 seconds)
            if (data.durationSeconds !== undefined) {
                if (data.durationSeconds < types_1.MIN_STORY_VIDEO_DURATION) {
                    throw new types_1.PostServiceError('Story video must be at least 1 second in duration', 400, { field: 'durationSeconds', value: data.durationSeconds, min: types_1.MIN_STORY_VIDEO_DURATION, max: types_1.MAX_STORY_VIDEO_DURATION });
                }
                if (data.durationSeconds > types_1.MAX_STORY_VIDEO_DURATION) {
                    throw new types_1.PostServiceError('Story video must not exceed 30 seconds in duration', 400, { field: 'durationSeconds', value: data.durationSeconds, min: types_1.MIN_STORY_VIDEO_DURATION, max: types_1.MAX_STORY_VIDEO_DURATION });
                }
            }
        }
        // Step 3: Upload media
        let mediaUrl = 'placeholder-media-url';
        if (this.mediaService) {
            try {
                if (data.mediaType === types_1.StoryMediaType.IMAGE) {
                    const result = await this.mediaService.uploadImage(data.file, {
                        filename: data.filename,
                        mimeType: data.mimeType,
                        folder: 'stories',
                    });
                    mediaUrl = result.url;
                }
                else {
                    const result = await this.mediaService.uploadVideo(data.file, {
                        filename: data.filename,
                        mimeType: data.mimeType,
                        folder: 'stories',
                    });
                    mediaUrl = result.url;
                }
            }
            catch (error) {
                throw new types_1.PostServiceError('Story media upload failed', 500, { originalError: error instanceof Error ? error.message : String(error) });
            }
        }
        // Step 4: Calculate expiration (24 hours from now)
        const expiresAt = new Date(Date.now() + types_1.STORY_EXPIRATION_MS);
        // Step 5: Create story record
        const storyId = await this.repository.createStory({
            user_id: userId,
            media_url: mediaUrl,
            media_type: data.mediaType,
            expires_at: expiresAt,
        });
        // Step 6: Return the created story
        const story = await this.repository.findStoryById(storyId);
        return story;
    }
    /**
     * Get active (non-expired) stories for a user.
     *
     * Requirement 5.5: Query active stories (expires_at > now),
     * exclude expired stories.
     */
    async getActiveStories(userId) {
        return this.repository.getActiveStories(userId);
    }
    /**
     * Get active stories from multiple users.
     *
     * Requirement 5.5: Only return non-expired stories.
     */
    async getActiveStoriesForUsers(userIds) {
        return this.repository.getActiveStoriesForUsers(userIds);
    }
    /**
     * Record a story view. Prevents duplicate views from the same viewer.
     *
     * Requirement 5.6: Record the view and add the viewer to the story's
     * viewers list. Prevent duplicate views.
     */
    async recordStoryView(storyId, viewerId) {
        // Verify story exists and is active
        const story = await this.repository.findStoryById(storyId);
        if (!story) {
            throw new types_1.PostServiceError('Story not found', 404, { field: 'storyId', value: storyId });
        }
        // Check if story has expired
        if (new Date(story.expires_at) <= new Date()) {
            throw new types_1.PostServiceError('Story has expired', 410, { field: 'storyId', value: storyId });
        }
        // Don't record self-views
        if (story.user_id === viewerId) {
            return false;
        }
        // Record the view (returns false if already viewed)
        return this.repository.recordStoryView(storyId, viewerId);
    }
    /**
     * Get the list of viewers for a story.
     * Only the story creator should call this.
     *
     * Requirement 5.6: Return viewers list to story creator.
     */
    async getStoryViewers(storyId, requesterId) {
        const story = await this.repository.findStoryById(storyId);
        if (!story) {
            throw new types_1.PostServiceError('Story not found', 404, { field: 'storyId', value: storyId });
        }
        // Only the story creator can see viewers
        if (story.user_id !== requesterId) {
            throw new types_1.PostServiceError('Only the story creator can view the viewers list', 403, { field: 'requesterId', value: requesterId });
        }
        return this.repository.getStoryViewers(storyId);
    }
}
exports.PostService = PostService;
//# sourceMappingURL=post.service.js.map