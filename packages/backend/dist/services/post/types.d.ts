/**
 * Post service type definitions.
 *
 * Covers Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11
 * Covers Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
 */
export declare enum PostType {
    TEXT = "text",
    PHOTO = "photo",
    VIDEO = "video",
    CAROUSEL = "carousel"
}
export declare enum PostPrivacy {
    PUBLIC = "public",
    FRIENDS = "friends",
    PRIVATE = "private"
}
export declare enum MediaType {
    IMAGE = "image",
    VIDEO = "video"
}
export interface CreatePostDTO {
    type: PostType;
    content?: string;
    privacy: PostPrivacy;
    media?: MediaItem[];
}
export interface MediaItem {
    file: Buffer;
    mimeType: string;
    filename: string;
    width?: number;
    height?: number;
    durationSeconds?: number;
}
export interface Post {
    id: number;
    user_id: number;
    type: PostType;
    content: string | null;
    privacy: PostPrivacy;
    like_count: number;
    comment_count: number;
    share_count: number;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}
export interface PostMedia {
    id: number;
    post_id: number;
    url: string;
    type: MediaType;
    order_index: number;
    width: number | null;
    height: number | null;
    duration_seconds: number | null;
    created_at: Date;
}
export interface Hashtag {
    id: number;
    name: string;
    post_count: number;
    created_at: Date;
}
export interface PostHashtag {
    id: number;
    post_id: number;
    hashtag_id: number;
}
export interface PostWithMedia extends Post {
    media: PostMedia[];
    hashtags: string[];
}
export declare class PostServiceError extends Error {
    readonly statusCode: number;
    readonly details?: Record<string, unknown>;
    constructor(message: string, statusCode: number, details?: Record<string, unknown>);
}
/** Minimum content length for text posts */
export declare const MIN_CONTENT_LENGTH = 1;
/** Maximum content length for posts (Requirement 4.8) */
export declare const MAX_CONTENT_LENGTH = 5000;
/** Minimum carousel items (Requirement 4.9) */
export declare const MIN_CAROUSEL_ITEMS = 2;
/** Maximum carousel items (Requirement 4.9) */
export declare const MAX_CAROUSEL_ITEMS = 10;
/** Maximum hashtags per post (Requirement 4.5) */
export declare const MAX_HASHTAGS_PER_POST = 30;
/** Maximum mentions per post (Requirement 4.6) */
export declare const MAX_MENTIONS_PER_POST = 20;
/** Maximum photo size: 15MB (Requirement 4.11) */
export declare const MAX_PHOTO_SIZE: number;
/** Maximum video size: 500MB (Requirement 4.11) */
export declare const MAX_VIDEO_SIZE: number;
/** Maximum video duration: 10 minutes in seconds (Requirement 4.11) */
export declare const MAX_VIDEO_DURATION = 600;
/** Likeable entity types matching the DB enum */
export declare enum LikeableType {
    POST = "post",
    REEL = "reel",
    COMMENT = "comment"
}
export interface Like {
    id: number;
    user_id: number;
    likeable_id: number;
    likeable_type: LikeableType;
    created_at: Date;
}
export interface Comment {
    id: number;
    post_id: number;
    user_id: number;
    parent_comment_id: number | null;
    content: string;
    depth: number;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}
export interface Share {
    id: number;
    user_id: number;
    post_id: number;
    created_at: Date;
}
export interface Bookmark {
    id: number;
    user_id: number;
    post_id: number;
    created_at: Date;
}
export interface CreateCommentDTO {
    content: string;
    parentCommentId?: number;
}
export interface EngagementCounts {
    likes: number;
    comments: number;
    shares: number;
}
/** Minimum comment length (Requirement 6.5, 6.6) */
export declare const MIN_COMMENT_LENGTH = 1;
/** Maximum comment length (Requirement 6.5, 6.6) */
export declare const MAX_COMMENT_LENGTH = 2000;
/** Maximum comment nesting depth (Requirement 6.7, 6.8) */
export declare const MAX_COMMENT_DEPTH = 3;
/** Redis cache TTL for engagement counts in seconds (Requirement 6.14) */
export declare const ENGAGEMENT_CACHE_TTL = 5;
export interface CreateReelDTO {
    file: Buffer;
    mimeType: string;
    filename: string;
    durationSeconds: number;
    caption?: string;
}
export interface Reel {
    id: number;
    user_id: number;
    video_url: string;
    thumbnail_url: string | null;
    duration_seconds: number;
    caption: string | null;
    like_count: number;
    comment_count: number;
    share_count: number;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}
/** Minimum reel duration: 1 second (Requirement 5.2) */
export declare const MIN_REEL_DURATION = 1;
/** Maximum reel duration: 90 seconds (Requirement 5.2) */
export declare const MAX_REEL_DURATION = 90;
/** Maximum reel file size: 500MB (Requirement 5.2) */
export declare const MAX_REEL_SIZE: number;
/** Reel compression max width (Requirement 5.1) */
export declare const REEL_MAX_WIDTH = 1080;
/** Reel compression max height (Requirement 5.1) */
export declare const REEL_MAX_HEIGHT = 1920;
/** Reel compression max bitrate in bps (Requirement 5.1) */
export declare const REEL_MAX_BITRATE = 8000000;
export declare enum StoryMediaType {
    IMAGE = "image",
    VIDEO = "video"
}
export interface CreateStoryDTO {
    file: Buffer;
    mimeType: string;
    filename: string;
    mediaType: StoryMediaType;
    durationSeconds?: number;
}
export interface Story {
    id: number;
    user_id: number;
    media_url: string;
    media_type: StoryMediaType;
    expires_at: Date;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}
export interface StoryView {
    id: number;
    story_id: number;
    viewer_id: number;
    created_at: Date;
}
/** Story expiration duration: 24 hours in milliseconds (Requirement 5.4) */
export declare const STORY_EXPIRATION_MS: number;
/** Minimum story video duration: 1 second (Requirement 5.7) */
export declare const MIN_STORY_VIDEO_DURATION = 1;
/** Maximum story video duration: 30 seconds (Requirement 5.7) */
export declare const MAX_STORY_VIDEO_DURATION = 30;
/** Maximum story file size: 500MB (Requirement 5.7) */
export declare const MAX_STORY_SIZE: number;
//# sourceMappingURL=types.d.ts.map