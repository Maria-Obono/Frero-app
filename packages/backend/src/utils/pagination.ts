import { z } from 'zod';

/**
 * API Gateway pagination parameter defaults and limits.
 * Per requirement 12.9: default limit of 20, maximum limit of 50.
 */
export const PAGINATION_DEFAULTS = {
  defaultLimit: 20,
  maxLimit: 50,
  minLimit: 1,
} as const;

/**
 * Zod schema for validating and transforming pagination query parameters.
 * Enforces default limit of 20 and maximum limit of 50.
 */
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null || val === '') {
        return PAGINATION_DEFAULTS.defaultLimit;
      }
      const num = typeof val === 'string' ? parseInt(val, 10) : val;
      if (isNaN(num)) {
        return PAGINATION_DEFAULTS.defaultLimit;
      }
      return Math.min(Math.max(num, PAGINATION_DEFAULTS.minLimit), PAGINATION_DEFAULTS.maxLimit);
    }),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

/**
 * Parse and clamp pagination parameters for API Gateway use.
 * Returns clamped limit (1-50, default 20) and optional cursor.
 */
export function parsePaginationParams(params: {
  cursor?: string;
  limit?: string | number;
}): { cursor?: string; limit: number } {
  const result = paginationSchema.parse(params);
  return {
    cursor: result.cursor,
    limit: result.limit,
  };
}
