import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { useReducedMotion } from '@/hooks/useReducedMotion';

interface PageTransitionProps {
  children: ReactNode;
  /** Transition duration in ms (must be between 150-300ms per spec) */
  duration?: 150 | 200 | 250 | 300;
}

/**
 * Wraps page content with a fade-in transition on route changes.
 * Uses CSS transitions (150-300ms) and respects prefers-reduced-motion.
 * When reduced motion is preferred, content appears instantly without animation.
 */
export function PageTransition({ children, duration = 200 }: PageTransitionProps) {
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Skip animation if user prefers reduced motion
    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    setIsVisible(false);
    // Small delay to trigger the CSS transition
    const frame = requestAnimationFrame(() => {
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, prefersReducedMotion]);

  // When reduced motion is preferred, render without transition classes
  if (prefersReducedMotion) {
    return <div>{children}</div>;
  }

  return (
    <div
      className="ease-in-out"
      style={{
        transition: `opacity ${duration}ms, transform ${duration}ms`,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(4px)',
      }}
    >
      {children}
    </div>
  );
}

export default PageTransition;
