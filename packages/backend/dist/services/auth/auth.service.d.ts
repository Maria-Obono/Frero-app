/**
 * Authentication service handling user registration, login, token management.
 *
 * Requirements covered by register():
 * - 1.1: Valid registration creates account and returns tokens
 * - 1.2: Duplicate email/username returns specific error
 * - 1.3: Invalid inputs rejected with field-specific errors
 * - 1.7: Passwords hashed with bcrypt (work factor 10+)
 */
import { UserRepository } from './user.repository';
import { AuthTokens, DecodedToken, RegisterInput, LoginInput } from './types';
export declare class AuthService {
    private readonly userRepository;
    constructor(options?: {
        userRepository?: UserRepository;
    });
    /**
     * Register a new user account.
     *
     * Validates email (RFC 5322), username (3-30 alphanumeric), and password
     * (8-128 chars with uppercase, lowercase, digit, special char).
     * Hashes password with bcrypt (work factor 10+).
     * Checks for duplicate email/username and returns specific error.
     * Returns JWT access token and refresh token on success.
     *
     * @throws AuthError with statusCode 422 for validation failures
     * @throws AuthError with statusCode 409 for duplicate email/username
     */
    register(input: RegisterInput): Promise<AuthTokens>;
    /**
     * Authenticate a user by email or username and password.
     *
     * Uses constant-time bcrypt.compare for password verification.
     * Tracks failed login attempts in Redis (5 attempts / 15-min window).
     * Locks account for 15 minutes after 5 consecutive failures.
     * Returns JWT access token (15-min default) and refresh token (7-day default).
     *
     * Requirements covered:
     * - 1.4: Valid credentials return access token and refresh token
     * - 1.5: Invalid credentials return error after constant-time comparison
     * - 1.6: 5 consecutive failures in 15-min window locks account for 15 minutes
     *
     * @throws AuthError with statusCode 401 for invalid credentials
     * @throws AuthError with statusCode 423 for locked account
     */
    login(input: LoginInput): Promise<AuthTokens>;
    /**
     * Refresh access token using a valid refresh token.
     *
     * Verifies the refresh token JWT signature and checks if the session
     * exists in Redis. Implements token rotation by invalidating the old
     * refresh token and generating new access + refresh tokens.
     *
     * Requirements covered:
     * - 1.8: Valid refresh token issues new tokens with rotation (invalidate previous)
     * - 1.9: Expired/revoked/invalid refresh token rejected with auth error
     *
     * @throws AuthError with statusCode 401 for invalid/expired/revoked tokens
     */
    refreshToken(refreshToken: string): Promise<AuthTokens>;
    /**
     * Logout a user by invalidating their refresh token session.
     *
     * Verifies the refresh token and deletes the corresponding session
     * from Redis, effectively revoking the token.
     *
     * Requirements covered:
     * - 1.9: Token invalidation via session deletion
     *
     * @throws AuthError with statusCode 401 for invalid tokens
     */
    logout(userId: string, refreshToken: string): Promise<void>;
    /**
     * Verify a JWT access token and return the decoded payload.
     *
     * Requirements covered:
     * - 1.11: Expired/malformed JWT rejected with 401
     *
     * @throws AuthError with statusCode 401 for expired/malformed/invalid tokens
     */
    verifyAccessToken(token: string): Promise<DecodedToken>;
    /**
     * Enable two-factor authentication for a user.
     *
     * Generates a TOTP secret and QR code for the user to scan with
     * an authenticator app. Stores the secret in the user's totp_secret
     * column but does NOT enable 2FA yet (that happens on verify2FA).
     *
     * Requirements covered:
     * - 1.10: Two-factor authentication setup
     *
     * @returns Object with secret (base32) and qrCode (data URL)
     * @throws AuthError with statusCode 404 if user not found
     */
    enable2FA(userId: string): Promise<{
        secret: string;
        qrCode: string;
    }>;
    /**
     * Verify a TOTP code and enable 2FA for the user.
     *
     * Validates the provided TOTP code against the stored secret.
     * If valid, sets is_2fa_enabled = true in the user record.
     *
     * Requirements covered:
     * - 1.10: Two-factor authentication verification and activation
     *
     * @returns true if code is valid and 2FA is now enabled, false otherwise
     * @throws AuthError with statusCode 404 if user not found
     * @throws AuthError with statusCode 400 if no TOTP secret is configured
     */
    verify2FA(userId: string, code: string): Promise<boolean>;
    /**
     * Generate JWT access token and refresh token.
     * Access token: 15-min default expiration.
     * Refresh token: 7-day default expiration, stored in Redis.
     */
    private generateTokens;
    /**
     * Parse a time string like '15m', '7d', '1h' to seconds.
     */
    private parseExpirationToSeconds;
}
//# sourceMappingURL=auth.service.d.ts.map