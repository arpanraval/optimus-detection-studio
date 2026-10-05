import React from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import type { DetectionPack } from '../../../types';
const mocks = vi.hoisted(() => ({ eq: vi.fn(), refresh: vi.fn() }));
vi.mock('../../../hooks/usePackDeploymentStatus', () => ({
  usePackDeploymentStatus: () => ({ statuses: [], refetch: mocks.refresh }),
}));
vi.mock('../../../hooks/usePackDeployJob', () => ({
  usePackDeployJob: () => ({
    items: [
      { id: 'item', detection_name: 'PowerShell rule', status: 'failed', error_message: 'Invalid technique T1059.001' },
    ],
  }),
}));
vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: () => {
      const q = {
        select: () => q,
        eq: (...args: unknown[]) => {
          mocks.eq(...args);
          return q;
        },
        order: () => q,
        limit: async () => ({
          data: [
            {
              id: 'job',
              status: 'partial',
              total_items: 50,
              succeeded_count: 41,
              failed_count: 9,
              skipped_count: 0,
              created_at: '2026-09-18T00:00:00Z',
              integrations: { name: 'Sentinel production' },
            },
          ],
        }),
      };
      return q;
    },
    channel: () => {
      const q = { on: () => q, subscribe: () => q };
      return q;
    },
    removeChannel: vi.fn(),
  },
}));
import { PackDeploymentsTab } from '../PackDeploymentsTab';

it('shows only this pack history and explains partial results without offering an automatic retry', async () => {
  render(
    <PackDeploymentsTab
      pack={{ id: 'sentinel-pack', platforms: ['sentinel'], detections: [] } as unknown as DetectionPack}
    />,
  );
  expect(await screen.findByText('41 succeeded')).toBeInTheDocument();
  expect(mocks.eq).toHaveBeenCalledWith('pack_id', 'sentinel-pack');
  expect(screen.getByText('9 failed')).toBeInTheDocument();
  expect(screen.getByText('Partially completed')).toBeInTheDocument();
  expect(screen.getByText(/does not establish query correctness/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Sentinel production/ }));
  expect(screen.getByText('Invalid technique T1059.001')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /retry|deploy/i })).not.toBeInTheDocument();
});
