import {
  validateEmail,
  validateUsername,
  validatePassword,
  validateRegistrationInput,
} from '../../../src/services/auth/validators';

describe('Auth Validators', () => {
  describe('validateEmail', () => {
    it('should accept valid emails', () => {
      expect(validateEmail('user@example.com')).toBeNull();
      expect(validateEmail('test.user@domain.org')).toBeNull();
      expect(validateEmail('user+tag@sub.domain.co')).toBeNull();
      expect(validateEmail('a@b.io')).toBeNull();
    });

    it('should reject empty email', () => {
      const error = validateEmail('');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('email');
    });

    it('should reject email without @', () => {
      const error = validateEmail('userexample.com');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('email');
    });

    it('should reject email without domain', () => {
      const error = validateEmail('user@');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('email');
    });

    it('should reject email without TLD', () => {
      const error = validateEmail('user@domain');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('email');
    });

    it('should reject email with single char TLD', () => {
      const error = validateEmail('user@domain.a');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('email');
    });
  });

  describe('validateUsername', () => {
    it('should accept valid usernames', () => {
      expect(validateUsername('abc')).toBeNull();
      expect(validateUsername('user123')).toBeNull();
      expect(validateUsername('A'.repeat(30))).toBeNull();
      expect(validateUsername('TestUser99')).toBeNull();
    });

    it('should reject username shorter than 3 chars', () => {
      const error = validateUsername('ab');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('username');
      expect(error!.message).toContain('at least 3');
    });

    it('should reject username longer than 30 chars', () => {
      const error = validateUsername('a'.repeat(31));
      expect(error).not.toBeNull();
      expect(error!.field).toBe('username');
      expect(error!.message).toContain('30');
    });

    it('should reject username with special characters', () => {
      const error = validateUsername('user_name');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('username');
      expect(error!.message).toContain('alphanumeric');
    });

    it('should reject username with spaces', () => {
      const error = validateUsername('user name');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('username');
    });

    it('should reject empty username', () => {
      const error = validateUsername('');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('username');
    });
  });

  describe('validatePassword', () => {
    it('should accept valid passwords', () => {
      expect(validatePassword('Abcdef1!')).toBeNull();
      expect(validatePassword('MyP@ssw0rd')).toBeNull();
      expect(validatePassword('Str0ng!Pass')).toBeNull();
    });

    it('should reject password shorter than 8 chars', () => {
      const error = validatePassword('Ab1!xyz');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('password');
      expect(error!.message).toContain('at least 8');
    });

    it('should reject password longer than 128 chars', () => {
      const error = validatePassword('A1!' + 'a'.repeat(126));
      expect(error).not.toBeNull();
      expect(error!.field).toBe('password');
      expect(error!.message).toContain('128');
    });

    it('should reject password without uppercase', () => {
      const error = validatePassword('abcdef1!');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('password');
      expect(error!.message).toContain('uppercase');
    });

    it('should reject password without lowercase', () => {
      const error = validatePassword('ABCDEF1!');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('password');
      expect(error!.message).toContain('lowercase');
    });

    it('should reject password without digit', () => {
      const error = validatePassword('Abcdefg!');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('password');
      expect(error!.message).toContain('digit');
    });

    it('should reject password without special character', () => {
      const error = validatePassword('Abcdefg1');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('password');
      expect(error!.message).toContain('special');
    });

    it('should reject empty password', () => {
      const error = validatePassword('');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('password');
    });
  });

  describe('validateRegistrationInput', () => {
    it('should return valid for correct inputs', () => {
      const result = validateRegistrationInput('user@example.com', 'testuser', 'MyP@ss1!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return all errors for completely invalid inputs', () => {
      const result = validateRegistrationInput('invalid', 'a', 'short');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain('email');
      expect(fields).toContain('username');
      expect(fields).toContain('password');
    });

    it('should return only the failing field errors', () => {
      const result = validateRegistrationInput('user@example.com', 'testuser', 'weak');
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.field).toBe('password');
    });
  });
});
