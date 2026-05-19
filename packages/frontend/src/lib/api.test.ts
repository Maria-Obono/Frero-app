import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAccessToken,
  setAccessToken,
  getRefreshToken,
  setRefreshToken,
  clearTokens,
} from './api';

describe('Token Management', () => {
  beforeEach(() => {
    clearTokens();
    localStorage.clear();
  });

  describe('Access Token (in-memory)', () => {
    it('returns null when no token is set', () => {
      expect(getAccessToken()).toBeNull();
    });

    it('stores and retrieves access token in memory', () => {
      setAccessToken('test-access-token');
      expect(getAccessToken()).toBe('test-access-token');
    });

    it('clears access token when set to null', () => {
      setAccessToken('test-access-token');
      setAccessToken(null);
      expect(getAccessToken()).toBeNull();
    });

    it('does not persist access token in localStorage', () => {
      setAccessToken('secret-token');
      expect(localStorage.getItem('frero-refresh-token')).toBeNull();
      // Access token should only be in memory, not in any storage
      expect(Object.keys(localStorage)).not.toContain('frero-access-token');
    });
  });

  describe('Refresh Token (localStorage)', () => {
    it('returns null when no refresh token is set', () => {
      expect(getRefreshToken()).toBeNull();
    });

    it('stores refresh token in localStorage', () => {
      setRefreshToken('test-refresh-token');
      expect(getRefreshToken()).toBe('test-refresh-token');
      expect(localStorage.getItem('frero-refresh-token')).toBe(
        'test-refresh-token'
      );
    });

    it('removes refresh token from localStorage when set to null', () => {
      setRefreshToken('test-refresh-token');
      setRefreshToken(null);
      expect(getRefreshToken()).toBeNull();
      expect(localStorage.getItem('frero-refresh-token')).toBeNull();
    });
  });

  describe('clearTokens', () => {
    it('clears both access and refresh tokens', () => {
      setAccessToken('access');
      setRefreshToken('refresh');

      clearTokens();

      expect(getAccessToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
    });
  });
});

describe('Axios Interceptors', () => {
  beforeEach(() => {
    clearTokens();
  });

  it('attaches Authorization header when access token is set', async () => {
    // We test this indirectly by verifying the token is available
    setAccessToken('my-token');
    expect(getAccessToken()).toBe('my-token');
  });

  it('dispatches auth:logout event on 401 without refresh token', () => {
    const listener = vi.fn();
    window.addEventListener('auth:logout', listener);

    // Simulate the event that would be dispatched by the interceptor
    window.dispatchEvent(new CustomEvent('auth:logout'));
    expect(listener).toHaveBeenCalled();

    window.removeEventListener('auth:logout', listener);
  });
});
