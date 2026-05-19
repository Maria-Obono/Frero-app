"use strict";
/**
 * Notification service type definitions.
 *
 * Requirements covered:
 * - 8.1: Notification record with event_type, source_user_id, user_id, reference_id, timestamp
 * - 8.2: Queue for offline users, deliver on reconnection
 * - 8.3: Mark as read (single)
 * - 8.4: Mark all as read (batch)
 * - 8.8: Reverse chronological order, cursor pagination (default 20, max 50)
 * - 8.9: Unread count
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationError = exports.NoOpSocketAdapter = exports.NoOpPushAdapter = void 0;
/**
 * A no-op push adapter used when web push is not configured.
 */
class NoOpPushAdapter {
    async sendPush(_userId, _payload) {
        return false;
    }
}
exports.NoOpPushAdapter = NoOpPushAdapter;
/**
 * A no-op delivery adapter used when Socket.IO is not yet configured.
 * All notifications are treated as queued (offline delivery).
 */
class NoOpSocketAdapter {
    isUserConnected(_userId) {
        return false;
    }
    deliverNotification(_userId, _notification) {
        return false;
    }
}
exports.NoOpSocketAdapter = NoOpSocketAdapter;
class NotificationError extends Error {
    statusCode;
    details;
    constructor(message, statusCode, details) {
        super(message);
        this.name = 'NotificationError';
        this.statusCode = statusCode;
        this.details = details;
    }
}
exports.NotificationError = NotificationError;
//# sourceMappingURL=types.js.map