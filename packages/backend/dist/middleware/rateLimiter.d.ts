import { Request, Response, NextFunction } from 'express';
interface RateLimitEntry {
    count: number;
    resetAt: number;
}
declare const memoryStore: Map<string, RateLimitEntry>;
declare function getIdentifier(req: Request): {
    key: string;
    isAuthenticated: boolean;
};
export declare function rateLimiter(req: Request, res: Response, next: NextFunction): void;
export { memoryStore, getIdentifier };
//# sourceMappingURL=rateLimiter.d.ts.map