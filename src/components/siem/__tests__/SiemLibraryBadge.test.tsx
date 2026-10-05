import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SiemLibraryBadge } from '../SiemLibraryBadge';
import type { Detection } from '@/types';

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

describe('SIEM badge inside a detection card link', () => {
  it('opens outside the card without navigation and supports dismissal and scrolling', () => {
    const detection = { siem_observations: ['sentinel', 'defender_xdr'].map((provider, index) => ({
      id: String(index), provider, binding_status: 'active', availability: 'present',
      observed_enabled: true, last_seen_at: '2026-09-16T00:00:00Z',
    })) } as Detection;
    render(<MemoryRouter initialEntries={['/library']}>
      <Location />
      <Link to="/detection/one"><SiemLibraryBadge detection={detection} /></Link>
    </MemoryRouter>);
    const toggle = screen.getByRole('button');
    fireEvent.click(toggle);
    const panel = screen.getByRole('dialog', { name: 'SIEM bindings' });
    expect(panel.parentElement).toBe(document.body);
    expect(screen.getByTestId('location').textContent).toBe('/library');
    fireEvent.scroll(panel);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(panel);
    expect(screen.getByTestId('location').textContent).toBe('/library');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
