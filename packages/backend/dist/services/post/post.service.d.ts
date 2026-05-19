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
import { MediaService } from '../media/media.service';
import { PostRepository } from './post.repository';
import { CreatePostDTO, PostWithMedia, CreateReelDTO, Reel, CreateStoryDTO, Story, StoryView } from './types';
/** Interface for notification triggering (decoupled from NotificationService) */
export interface INotificationTrigger {
    notifyMention(postId: number, postAuthorId: number, mentionedUsername: string): Promise<void>;
}
export interface PostServiceOptions {
    repository?: PostRepository;
    mediaService?: MediaService;
    notificationTrigger?: INotificationTrigger;
}
export declare class PostService {
    private readonly repository;
    private readonly mediaService;
    private readonly notificationTrigger;
    constructor(options?: PostServiceOptions);
    /**
     * Create a new post with content validation, media handling,
     * hashtag extraction, and mention notification.
     *
     * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11
     */
    createPost(userId: number, data: CreatePostDTO): Promise<PostWithMedia>;
    /**
     * Validate post content based on type.
     * Text posts require content between 1-5000 chars (Requirement 4.8).
     * Other post types allow optional content up to 5000 chars.
     */
    private validateContent;
    /**
     * Validate media items based on post type.
     * - Photo: 1-10 images, each max 15MB (Requirements 4.2, 4.11)
     * - Video: 1 video, max 500MB, max 10 min (Requirements 4.3, 4.11)
     * - Carousel: 2-10 items (Requirement 4.9)
     */
    private validateMedia;
    /**
     * Validate a single photo item (max 15MB, valid image type).
     */
    private validatePhotoItem;
    /**
     * Validate a single video item (max 500MB, max 10 min, valid video type).
     */
    private validateVideoItem;
    /**
     * Upload media items using the MediaService.
     * Returns an array of URLs in the same order as the input items.
     *
     * Requirement 4.10: If upload fails, the post is not persisted.
     */
    private uploadMedia;
    /**
     * Extract hashtags from post content.
     * Matches #word patterns, returns unique hashtags up to MAX_HASHTAGS_PER_POST.
     *
     * Requirement 4.5: Extract and index hashtags (max 30 per post)
     */
    extractHashtags(content: string): string[];
    /**
     * Extract mentions from post content.
     * Matches @word patterns, returns unique mentions up to MAX_MENTIONS_PER_POST.
     *
     * Requirement 4.6: Extract mentions and notify (max 20 per post)
     */
    extractMentions(content: string): string[];
    /**
     * Index extracted hashtags by creating/updating hashtag records
     * and linking them to the post.
     */
    private indexHashtags;
    /**
     * Notify mentioned users about the post.
     *
     * Requirement 4.6: Notify each mentioned user
     */
    private notifyMentions;
    /**
     * Check if a MIME type is a valid image type.
     */
    private isImageMime;
    /**
     * Check if a MIME type is a valid video type.
     */
    private isVideoMime;
    /**
     * Get the MediaType enum value from a MIME type string.
     */
    private getMediaTypeFromMime;
    /**
     * Create a new reel with duration and size validation, video compression,
     * and thumbnail generation.
     *
     * Requirements:
     * - 5.1: Compress video to max 1080x1920 at 8 Mbps
     * - 5.2: Validate duration (1-90s) and size (500MB max)
     * - 5.3: Return error messages indicating which limit was exceeded
     */
    createReel(userId: number, data: CreateReelDTO): Promise<Reel>;
    /**
     * Create a new story with 24-hour expiration.
     * Supports both photo and video media types.
     *
     * Requirements:
     * - 5.4: Create story with 24-hour expiration timestamp
     * - 5.7: Validate story video duration (1-30s) and size (500MB max)
     * - 5.8: Return error messages indicating which limit was exceeded
     */
    createStory(userId: number, data: CreateStoryDTO): Promise<Story>;
    /**
     * Get active (non-expired) stories for a user.
     *
     * Requirement 5.5: Query active stories (expires_at > now),
     * exclude expired stories.
     */
    getActiveStories(userId: number): Promise<Story[]>;
    /**
     * Get active stories from multiple users.
     *
     * Requirement 5.5: Only return non-expired stories.
     */
    getActiveStoriesForUsers(userIds: number[]): Promise<Story[]>;
    /**
     * Record a story view. Prevents duplicate views from the same viewer.
     *
     * Requirement 5.6: Record the view and add the viewer to the story's
     * viewers list. Prevent duplicate views.
     */
    recordStoryView(storyId: number, viewerId: number): Promise<boolean>;
    /**
     * Get the list of viewers for a story.
     * Only the story creator should call this.
     *
     * Requirement 5.6: Return viewers list to story creator.
     */
    getStoryViewers(storyId: number, requesterId: number): Promise<StoryView[]>;
}
//# sourceMappingURL=post.service.d.ts.map