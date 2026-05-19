/**
 * Authentication service handling user registration, login, token management.
 *
 * Requirements covered by register():
 * - 1.1: Valid registration creates account and returns tokens
 * - 1.2: Duplicate email/username returns specific error
 * - 1.3: Invalid inputs rejected with field-specific errors
 * - 1.7: Passwords hashed with bcrypt (work factor 10+)
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';

import { config } from '../../config';
import {
  storeSession,
  getSession,
  deleteSession,
  incrementLoginAttempts,
  resetLoginAttempts,
} from '../../utils/redis-utils';
import { UserRepository } from './user.repository';
import { AuthTokens, DecodedToken, RegisterInput, LoginInput, AuthError } from './types';
import { validateRegistrationInput } from './validators';

export class AuthService {
  private readonly userRepository: UserRepository;

  constructor(options?: { userRepository?: UserRepository }) {
    this.userRepository = options?.userRepository || new UserRepository();
  }

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
  async register(input: RegisterInput): Promise<AuthTokens> {
    const { email, username, password } = input;

    // Step 1: Validate inputs (Requirement 1.3)
    const validation = validateRegistrationInput(email, username, password);
    if (!validation.valid) {
      throw new AuthError('Validation failed', 422, {
        fields: validation.errors.reduce(
          (acc, err) => {
            const field = err.field;
            if (!acc[field]) acc[field] = [];
            acc[field]!.push(err.message);
            return acc;
          },
          {} as Record<string, string[]>,
        ),
      });
    }

    // Step 2: Check for duplicate email/username (Requirement 1.2)
    const [emailExists, usernameExists] = await Promise.all([
      this.userRepository.emailExists(email),
      this.userRepository.usernameExists(username),
    ]);

    if (emailExists && usernameExists) {
      throw new AuthError('Registration failed', 409, {
        duplicateFields: ['email', 'username'],
        message: 'Both email and username are already in use',
      });
    }

    if (emailExists) {
      throw new AuthError('Registration failed', 409, {
        duplicateFields: ['email'],
        message: 'Email is already in use',
      });
    }

    if (usernameExists) {
      throw new AuthError('Registration failed', 409, {
        duplicateFields: ['username'],
        message: 'Username is already in use',
      });
    }

    // Step 3: Hash password with bcrypt (Requirement 1.7)
    const saltRounds = Math.max(10, config.bcrypt.saltRounds);
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Step 4: Create user record
    const user = await this.userRepository.createUser({
      email,
      username,
      password_hash: passwordHash,
    });

    // Step 5: Generate tokens and store refresh token in Redis
    const tokens = await this.generateTokens(user.id, user.email, user.username, user.role);

    return tokens;
  }

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
  async login(input: LoginInput): Promise<AuthTokens> {
    const { identifier, password } = input;

    // Step 1: Find user by email or username (case-insensitive)
    const user = await this.userRepository.findByEmailOrUsername(identifier);

    if (!user) {
      // Perform a dummy bcrypt compare to maintain constant-time behavior
      // even when the user doesn't exist (Requirement 1.5)
      await bcrypt.compare(password, '$2b$10$invalidhashfortiminginvalidhashforti');
      throw new AuthError('Invalid credentials', 401, {
        message: 'The email/username or password is incorrect',
      });
    }

    // Step 2: Check if account is locked (locked_until > now)
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new AuthError('Account locked', 423, {
        message: 'Account is temporarily locked due to too many failed login attempts',
        lockedUntil: user.locked_until,
      });
    }

    // Step 3: Constant-time password comparison using bcrypt (Requirement 1.5)
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      // Step 4: On failure - increment Redis counter
      const attempts = await incrementLoginAttempts(String(user.id));

      // If 5th failure, set locked_until in DB (Requirement 1.6)
      if (attempts >= 5) {
        const lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        await this.userRepository.updateLockedUntil(user.id, lockedUntil);
      }

      throw new AuthError('Invalid credentials', 401, {
        message: 'The email/username or password is incorrect',
      });
    }

    // Step 5: On success - reset login attempts
    await resetLoginAttempts(String(user.id));

    // Clear locked_until if it was previously set
    if (user.locked_until) {
      await this.userRepository.updateLockedUntil(user.id, null);
    }

    // Step 6: Check if 2FA is enabled (Requirement 1.10)
    if (user.is_2fa_enabled && user.totp_secret) {
      const { totpCode } = input;
      if (!totpCode) {
        throw new AuthError('TOTP code required', 401, {
          message: 'Two-factor authentication code is required',
          code: '2FA_REQUIRED',
        });
      }

      const totp = new OTPAuth.TOTP({
        issuer: 'Frero',
        label: user.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(user.totp_secret),
      });

      const delta = totp.validate({ token: totpCode, window: 1 });
      if (delta === null) {
        throw new AuthError('Invalid TOTP code', 401, {
          message: 'The two-factor authentication code is invalid',
          code: 'INVALID_TOTP',
        });
      }
    }

    const tokens = await this.generateTokens(user.id, user.email, user.username, user.role);

    return tokens;
  }

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
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    // Step 1: Verify the refresh token JWT signature
    let decoded: { userId: number; tokenId: string; type: string };
    try {
      decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as {
        userId: number;
        tokenId: string;
        type: string;
      };
    } catch (err) {
      const message =
        err instanceof jwt.TokenExpiredError
          ? 'Refresh token has expired'
          : 'Invalid refresh token';
      throw new AuthError(message, 401, {
        message,
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    // Step 2: Validate token type
    if (decoded.type !== 'refresh') {
      throw new AuthError('Invalid token type', 401, {
        message: 'Token is not a refresh token',
        code: 'INVALID_TOKEN_TYPE',
      });
    }

    // Step 3: Check if the session exists in Redis (not revoked)
    const sessionData = await getSession(String(decoded.userId), decoded.tokenId);
    if (!sessionData) {
      throw new AuthError('Refresh token revoked', 401, {
        message: 'Refresh token has been revoked or does not exist',
        code: 'TOKEN_REVOKED',
      });
    }

    // Step 4: Parse session data to get user info
    const session = JSON.parse(sessionData) as {
      userId: number;
      email: string;
      username: string;
      role: string;
    };

    // Step 5: Invalidate the old refresh token (token rotation - Requirement 1.8)
    await deleteSession(String(decoded.userId), decoded.tokenId);

    // Step 6: Generate new access + refresh tokens
    const tokens = await this.generateTokens(
      session.userId,
      session.email,
      session.username,
      session.role,
    );

    return tokens;
  }

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
  async logout(userId: string, refreshToken: string): Promise<void> {
    // Step 1: Verify the refresh token JWT signature
    let decoded: { userId: number; tokenId: string; type: string };
    try {
      decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as {
        userId: number;
        tokenId: string;
        type: string;
      };
    } catch {
      throw new AuthError('Invalid refresh token', 401, {
        message: 'Refresh token is invalid or expired',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    // Step 2: Verify the token belongs to the requesting user
    if (String(decoded.userId) !== userId) {
      throw new AuthError('Token mismatch', 401, {
        message: 'Refresh token does not belong to this user',
        code: 'TOKEN_MISMATCH',
      });
    }

    // Step 3: Delete the session from Redis (invalidate the refresh token)
    await deleteSession(userId, decoded.tokenId);
  }

  /**
   * Verify a JWT access token and return the decoded payload.
   *
   * Requirements covered:
   * - 1.11: Expired/malformed JWT rejected with 401
   *
   * @throws AuthError with statusCode 401 for expired/malformed/invalid tokens
   */
  async verifyAccessToken(token: string): Promise<DecodedToken> {
    try {
      const decoded = jwt.verify(token, config.jwt.accessSecret) as DecodedToken;
      return decoded;
    } catch (err) {
      let message = 'Invalid access token';
      if (err instanceof jwt.TokenExpiredError) {
        message = 'Access token has expired';
      } else if (err instanceof jwt.JsonWebTokenError) {
        message = 'Access token is malformed or invalid';
      }
      throw new AuthError(message, 401, {
        message,
        code: 'INVALID_ACCESS_TOKEN',
      });
    }
  }

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
  async enable2FA(userId: string): Promise<{ secret: string; qrCode: string }> {
    // Step 1: Find the user
    const user = await this.userRepository.findById(Number(userId));
    if (!user) {
      throw new AuthError('User not found', 404, {
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    // Step 2: Generate a new TOTP secret
    const secret = new OTPAuth.Secret({ size: 20 });

    // Step 3: Create TOTP instance for URI generation
    const totp = new OTPAuth.TOTP({
      issuer: 'Frero',
      label: (user as any).email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    // Step 4: Generate QR code data URL from the otpauth URI
    const otpauthUri = totp.toString();
    const qrCode = await QRCode.toDataURL(otpauthUri);

    // Step 5: Store the secret in the user's record (but don't enable 2FA yet)
    await this.userRepository.update(Number(userId), {
      totp_secret: secret.base32,
    } as any);

    return {
      secret: secret.base32,
      qrCode,
    };
  }

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
  async verify2FA(userId: string, code: string): Promise<boolean> {
    // Step 1: Find the user
    const user = await this.userRepository.findById(Number(userId));
    if (!user) {
      throw new AuthError('User not found', 404, {
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    const userRecord = user as any;

    // Step 2: Check that a TOTP secret exists
    if (!userRecord.totp_secret) {
      throw new AuthError('2FA not configured', 400, {
        message: 'Two-factor authentication has not been set up. Call enable2FA first.',
        code: '2FA_NOT_CONFIGURED',
      });
    }

    // Step 3: Validate the TOTP code
    const totp = new OTPAuth.TOTP({
      issuer: 'Frero',
      label: userRecord.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(userRecord.totp_secret),
    });

    const delta = totp.validate({ token: code, window: 1 });

    if (delta === null) {
      return false;
    }

    // Step 4: Enable 2FA in the user record
    await this.userRepository.update(Number(userId), {
      is_2fa_enabled: true,
    } as any);

    return true;
  }

  /**
   * Generate JWT access token and refresh token.
   * Access token: 15-min default expiration.
   * Refresh token: 7-day default expiration, stored in Redis.
   */
  private async generateTokens(
    userId: number,
    email: string,
    username: string,
    role: string,
  ): Promise<AuthTokens> {
    const tokenId = uuidv4();

    // Parse expiration for access token
    const accessExpiresIn = this.parseExpirationToSeconds(config.jwt.accessExpiresIn);
    const refreshExpiresInSeconds = this.parseExpirationToSeconds(config.jwt.refreshExpiresIn);

    // Generate access token
    const accessToken = jwt.sign(
      {
        userId,
        email,
        username,
        role,
        tokenId,
      },
      config.jwt.accessSecret,
      { expiresIn: accessExpiresIn },
    );

    // Generate refresh token
    const refreshTokenId = uuidv4();
    const refreshToken = jwt.sign(
      {
        userId,
        tokenId: refreshTokenId,
        type: 'refresh',
      },
      config.jwt.refreshSecret,
      { expiresIn: refreshExpiresInSeconds },
    );

    // Store refresh token in Redis (Requirement: session storage)
    await storeSession(
      String(userId),
      refreshTokenId,
      JSON.stringify({ userId, email, username, role, createdAt: Date.now() }),
      refreshExpiresInSeconds,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresIn,
    };
  }

  /**
   * Parse a time string like '15m', '7d', '1h' to seconds.
   */
  private parseExpirationToSeconds(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      // Default to 15 minutes if format is unrecognized
      return 900;
    }

    const value = parseInt(match[1]!, 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 900;
    }
  }
}
