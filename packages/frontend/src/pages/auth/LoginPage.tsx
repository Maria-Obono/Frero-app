import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/shared/Toast';
import { validateLogin } from '@/lib/validation';
import { AxiosError } from 'axios';

export function LoginPage() {
  const { login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const validationErrors = validateLogin(identifier, password);
    const newErrors: Record<string, string> = {};
    validationErrors.forEach((err) => {
      newErrors[err.field] = err.message;
    });

    if (show2FA && !totpCode) {
      newErrors.totpCode = 'Please enter your 2FA code';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const result = await login(
        identifier,
        password,
        show2FA ? totpCode : undefined
      );

      if (result.requires2FA) {
        setShow2FA(true);
        addToast('Please enter your 2FA code', 'info');
      } else {
        addToast('Welcome back!', 'success');
        navigate('/');
      }
    } catch (err) {
      if (err instanceof AxiosError && err.response?.data?.message) {
        addToast(err.response.data.message, 'error');
      } else {
        addToast('Login failed. Please check your credentials.', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background-light dark:bg-background-dark">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-600 dark:text-primary-400">
            Frero
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Sign in to your account
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-lg border border-border-light dark:border-border-dark p-6 space-y-4"
        >
          {/* Email or Username */}
          <div>
            <label
              htmlFor="identifier"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Email or Username
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${
                errors.identifier
                  ? 'border-red-500'
                  : 'border-border-light dark:border-border-dark'
              } bg-white dark:bg-gray-900 outline-none focus:ring-2 focus:ring-primary-500 transition-shadow`}
              placeholder="you@example.com or username"
              autoComplete="username"
            />
            {errors.identifier && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.identifier}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${
                errors.password
                  ? 'border-red-500'
                  : 'border-border-light dark:border-border-dark'
              } bg-white dark:bg-gray-900 outline-none focus:ring-2 focus:ring-primary-500 transition-shadow`}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.password}
              </p>
            )}
          </div>

          {/* 2FA Code (shown when required) */}
          {show2FA && (
            <div>
              <label
                htmlFor="totpCode"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Two-Factor Authentication Code
              </label>
              <input
                id="totpCode"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={totpCode}
                onChange={(e) =>
                  setTotpCode(e.target.value.replace(/[^0-9]/g, ''))
                }
                className={`w-full px-3 py-2 rounded-lg border ${
                  errors.totpCode
                    ? 'border-red-500'
                    : 'border-border-light dark:border-border-dark'
                } bg-white dark:bg-gray-900 outline-none focus:ring-2 focus:ring-primary-500 transition-shadow text-center tracking-widest text-lg`}
                placeholder="000000"
                autoComplete="one-time-code"
                autoFocus
              />
              {errors.totpCode && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.totpCode}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Don&apos;t have an account?{' '}
            <Link
              to="/register"
              className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
            >
              Create one
            </Link>
          </p>

          <p className="text-center text-sm mt-2">
            <Link
              to="/forgot-password"
              className="text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:underline"
            >
              Forgot your password?
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
