import React from 'react';
import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PackGlyph } from '../PackGlyph';

it('renders persisted icon names as SVG, preserves emoji, and safely handles unknown names', () => {
  const { container, rerender } = render(<PackGlyph value="package" />);
  expect(container.querySelector('svg')).not.toBeNull();
  expect(container.textContent).not.toContain('package');
  rerender(<PackGlyph value="🛡️" />);
  expect(container.textContent).toBe('🛡️');
  rerender(<PackGlyph value="unknown-icon-name" />);
  expect(container.querySelector('svg')).not.toBeNull();
  expect(container.textContent).not.toContain('unknown-icon-name');
});
