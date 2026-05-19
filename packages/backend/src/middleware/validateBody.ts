import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Middleware factory that validates request body against a Zod schema.
 * Returns 422 with field-specific errors if validation fails.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const fieldErrors = formatZodErrors(result.error);

      res.status(422).json({
        status: 422,
        error: 'Unprocessable Entity',
        message: 'Request body validation failed',
        requestId: req.requestId || 'unknown',
        details: {
          fields: fieldErrors,
        },
      });
      return;
    }

    // Replace body with parsed/transformed data
    req.body = result.data;
    next();
  };
}

/**
 * Middleware factory that validates request query parameters against a Zod schema.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const fieldErrors = formatZodErrors(result.error);

      res.status(422).json({
        status: 422,
        error: 'Unprocessable Entity',
        message: 'Query parameter validation failed',
        requestId: req.requestId || 'unknown',
        details: {
          fields: fieldErrors,
        },
      });
      return;
    }

    req.query = result.data;
    next();
  };
}

/**
 * Middleware factory that validates request params against a Zod schema.
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const fieldErrors = formatZodErrors(result.error);

      res.status(422).json({
        status: 422,
        error: 'Unprocessable Entity',
        message: 'Path parameter validation failed',
        requestId: req.requestId || 'unknown',
        details: {
          fields: fieldErrors,
        },
      });
      return;
    }

    req.params = result.data;
    next();
  };
}

function formatZodErrors(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_root';
    if (!fieldErrors[path]) {
      fieldErrors[path] = [];
    }
    fieldErrors[path].push(issue.message);
  }

  return fieldErrors;
}
