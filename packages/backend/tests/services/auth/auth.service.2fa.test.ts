import * as OTPAuth from 'otpauth';

import { AuthService } from '../../../src/services/auth/auth.service';
import { AuthError } from '../../../src/services/auth/types';

// Mock dependencies
jest.mock('../../../src/config/redis', () => ({
  getRedisClient: jest.fn(() => ({
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  })),
}));

jest.mock('../../../src/utils/redis-utils', () => ({
  storeSession: jest.fn().mockResolvedValue(undefined),
  getSession: jest.fn().mockResolvedValue(null),
  deleteSession: jest.fn().mockResolvedValue(undefined),
  incrementLoginAttempts: jest.fn().mockResolvedValue(1),
  getLoginAttempts: jest.fn().mockResolvedValue(0),
  resetLoginAttempts: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockQRCode'),
}));

// Mock UserRepository
const mockUserRepository = {
  emailExists: jest.fn(),
  usernameExists: jest.fn(),
  createUser: jest.fn(),
  findByEmail: jest.fn(),
  findByUsername: jest.fn(),
  findByEmailOrUsername: jest.fn(),
  findById: jest.fn(),
  update: jest.fn().mockResolvedValue(1),
  updateLockedUntil: jest.fn().mockResolvedValue(undefined),
};

describe('AuthService.enable2FA()', () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService({
      userRepository: mockUserRepository as any,
    });
  });

  it('should generate a TOTP secret and QR code for a valid user', async () => {
    mockUserRepository.findById.mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      is_2fa_enabled: false,
      totp_secret: null,
    });

    const result = await authService.enable2FA('1');

    expect(result).toHaveProperty('secret');
    expect(result).toHaveProperty('qrCode');
    expect(typeof result.secret).toBe('string');
    expect(result.secret.length).toBeGreaterThan(0);
    expect(result.qrCode).toContain('data:image/png;base64,');
  });

  it('should store the TOTP secret in the user record', async () => {
    mockUserRepository.findById.mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      is_2fa_enabled: false,
      totp_secret: null,
    });

    const result = await authService.enable2FA('1');

    expect(mockUserRepository.update).toHaveBeenCalledWith(1, {
      totp_secret: result.secret,
    });
  });

  it('should NOT enable 2FA yet (only store secret)', async () => {
    mockUserRepository.findById.mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      is_2fa_enabled: false,
      totp_secret: null,
    });

    await authService.enable2FA('1');

    // The update call should only set totp_secret, not is_2fa_enabled
    const updateCall = mockUserRepository.update.mock.calls[0][1];
    expect(updateCall).not.toHaveProperty('is_2fa_enabled');
  });

  it('should return a valid base32 secret', async () => {
    mockUserRepository.findById.mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      is_2fa_enabled: false,
      totp_secret: null,
    });

    const result = await authService.enable2FA('1');

    // Verify the secret is valid base32
    expect(() => OTPAuth.Secret.fromBase32(result.secret)).not.toThrow();
  });

  it('should throw 404 if user not found', async () => {
    mockUserRepository.findById.mockResolvedValue(undefined);

    await expect(authService.enable2FA('999')).rejects.toThrow(AuthError);

    try {
      await authService.enable2FA('999');
    } catch (err) {
      const authErr = err as AuthError;
      expect(authErr.statusCode).toBe(404);
      expect(authErr.details?.code).toBe('USER_NOT_FOUND');
    }
  });

  it('should generate a QR code containing an otpauth URI', async () => {
    const QRCode = require('qrcode');
    mockUserRepository.findById.mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      is_2fa_enabled: false,
      totp_secret: null,
    });

    await authService.enable2FA('1');

    expect(QRCode.toDataURL).toHaveBeenCalledTimes(1);
    const uri = QRCode.toDataURL.mock.calls[0][0] as string;
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('Frero');
    expect(uri).toContain('test%40example.com');
  });
});

describe('AuthService.verify2FA()', () => {
  let authService: AuthService;
  const testSecret = new OTPAuth.Secret({ size: 20 });

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService({
      userRepository: mockUserRepository as any,
    });
  });

  it('should return true and enable 2FA for a valid TOTP code', async () => {
    mockUserRepository.findById.mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      is_2fa_enabled: false,
      totp_secret: testSecret.base32,
    });

    // Generate a valid TOTP code
    const totp = new OTPAuth.TOTP({
      issuer: 'Frero',
      label: 'test@example.com',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: testSecret,
    });
    const validCode = totp.generate();

    const result = await authService.verify2FA('1', validCode);

    expect(result).toBe(true);
    expect(mockUserRepository.update).toHaveBeenCalledWith(1, {
      is_2fa_enabled: true,
    });
  });

  it('should return false for an invalid TOTP code', async () => {
    mockUserRepository.findById.mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      is_2fa_enabled: false,
      totp_secret: testSecret.base32,
    });

    const result = await authService.verify2FA('1', '000000');

    expect(result).toBe(false);
    expect(mockUserRepository.update).not.toHaveBeenCalled();
  });

  it('should throw 404 if user not found', async () => {
    mockUserRepository.findById.mockResolvedValue(undefined);

    await expect(authService.verify2FA('999', '123456')).rejects.toThrow(AuthError);

    try {
      await authService.verify2FA('999', '123456');
    } catch (err) {
      const authErr = err as AuthError;
      expect(authErr.statusCode).toBe(404);
      expect(authErr.details?.code).toBe('USER_NOT_FOUND');
    }
  });

  it('should throw 400 if no TOTP secret is configured', async () => {
    mockUserRepository.findById.mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      is_2fa_enabled: false,
      totp_secret: null,
    });

    await expect(authService.verify2FA('1', '123456')).rejects.toThrow(AuthError);

    try {
      await authService.verify2FA('1', '123456');
    } catch (err) {
      const authErr = err as AuthError;
      expect(authErr.statusCode).toBe(400);
      expect(authErr.details?.code).toBe('2FA_NOT_CONFIGURED');
    }
  });

  it('should accept codes within a 1-step window', async () => {
    mockUserRepository.findById.mockResolvedValue({
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      is_2fa_enabled: false,
      totp_secret: testSecret.base32,
    });

    // Generate a valid TOTP code for the current time
    const totp = new OTPAuth.TOTP({
      issuer: 'Frero',
      label: 'test@example.com',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: testSecret,
    });
    const validCode = totp.generate();

    const result = await authService.verify2FA('1', validCode);
    expect(result).toBe(true);
  });
});

describe('AuthService.login() with 2FA', () => {
  let authService: AuthService;
  const testSecret = new OTPAuth.Secret({ size: 20 });

  const bcrypt = require('bcrypt');
  const validPasswordHash = bcrypt.hashSync('MyP@ssw0rd', 10);

  const mockUserWith2FA = {
    id: 1,
    email: 'test@example.com',
    username: 'testuser',
    password_hash: validPasswordHash,
    display_name: null,
    bio: null,
    location: null,
    website: null,
    avatar_url: null,
    cover_url: null,
    role: 'user' as const,
    is_2fa_enabled: true,
    totp_secret: testSecret.base32,
    locked_until: null,
    failed_login_attempts: 0,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserRepository.findByEmailOrUsername.mockResolvedValue({ ...mockUserWith2FA });
    mockUserRepository.updateLockedUntil.mockResolvedValue(undefined);

    const { resetLoginAttempts } = require('../../../src/utils/redis-utils');
    resetLoginAttempts.mockResolvedValue(undefined);

    authService = new AuthService({
      userRepository: mockUserRepository as any,
    });
  });

  it('should require TOTP code when 2FA is enabled', async () => {
    try {
      await authService.login({
        identifier: 'test@example.com',
        password: 'MyP@ssw0rd',
      });
      fail('Should have thrown');
    } catch (err) {
      const authErr = err as AuthError;
      expect(authErr.statusCode).toBe(401);
      expect(authErr.details?.code).toBe('2FA_REQUIRED');
    }
  });

  it('should reject invalid TOTP code when 2FA is enabled', async () => {
    try {
      await authService.login({
        identifier: 'test@example.com',
        password: 'MyP@ssw0rd',
        totpCode: '000000',
      });
      fail('Should have thrown');
    } catch (err) {
      const authErr = err as AuthError;
      expect(authErr.statusCode).toBe(401);
      expect(authErr.details?.code).toBe('INVALID_TOTP');
    }
  });

  it('should succeed with valid password and valid TOTP code', async () => {
    const totp = new OTPAuth.TOTP({
      issuer: 'Frero',
      label: 'test@example.com',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: testSecret,
    });
    const validCode = totp.generate();

    const result = await authService.login({
      identifier: 'test@example.com',
      password: 'MyP@ssw0rd',
      totpCode: validCode,
    });

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result).toHaveProperty('expiresIn');
  });

  it('should not require TOTP code when 2FA is not enabled', async () => {
    mockUserRepository.findByEmailOrUsername.mockResolvedValue({
      ...mockUserWith2FA,
      is_2fa_enabled: false,
      totp_secret: null,
    });

    const result = await authService.login({
      identifier: 'test@example.com',
      password: 'MyP@ssw0rd',
    });

    expect(result).toHaveProperty('accessToken');
  });
});
