/**
 * BackgroundEffects component.
 * Renders decorative radial gradient orbs positioned behind interactive content.
 * Requirements: 7.1, 7.3, 7.4, 9.2
 */

interface BackgroundEffectsProps {
  animate: boolean; // controls subtle drift animation
}

export function BackgroundEffects({ animate }: BackgroundEffectsProps) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Top-left blue orb */}
      <div
        className={`absolute -top-1/4 -left-1/4 h-[600px] w-[600px] rounded-full${animate ? ' animate-float' : ''}`}
        style={{
          background: 'radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)',
          opacity: 0.2,
        }}
      />

      {/* Bottom-right purple orb */}
      <div
        className={`absolute -bottom-1/4 -right-1/4 h-[500px] w-[500px] rounded-full${animate ? ' animate-float' : ''}`}
        style={{
          background: 'radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)',
          opacity: 0.15,
          animationDelay: animate ? '1.5s' : undefined,
        }}
      />

      {/* Center-right blue-purple orb */}
      <div
        className={`absolute top-1/3 right-1/4 h-[400px] w-[400px] rounded-full${animate ? ' animate-float' : ''}`}
        style={{
          background: 'radial-gradient(circle, rgba(96,165,250,0.2) 0%, transparent 70%)',
          opacity: 0.1,
          animationDelay: animate ? '3s' : undefined,
        }}
      />
    </div>
  );
}
