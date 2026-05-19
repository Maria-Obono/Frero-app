"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginationSchema = exports.PAGINATION_DEFAULTS = void 0;
exports.parsePaginationParams = parsePaginationParams;
const zod_1 = require("zod");
/**
 * API Gateway pagination parameter defaults and limits.
 * Per requirement 12.9: default limit of 20, maximum limit of 50.
 */
exports.PAGINATION_DEFAULTS = {
    defaultLimit: 20,
    maxLimit: 50,
    minLimit: 1,
};
/**
 * Zod schema for validating and transforming pagination query parameters.
 * Enforces default limit of 20 and maximum limit of 50.
 */
exports.paginationSchema = zod_1.z.object({
    cursor: zod_1.z.string().optional(),
    limit: zod_1.z
        .union([zod_1.z.string(), zod_1.z.number()])
        .optional()
        .transform((val) => {
        if (val === undefined || val === null || val === '') {
            return exports.PAGINATION_DEFAULTS.defaultLimit;
        }
        const num = typeof val === 'string' ? parseInt(val, 10) : val;
        if (isNaN(num)) {
            return exports.PAGINATION_DEFAULTS.defaultLimit;
        }
        return Math.min(Math.max(num, exports.PAGINATION_DEFAULTS.minLimit), exports.PAGINATION_DEFAULTS.maxLimit);
    }),
});
/**
 * Parse and clamp pagination parameters for API Gateway use.
 * Returns clamped limit (1-50, default 20) and optional cursor.
 */
function parsePaginationParams(params) {
    const result = exports.paginationSchema.parse(params);
    return {
        cursor: result.cursor,
        limit: result.limit,
    };
}
//# sourceMappingURL=pagination.js.map