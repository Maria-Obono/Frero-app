import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validateUsername,
  validatePassword,
  validateRegistration,
  validateLogin,
} from './validation';

describe('validateEmail', () => {
  it('returns error for empty email', () => {
    expect(validateEmail('')).toBe('Email is required');
  });

  it('returns error for invalid email format', () => {
    expect(validateEmail('notanemail')).toBe('Please enter a valid email address');
    expect(validateEmail('missing@domain')).toBe('Please enter a valid email address');
    expect(validateEmail('@nodomain.com')).toBe('Please enter a valid email address');
    expect(validateEmail('spaces in@email.com')).toBe(
      'Please enter a valid email address'
    );
  });

  it('returns null for valid email', () => {
    expect(validateEmail('user@example.com')).toBeNull();
    expect(validateEmail('test.user@domain.co')).toBeNull();
    expect(validateEmail('a+b@c.org')).toBeNull();
  });
});

describe('validateUsername', () => {
  it('returns error for empty username', () => {
    expect(validateUsername('')).toBe('Username is required');
  });

  it('returns error for username shorter than 3 characters', () => {
    expect(validateUsername('ab')).toBe('Username must be at least 3 characters');
    expect(validateUsername('x')).toBe('Username must be at least 3 characters');
  });

  it('returns error for username longer than 30 characters', () => {
    expect(validateUsername('a'.repeat(31))).toBe(
      'Username must be at most 30 characters'
    );
  });

  it('returns error for non-alphanumeric characters', () => {
    expect(validateUsername('user_name')).toBe(
      'Username must contain only letters and numbers'
    );
    expect(validateUsername('user-name')).toBe(
      'Username must contain only letters and numbers'
    );
    expect(validateUsername('user.name')).toBe(
      'Username must contain only letters and numbers'
    );
    expect(validateUsername('user name')).toBe(
      'Username must contain only letters and numbers'
    );
  });

  it('returns null for valid username', () => {
    expect(validateUsername('abc')).toBeNull();
    expect(validateUsername('user123')).toBeNull();
    expect(validateUsername('A'.repeat(30))).toBeNull();
    expect(validateUsername('TestUser99')).toBeNull();
  });
});

describe('validatePassword', () => {
  it('returns error for empty password', () => {
    expect(validatePassword('')).toBe('Password is required');
  });

  it('returns error for password shorter than 8 characters', () => {
    expect(validatePassword('Aa1!xyz')).toBe(
      'Password must be at least 8 characters'
    );
  });

  it('returns error for password longer than 128 characters', () => {
    const longPassword = 'Aa1!' + 'x'.repeat(125);
    expect(validatePassword(longPassword)).toBe(
      'Password must be at most 128 characters'
    );
  });

  it('returns error for missing uppercase letter', () => {
    expect(validatePassword('abcdefg1!')).toBe(
      'Password must contain at least one uppercase letter'
    );
  });

  it('returns error for missing lowercase letter', () => {
    expect(validatePassword('ABCDEFG1!')).toBe(
      'Password must contain at least one lowercase letter'
    );
  });

  it('returns error for missing digit', () => {
    expect(validatePassword('Abcdefgh!')).toBe(
      'Password must contain at least one digit'
    );
  });

  it('returns error for missing special character', () => {
    expect(validatePassword('Abcdefg1')).toBe(
      'Password must contain at least one special character'
    );
  });

  it('returns null for valid password', () => {
    expect(validatePassword('Abcdefg1!')).toBeNull();
    expect(validatePassword('P@ssw0rd')).toBeNull();
    expect(validatePassword('MyStr0ng!Pass')).toBeNull();
  });
});

describe('validateRegistration', () => {
  it('returns empty array for valid inputs', () => {
    expect(
      validateRegistration('user@example.com', 'validuser', 'P@ssw0rd!')
    ).toEqual([]);
  });

  it('returns errors for all invalid fields', () => {
    const errors = validateRegistration('', '', '');
    expect(errors).toHaveLength(3);
    expect(errors.map((e) => e.field)).toContain('email');
    expect(errors.map((e) => e.field)).toContain('username');
    expect(errors.map((e) => e.field)).toContain('password');
  });

  it('returns error only for invalid fields', () => {
    const errors = validateRegistration('user@example.com', 'ab', 'P@ssw0rd!');
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('username');
  });
});

describe('validateLogin', () => {
  it('returns empty array for valid inputs', () => {
    expect(validateLogin('user@example.com', 'password')).toEqual([]);
  });

  it('returns error for empty identifier', () => {
    const errors = validateLogin('', 'password');
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('identifier');
  });

  it('returns error for empty password', () => {
    const errors = validateLogin('user@example.com', '');
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('password');
  });

  it('returns errors for both empty fields', () => {
    const errors = validateLogin('', '');
    expect(errors).toHaveLength(2);
  });
});
