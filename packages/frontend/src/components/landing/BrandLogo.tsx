interface BrandLogoProps {
  animate: boolean; // false when reduced motion is preferred
}

export function BrandLogo({ animate }: BrandLogoProps) {
  return (
    <h1
      className={`
        select-none text-transparent bg-clip-text
        ${animate ? 'animate-gradient-shift animate-float' : ''}
      `.trim()}
      style={{
        fontSize: 'clamp(64px, 10vw, 200px)',
        fontWeight: 800,
        letterSpacing: '0.04em',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        backgroundImage:
          'linear-gradient(135deg, #3b82f6, #8b5cf6, #6366f1, #a855f7, #3b82f6)',
        backgroundSize: '200% 200%',
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        color: 'transparent',
        textShadow:
          '0 0 12px rgba(99, 102, 241, 0.3), 0 0 12px rgba(139, 92, 246, 0.3), 0 0 12px rgba(168, 85, 247, 0.3)',
      }}
    >
      Frero
    </h1>
  );
}
