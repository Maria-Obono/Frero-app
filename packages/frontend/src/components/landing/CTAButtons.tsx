import { Link } from 'react-router-dom';

interface CTAButtonsProps {
  animate: boolean; // controls entrance animation
}

export function CTAButtons({ animate }: CTAButtonsProps) {
  return (
    <div
      className={`
        flex flex-col md:flex-row items-center gap-4
        ${animate ? 'animate-landing-fade-in' : ''}
      `.trim()}
    >
      {/* Primary CTA - Sign Up (filled style) */}
      <Link
        to="/register"
        className="
          inline-flex items-center justify-center
          min-h-[44px] min-w-[44px] px-8 py-3
          rounded-lg font-semibold text-white
          bg-indigo-600 hover:bg-indigo-500
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-gray-900
        "
      >
        Sign Up
      </Link>

      {/* Secondary CTA - Log In (outlined style) */}
      <Link
        to="/login"
        className="
          inline-flex items-center justify-center
          min-h-[44px] min-w-[44px] px-8 py-3
          rounded-lg font-semibold
          border-2 border-indigo-500 text-indigo-300
          hover:bg-indigo-500/10 hover:text-indigo-200
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-gray-900
        "
      >
        Log In
      </Link>
    </div>
  );
}
