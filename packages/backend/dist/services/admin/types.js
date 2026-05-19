"use strict";
/**
 * Admin service type definitions.
 *
 * Requirements covered:
 * - 11.1: Dashboard analytics (active users, posts, comments, likes)
 * - 11.2: Content reporting (reporter ID, content ID, reason, timestamp)
 * - 11.3: Moderation actions (dismiss, warn, remove content, suspend user)
 * - 11.4: Admin user search with activity history
 * - 11.5: Role enforcement (admin/moderator only)
 * - 11.6: User suspension with session invalidation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminServiceError = void 0;
class AdminServiceError extends Error {
    statusCode;
    details;
    constructor(message, statusCode, details) {
        super(message);
        this.name = 'AdminServiceError';
        this.statusCode = statusCode;
        this.details = details;
    }
}
exports.AdminServiceError = AdminServiceError;
//# sourceMappingURL=types.js.map