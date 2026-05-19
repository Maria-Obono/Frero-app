import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import {
  SkeletonLoader,
  PostCardSkeleton,
  UserCardSkeleton,
  ProfileSkeleton,
  StoryBarSkeleton,
} from './SkeletonLoader';

describe('SkeletonLoader', () => {
  it('renders a single skeleton element by default', () => {
    const { container } = render(<SkeletonLoader />);
    const elements = container.querySelectorAll('[aria-hidden="true"]');
    expect(elements).toHaveLength(1);
  });

  it('renders multiple skeleton elements when count is specified', () => {
    const { container } = render(<SkeletonLoader count={3} />);
    const elements = container.querySelectorAll('[aria-hidden="true"]');
    expect(elements).toHaveLength(3);
  });

  it('applies custom width and height via inline styles', () => {
    const { container } = render(<SkeletonLoader width="100px" height="50px" />);
    const el = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(el.style.width).toBe('100px');
    expect(el.style.height).toBe('50px');
  });

  it('applies the correct rounded class', () => {
    const { container } = render(<SkeletonLoader rounded="full" />);
    const el = container.querySelector('[aria-hidden="true"]');
    expect(el?.className).toContain('rounded-full');
  });

  it('applies animate-pulse class for loading animation', () => {
    const { container } = render(<SkeletonLoader />);
    const el = container.querySelector('[aria-hidden="true"]');
    expect(el?.className).toContain('animate-pulse');
  });

  it('applies custom className', () => {
    const { container } = render(<SkeletonLoader className="w-full" />);
    const el = container.querySelector('[aria-hidden="true"]');
    expect(el?.className).toContain('w-full');
  });

  it('is hidden from screen readers with aria-hidden', () => {
    const { container } = render(<SkeletonLoader />);
    const el = container.querySelector('[aria-hidden="true"]');
    expect(el).toBeInTheDocument();
  });
});

describe('PostCardSkeleton', () => {
  it('renders with a loading status role', () => {
    render(<PostCardSkeleton />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has accessible label', () => {
    render(<PostCardSkeleton />);
    expect(screen.getByLabelText('Loading post')).toBeInTheDocument();
  });
});

describe('UserCardSkeleton', () => {
  it('renders with a loading status role', () => {
    render(<UserCardSkeleton />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has accessible label', () => {
    render(<UserCardSkeleton />);
    expect(screen.getByLabelText('Loading user')).toBeInTheDocument();
  });
});

describe('ProfileSkeleton', () => {
  it('renders with a loading status role', () => {
    render(<ProfileSkeleton />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has accessible label', () => {
    render(<ProfileSkeleton />);
    expect(screen.getByLabelText('Loading profile')).toBeInTheDocument();
  });
});

describe('StoryBarSkeleton', () => {
  it('renders with a loading status role', () => {
    render(<StoryBarSkeleton />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has accessible label', () => {
    render(<StoryBarSkeleton />);
    expect(screen.getByLabelText('Loading stories')).toBeInTheDocument();
  });

  it('renders 6 story placeholders', () => {
    const { container } = render(<StoryBarSkeleton />);
    // Each story has a circle (64px) and a text line
    const circles = container.querySelectorAll('[style*="width: 64px"]');
    expect(circles).toHaveLength(6);
  });
});
