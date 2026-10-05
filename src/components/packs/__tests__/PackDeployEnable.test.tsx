import React from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Detection } from '../../../types';
const mocks = vi.hoisted(() => ({ create: vi.fn().mockResolvedValue('job'), toast: vi.fn(), active: vi.fn() }));
vi.mock('../../../lib/packDeployJobService', () => ({
  previewDeployJob: async () => [{ detection_id: 'rule', detection_name: 'KQL rule', reason: null }],
  createDeployJob: mocks.create,
}));
vi.mock('../../../context/DeployJobContext', () => ({ useDeployJob: () => ({ setActiveJob: mocks.active }) }));
vi.mock('../../../hooks/useToast', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock('../../integrations/IntegrationLogo', () => ({ IntegrationLogo: () => null }));
vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        order: async () => ({ data: [{ id: 'sentinel', name: 'Sentinel production', provider: 'sentinel' }] }),
      };
      return q;
    },
  },
}));
import { PackDeployPickerModal } from '../PackDeployPickerModal';

it('retains enabled state through configuration, review, back navigation and job creation', async () => {
  render(
    <React.StrictMode>
      <PackDeployPickerModal isOpen onClose={vi.fn()} packId="pack" detections={[{ id: 'rule' }] as Detection[]} />
    </React.StrictMode>,
  );
  fireEvent.click(await screen.findByRole('button', { name: /Sentinel production/ }));
  const enable = screen.getByRole('checkbox', { name: 'Enable rule immediately after deployment' });
  fireEvent.click(enable);
  expect(enable).toBeChecked();
  await waitFor(() => expect(screen.getByRole('button', { name: /Next: Review/ })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: /Next: Review/ }));
  expect(screen.getByText('Enable immediately')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('checkbox', { name: 'Enable rule immediately after deployment' })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: /Next: Review/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Deploy 1' }));
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ ruleConfig: expect.objectContaining({ enabled: true }) }),
    ),
  );
});
