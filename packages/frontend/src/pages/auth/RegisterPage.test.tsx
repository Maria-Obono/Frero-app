import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RegisterPage } from './RegisterPage';

// Mock the auth context
const mockRegister = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    register: mockRegister,
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

function renderRegisterPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>
  );
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the registration form', () => {
    renderRegisterPage();

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create account/i })
    ).toBeInTheDocument();
  });

  it('shows validation errors for empty fields on submit', async () => {
    const user = userEvent.setup();
    renderRegisterPage();

    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/username is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
  });

  it('shows email validation error for invalid email', async () => {
    const user = userEvent.setup();
    renderRegisterPage();

    await user.type(screen.getByLabelText(/email/i), 'notanemail');
    await user.type(screen.getByLabelText(/^username$/i), 'validuser');
    await user.type(screen.getByLabelText(/^password$/i), 'P@ssw0rd!');
    await user.type(screen.getByLabelText(/confirm password/i), 'P@ssw0rd!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      screen.getByText(/please enter a valid email address/i)
    ).toBeInTheDocument();
  });

  it('shows username validation error for short username', async () => {
    const user = userEvent.setup();
    renderRegisterPage();

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/^username$/i), 'ab');
    await user.type(screen.getByLabelText(/^password$/i), 'P@ssw0rd!');
    await user.type(screen.getByLabelText(/confirm password/i), 'P@ssw0rd!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      screen.getByText(/username must be at least 3 characters/i)
    ).toBeInTheDocument();
  });

  it('shows password validation error for weak password', async () => {
    const user = userEvent.setup();
    renderRegisterPage();

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/^username$/i), 'validuser');
    await user.type(screen.getByLabelText(/^password$/i), 'weak');
    await user.type(screen.getByLabelText(/confirm password/i), 'weak');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      screen.getByText(/password must be at least 8 characters/i)
    ).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    const user = userEvent.setup();
    renderRegisterPage();

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/^username$/i), 'validuser');
    await user.type(screen.getByLabelText(/^password$/i), 'P@ssw0rd!');
    await user.type(screen.getByLabelText(/confirm password/i), 'Different1!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
  });

  it('calls register and navigates on successful submission', async () => {
    mockRegister.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderRegisterPage();

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/^username$/i), 'validuser');
    await user.type(screen.getByLabelText(/^password$/i), 'P@ssw0rd!');
    await user.type(screen.getByLabelText(/confirm password/i), 'P@ssw0rd!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        'user@example.com',
        'validuser',
        'P@ssw0rd!'
      );
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      'Account created successfully!',
      'success'
    );
  });

  it('shows error toast on registration failure', async () => {
    const axiosError = {
      response: { data: { message: 'Email already in use' } },
      isAxiosError: true,
    };
    // Simulate AxiosError
    Object.setPrototypeOf(axiosError, Error.prototype);
    mockRegister.mockRejectedValueOnce(axiosError);

    const user = userEvent.setup();
    renderRegisterPage();

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/^username$/i), 'validuser');
    await user.type(screen.getByLabelText(/^password$/i), 'P@ssw0rd!');
    await user.type(screen.getByLabelText(/confirm password/i), 'P@ssw0rd!');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        'error'
      );
    });
  });

  it('has a link to the login page', () => {
    renderRegisterPage();
    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link).toHaveAttribute('href', '/login');
  });
});
