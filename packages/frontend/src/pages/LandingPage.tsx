import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { BackgroundEffects } from '@/components/landing/BackgroundEffects';
import { BrandLogo } from '@/components/landing/BrandLogo';
import { CTAButtons } from '@/components/landing/CTAButtons';

/**
 * LandingPage component.
 * Public-facing marketing page for unauthenticated visitors.
 * Redirects authenticated users to the home feed.
 * Requirements: 1.1, 1.2, 1.3, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 7.2, 9.1, 9.2, 9.4, 9.6, 10.1
 */
export function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const animate = !prefersReducedMotion;

  const [showContent, setShowContent] = useState(false);
  const [authTimeout, setAuthTimeout] = useState(false);

  // 3-second timeout fallback: if isLoading persists, render as unauthenticated
  useEffect(() => {
    if (!isLoading) return;

    const timer = setTimeout(() => {
      setAuthTimeout(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, [isLoading]);

  // Trigger fade-in entrance animation once auth check resolves or times out
  useEffect(() => {
    if (!isLoading || authTimeout) {
      // Small delay to allow DOM to paint before triggering animation
      const frame = requestAnimationFrame(() => {
        setShowContent(true);
      });
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [isLoading, authTimeout]);

  // Loading state: show spinner while auth is being checked (before timeout)
  if (isLoading && !authTimeout) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent"
          role="status"
          aria-label="Loading"
        />
      </main>
    );
  }

  // Redirect authenticated users to home feed
  if (isAuthenticated && !authTimeout) {
    return <Navigate to="/home" replace />;
  }

  // Render landing page content
  return (
    <main
      className={`
        relative flex min-h-screen flex-col items-center justify-center
        bg-gray-950 px-4 md:px-8 lg:px-16
        ${showContent ? 'animate-landing-fade-in' : 'opacity-0'}
      `.trim()}
    >
      <BackgroundEffects animate={animate} />

      <div className="relative z-10 flex flex-col items-center gap-10">
        <BrandLogo animate={animate} />
        <div className="max-w-2xl text-center space-y-3">
          <p className="text-xl md:text-2xl lg:text-3xl font-extralight tracking-tight leading-relaxed">
            <span className="text-white/90">Post your favorite memories,</span>{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              discover trending content,
            </span>{' '}
            <span className="text-white/90">and stay connected with friends</span>
          </p>
          <p className="text-sm md:text-base font-light tracking-widest uppercase text-gray-500">
            through a seamless modern experience
          </p>
        </div>
        <CTAButtons animate={animate} />
      </div>
    </main>
  );
}

export default LandingPage;
