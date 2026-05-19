/**
 * Auth service input validators.
 *
 * Validates registration inputs per Requirements 1.1, 1.3:
 * - Email: RFC 5322 format
 * - Username: 3-30 alphanumeric characters
 * - Password: 8-128 characters, at least one uppercase, one lowercase, one digit, one special character
 */

import { ValidationError, RegistrationValidationResult } from './types';

/**
 * RFC 5322 compliant email regex.
 * This covers the standard email format: local-part@domain
 * Local part allows: alphanumeric, dots, underscores, hyphens, plus signs
 * Domain allows: alphanumeric labels separated by dots, with TLD of 2+ chars
 */
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

/**
 * Username: 3-30 alphanumeric characters only.
 */
const USERNAME_REGEX = /^[a-zA-Z0-9]{3,30}$/;

/**
 * Password requirements:
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 */
const HAS_UPPERCASE = /[A-Z]/;
const HAS_LOWERCASE = /[a-z]/;
const HAS_DIGIT = /[0-9]/;
const HAS_SPECIAL = /[^a-zA-Z0-9]/;

/**
 * Validates an email address against RFC 5322 format.
 */
export function validateEmail(email: string): ValidationError | null {
  if (!email || typeof email !== 'string') {
    return { field: 'email', message: 'Email is required' };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { field: 'email', message: 'Email must be a valid RFC 5322 format' };
  }

  return null;
}

/**
 * Validates a username (3-30 alphanumeric characters).
 */
export function validateUsername(username: string): ValidationError | null {
  if (!username || typeof username !== 'string') {
    return { field: 'username', message: 'Username is required' };
  }

  if (username.length < 3) {
    return { field: 'username', message: 'Username must be at least 3 characters' };
  }

  if (username.length > 30) {
    return { field: 'username', message: 'Username must not exceed 30 characters' };
  }

  if (!USERNAME_REGEX.test(username)) {
    return { field: 'username', message: 'Username must contain only alphanumeric characters' };
  }

  return null;
}

/**
 * Validates a password (8-128 chars, uppercase, lowercase, digit, special char).
 */
export function validatePassword(password: string): ValidationError | null {
  if (!password || typeof password !== 'string') {
    return { field: 'password', message: 'Password is required' };
  }

  if (password.length < 8) {
    return { field: 'password', message: 'Password must be at least 8 characters' };
  }

  if (password.length > 128) {
    return { field: 'password', message: 'Password must not exceed 128 characters' };
  }

  if (!HAS_UPPERCASE.test(password)) {
    return { field: 'password', message: 'Password must contain at least one uppercase letter' };
  }

  if (!HAS_LOWERCASE.test(password)) {
    return { field: 'password', message: 'Password must contain at least one lowercase letter' };
  }

  if (!HAS_DIGIT.test(password)) {
    return { field: 'password', message: 'Password must contain at least one digit' };
  }

  if (!HAS_SPECIAL.test(password)) {
    return { field: 'password', message: 'Password must contain at least one special character' };
  }

  return null;
}

/**
 * Validates all registration inputs and returns a combined result.
 */
export function validateRegistrationInput(
  email: string,
  username: string,
  password: string,
): RegistrationValidationResult {
  const errors: ValidationError[] = [];

  const emailError = validateEmail(email);
  if (emailError) errors.push(emailError);

  const usernameError = validateUsername(username);
  if (usernameError) errors.push(usernameError);

  const passwordError = validatePassword(password);
  if (passwordError) errors.push(passwordError);

  return {
    valid: errors.length === 0,
    errors,
  };
}
