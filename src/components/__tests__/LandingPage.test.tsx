import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LandingPage } from '../LandingPage';
import { NewLandingPage } from '../NewLandingPage';
import { PROJECT_REPOSITORY_URL } from '@/lib/projectLinks';

vi.mock('../landing/PlatformShowcase', () => ({ PlatformShowcase: () => null }));
vi.mock('../new-landing/PlatformShowcase', () => ({ PlatformShowcase: () => null }));
vi.mock('../new-landing/hero/HeroFlowScene', () => ({ HeroFlowScene: () => null }));

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each([
  ['main', LandingPage],
  ['alternate', NewLandingPage],
] as const)('%s OSS landing page', (_name, Page) => {
  it('offers GitHub links in the hero and footer CTA without an access request form', () => {
    render(<Page onSignIn={vi.fn()} />);
    const links = screen.getAllByRole('link', { name: /view on github/i });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', PROJECT_REPOSITORY_URL);
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(screen.queryByText(/request early access/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/private beta/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('preserves sign in for existing users', () => {
    const onSignIn = vi.fn();
    render(<Page onSignIn={onSignIn} />);
    fireEvent.click(screen.getByRole('button', { name: /log in|sign in/i }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });
});
