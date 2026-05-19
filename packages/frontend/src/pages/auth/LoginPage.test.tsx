import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';

// Mock the auth context
const mockLogin = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

// Mock the toast
const mockAddToast = vi.fn();
vi.mock('@/components/shared/Toast', () => ({
  useToast: () => ({
    addToast: mockAddToast,
  }),
}));

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the login form', () => {
    renderLoginPage();

    expect(screen.getByLabelText(/email or username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign in/i })
    ).toBeInTheDocument();
  });

  it('shows validation errors for empty fields on submit', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(
      screen.getByText(/email or username is required/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
  });

  it('calls login and navigates on successful submission', async () => {
    mockLogin.mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email or username/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'P@ssw0rd!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        'user@example.com',
        'P@ssw0rd!',
        undefined
      );
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    expect(mockAddToast).toHaveBeenCalledWith('Welcome back!', 'success');
  });

  it('shows 2FA input when login requires it', async () => {
    mockLogin.mockResolvedValueOnce({ requires2FA: true });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email or username/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'P@ssw0rd!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByLabelText(/two-factor authentication code/i)
      ).toBeInTheDocument();
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      'Please enter your 2FA code',
      'info'
    );
  });

  it('submits 2FA code on second login attempt', async () => {
    mockLogin
      .mockResolvedValueOnce({ requires2FA: true })
      .mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderLoginPage();

    // First submit triggers 2FA
    await user.type(screen.getByLabelText(/email or username/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'P@ssw0rd!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByLabelText(/two-factor authentication code/i)
      ).toBeInTheDocument();
    });

    // Enter 2FA code and submit again
    await user.type(
      screen.getByLabelText(/two-factor authentication code/i),
      '123456'
    );
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        'user@example.com',
        'P@ssw0rd!',
        '123456'
      );
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('shows error toast on login failure', async () => {
    const axiosError = {
      response: { data: { message: 'Invalid credentials' } },
      isAxiosError: true,
    };
    Object.setPrototypeOf(axiosError, Error.prototype);
    mockLogin.mockRejectedValueOnce(axiosError);

    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email or username/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        'error'
      );
    });
  });

  it('only allows numeric input in 2FA field', async () => {
    mockLogin.mockResolvedValueOnce({ requires2FA: true });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email or username/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'P@ssw0rd!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByLabelText(/two-factor authentication code/i)
      ).toBeInTheDocument();
    });

    const totpInput = screen.getByLabelText(/two-factor authentication code/i);
    await user.type(totpInput, 'abc123def');
    // Only digits should remain
    expect(totpInput).toHaveValue('123');
  });

  it('has a link to the registration page', () => {
    renderLoginPage();
    const link = screen.getByRole('link', { name: /create one/i });
    expect(link).toHaveAttribute('href', '/register');
  });
});
