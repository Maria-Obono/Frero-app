import { z } from 'zod';
/**
 * API Gateway pagination parameter defaults and limits.
 * Per requirement 12.9: default limit of 20, maximum limit of 50.
 */
export declare const PAGINATION_DEFAULTS: {
    readonly defaultLimit: 20;
    readonly maxLimit: 50;
    readonly minLimit: 1;
};
/**
 * Zod schema for validating and transforming pagination query parameters.
 * Enforces default limit of 20 and maximum limit of 50.
 */
export declare const paginationSchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>, number, string | number | undefined>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    cursor?: string | undefined;
}, {
    cursor?: string | undefined;
    limit?: string | number | undefined;
}>;
export type PaginationParams = z.infer<typeof paginationSchema>;
/**
 * Parse and clamp pagination parameters for API Gateway use.
 * Returns clamped limit (1-50, default 20) and optional cursor.
 */
export declare function parsePaginationParams(params: {
    cursor?: string;
    limit?: string | number;
}): {
    cursor?: string;
    limit: number;
};
//# sourceMappingURL=pagination.d.ts.map