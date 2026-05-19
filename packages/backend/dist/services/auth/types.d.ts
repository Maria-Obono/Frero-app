/**
 * Auth service type definitions.
 */
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}
export interface DecodedToken {
    userId: number;
    email: string;
    username: string;
    role: string;
    tokenId: string;
    iat: number;
    exp: number;
}
export interface RegisterInput {
    email: string;
    username: string;
    password: string;
}
export interface LoginInput {
    identifier: string;
    password: string;
    totpCode?: string;
}
export interface UserRecord {
    id: number;
    email: string;
    username: string;
    password_hash: string;
    display_name: string | null;
    bio: string | null;
    location: string | null;
    website: string | null;
    avatar_url: string | null;
    cover_url: string | null;
    role: 'user' | 'moderator' | 'admin';
    is_2fa_enabled: boolean;
    totp_secret: string | null;
    locked_until: Date | null;
    failed_login_attempts: number;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}
export interface ValidationError {
    field: string;
    message: string;
}
export interface RegistrationValidationResult {
    valid: boolean;
    errors: ValidationError[];
}
export declare class AuthError extends Error {
    readonly statusCode: number;
    readonly details?: Record<string, unknown>;
    constructor(message: string, statusCode: number, details?: Record<string, unknown>);
}
//# sourceMappingURL=types.d.ts.map