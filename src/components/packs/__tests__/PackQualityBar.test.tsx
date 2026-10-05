import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PackQualityBar } from '../PackQualityBar';
import type { Detection } from '../../../types';
it('shows Review rules as eligible without claiming Microsoft validation', () => {
  const detections = Array.from({ length: 50 }, (_, i) => ({
    id: String(i),
    name: `Rule ${i}`,
    library_type: 'production',
    status: 'Review',
    queries: [{ language: 'KQL', query: 'AzureActivity' }],
  })) as Detection[];
  render(<PackQualityBar pack={{ platforms: ['sentinel'] }} detections={detections} />);
  expect(screen.getByText('50 of 50 eligible')).toBeInTheDocument();
  expect(screen.getByText(/Microsoft query validation is separate/)).toBeInTheDocument();
  expect(screen.queryByText('No production-ready detections')).not.toBeInTheDocument();
});
