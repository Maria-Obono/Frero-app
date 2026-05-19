import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
/**
 * Middleware factory that validates request body against a Zod schema.
 * Returns 422 with field-specific errors if validation fails.
 */
export declare function validateBody(schema: ZodSchema): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Middleware factory that validates request query parameters against a Zod schema.
 */
export declare function validateQuery(schema: ZodSchema): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Middleware factory that validates request params against a Zod schema.
 */
export declare function validateParams(schema: ZodSchema): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=validateBody.d.ts.map