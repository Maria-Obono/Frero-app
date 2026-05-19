"use strict";
/**
 * Auth service type definitions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthError = void 0;
class AuthError extends Error {
    statusCode;
    details;
    constructor(message, statusCode, details) {
        super(message);
        this.name = 'AuthError';
        this.statusCode = statusCode;
        this.details = details;
    }
}
exports.AuthError = AuthError;
//# sourceMappingURL=types.js.map