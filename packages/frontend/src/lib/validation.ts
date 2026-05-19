export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validates email against RFC 5322 simplified pattern.
 */
export function validateEmail(email: string): string | null {
  if (!email) return 'Email is required';
  // Simplified RFC 5322 pattern
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return 'Please enter a valid email address';
  return null;
}

/**
 * Validates username: 3-30 alphanumeric characters.
 */
export function validateUsername(username: string): string | null {
  if (!username) return 'Username is required';
  if (username.length < 3) return 'Username must be at least 3 characters';
  if (username.length > 30) return 'Username must be at most 30 characters';
  if (!/^[a-zA-Z0-9]+$/.test(username))
    return 'Username must contain only letters and numbers';
  return null;
}

/**
 * Validates password: 8-128 characters, at least one uppercase, one lowercase,
 * one digit, and one special character.
 */
export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 128) return 'Password must be at most 128 characters';
  if (!/[A-Z]/.test(password))
    return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password))
    return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one digit';
  if (!/[^a-zA-Z0-9]/.test(password))
    return 'Password must contain at least one special character';
  return null;
}

/**
 * Validates the full registration form.
 */
export function validateRegistration(
  email: string,
  username: string,
  password: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  const emailError = validateEmail(email);
  if (emailError) errors.push({ field: 'email', message: emailError });

  const usernameError = validateUsername(username);
  if (usernameError) errors.push({ field: 'username', message: usernameError });

  const passwordError = validatePassword(password);
  if (passwordError) errors.push({ field: 'password', message: passwordError });

  return errors;
}

/**
 * Validates the login form.
 */
export function validateLogin(
  identifier: string,
  password: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!identifier)
    errors.push({ field: 'identifier', message: 'Email or username is required' });
  if (!password) errors.push({ field: 'password', message: 'Password is required' });

  return errors;
}
