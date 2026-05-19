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
 * Validates an email address against RFC 5322 format.
 */
export declare function validateEmail(email: string): ValidationError | null;
/**
 * Validates a username (3-30 alphanumeric characters).
 */
export declare function validateUsername(username: string): ValidationError | null;
/**
 * Validates a password (8-128 chars, uppercase, lowercase, digit, special char).
 */
export declare function validatePassword(password: string): ValidationError | null;
/**
 * Validates all registration inputs and returns a combined result.
 */
export declare function validateRegistrationInput(email: string, username: string, password: string): RegistrationValidationResult;
//# sourceMappingURL=validators.d.ts.map