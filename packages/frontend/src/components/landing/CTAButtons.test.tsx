import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';

import { CTAButtons } from './CTAButtons';

function renderCTAButtons(animate = false) {
  return render(
    <MemoryRouter>
      <CTAButtons animate={animate} />
    </MemoryRouter>
  );
}

describe('CTAButtons', () => {
  it('renders primary button with "Sign Up" text', () => {
    renderCTAButtons();
    expect(screen.getByRole('link', { name: 'Sign Up' })).toBeInTheDocument();
  });

  it('renders secondary button with "Log In" text', () => {
    renderCTAButtons();
    expect(screen.getByRole('link', { name: 'Log In' })).toBeInTheDocument();
  });

  it('primary button links to /register', () => {
    renderCTAButtons();
    const signUpLink = screen.getByRole('link', { name: 'Sign Up' });
    expect(signUpLink).toHaveAttribute('href', '/register');
  });

  it('secondary button links to /login', () => {
    renderCTAButtons();
    const loginLink = screen.getByRole('link', { name: 'Log In' });
    expect(loginLink).toHaveAttribute('href', '/login');
  });

  it('buttons are keyboard-accessible (focusable via Tab)', async () => {
    const user = userEvent.setup();
    renderCTAButtons();

    await user.tab();
    expect(screen.getByRole('link', { name: 'Sign Up' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('link', { name: 'Log In' })).toHaveFocus();
  });

  it('primary button has filled style (bg-indigo-600)', () => {
    renderCTAButtons();
    const signUpLink = screen.getByRole('link', { name: 'Sign Up' });
    expect(signUpLink.className).toMatch(/bg-indigo-600/);
  });

  it('secondary button has outlined style (border-2 border-indigo-500)', () => {
    renderCTAButtons();
    const loginLink = screen.getByRole('link', { name: 'Log In' });
    expect(loginLink.className).toMatch(/border-2/);
    expect(loginLink.className).toMatch(/border-indigo-500/);
  });

  it('applies animate-landing-fade-in class when animate=true', () => {
    const { container } = renderCTAButtons(true);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toMatch(/animate-landing-fade-in/);
  });

  it('does not apply animate-landing-fade-in class when animate=false', () => {
    const { container } = renderCTAButtons(false);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).not.toMatch(/animate-landing-fade-in/);
  });
});
