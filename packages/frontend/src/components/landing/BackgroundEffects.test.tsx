import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BackgroundEffects } from '@/components/landing/BackgroundEffects';

describe('BackgroundEffects', () => {
  it('renders at least 2 decorative elements', () => {
    const { container } = render(<BackgroundEffects animate={false} />);

    const orbs = container.querySelectorAll('.rounded-full');

    expect(orbs.length).toBeGreaterThanOrEqual(2);
  });

  it('elements have opacity within 0.05–0.3 range', () => {
    const { container } = render(<BackgroundEffects animate={false} />);

    const orbs = container.querySelectorAll('.rounded-full');

    expect(orbs.length).toBeGreaterThan(0);
    orbs.forEach((orb) => {
      const opacity = parseFloat((orb as HTMLElement).style.opacity);
      expect(opacity).toBeGreaterThanOrEqual(0.05);
      expect(opacity).toBeLessThanOrEqual(0.3);
    });
  });

  it('elements are positioned behind content via -z-10 class', () => {
    const { container } = render(<BackgroundEffects animate={false} />);

    const wrapper = container.querySelector('[aria-hidden="true"]');

    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveClass('-z-10');
  });
});
