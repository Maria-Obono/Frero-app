import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { BrandLogo } from './BrandLogo';

describe('BrandLogo', () => {
  it('renders an <h1> element with text "Frero"', () => {
    render(<BrandLogo animate={false} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('Frero');
  });

  it('applies gradient-shift animation class when animate=true', () => {
    render(<BrandLogo animate={true} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.className).toContain('animate-gradient-shift');
  });

  it('applies float animation class when animate=true', () => {
    render(<BrandLogo animate={true} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.className).toContain('animate-float');
  });

  it('does NOT apply animation classes when animate=false', () => {
    render(<BrandLogo animate={false} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.className).not.toContain('animate-gradient-shift');
    expect(heading.className).not.toContain('animate-float');
  });

  it('uses clamp() value for font-size', () => {
    render(<BrandLogo animate={false} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.style.fontSize).toBe('clamp(64px, 10vw, 200px)');
  });

  it('applies text-shadow glow effect', () => {
    render(<BrandLogo animate={false} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.style.textShadow).toContain('rgba(99, 102, 241, 0.3)');
    expect(heading.style.textShadow).toContain('rgba(139, 92, 246, 0.3)');
  });
});
