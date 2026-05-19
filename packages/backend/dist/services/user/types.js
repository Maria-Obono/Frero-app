"use strict";
/**
 * User service type definitions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserServiceError = exports.PUBLIC_VISIBLE_FIELDS = exports.OWNER_VISIBLE_FIELDS = void 0;
/**
 * Fields visible to the profile owner (all fields).
 */
exports.OWNER_VISIBLE_FIELDS = [
    'id',
    'username',
    'email',
    'display_name',
    'bio',
    'location',
    'website',
    'avatar_url',
    'cover_url',
    'role',
    'created_at',
];
/**
 * Fields visible to other users (public fields only).
 * Requirement 2.5: Only publicly visible fields returned to non-owners.
 */
exports.PUBLIC_VISIBLE_FIELDS = [
    'id',
    'username',
    'display_name',
    'bio',
    'location',
    'website',
    'avatar_url',
    'cover_url',
    'role',
    'created_at',
];
class UserServiceError extends Error {
    statusCode;
    errors;
    constructor(message, statusCode, errors) {
        super(message);
        this.name = 'UserServiceError';
        this.statusCode = statusCode;
        this.errors = errors;
    }
}
exports.UserServiceError = UserServiceError;
//# sourceMappingURL=types.js.map