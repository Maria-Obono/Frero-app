import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Wraps routes that should only be accessible to unauthenticated users
 * (login, register). Redirects to home if already logged in.
 */
function GuestRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // If already authenticated, redirect to where they came from or home
  if (isAuthenticated) {
    const from = (location.state as { from?: Location })?.from?.pathname || '/home';
    return <Navigate to={from} replace />;
  }

  return <Outlet />;
}

export default GuestRoute;
