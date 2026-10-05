import React from 'react';
import '@testing-library/jest-dom/vitest';
import '@testing-library/jest-dom/vitest';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ preview: vi.fn(), create: vi.fn(), setActive: vi.fn(), toast: vi.fn(), provider: 'defender_xdr' }));
vi.mock('../../../lib/packDeployJobService', () => ({
  previewDeployJob: mocks.preview,
  createDeployJob: mocks.create,
}));
vi.mock('../../../context/DeployJobContext', () => ({ useDeployJob: () => ({ setActiveJob: mocks.setActive }) }));
vi.mock('../../../hooks/useToast', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        order: async () => ({ data: [{ id: 'siem', name: 'Defender', provider: mocks.provider }] }),
      };
      return q;
    },
  },
}));
vi.mock('../../integrations/IntegrationLogo', () => ({ IntegrationLogo: () => null }));
vi.mock('../../integrations/ProviderRuleConfigForm', () => ({ ProviderRuleConfigForm: () => <div>Settings</div> }));
import { PackDeployPickerModal } from '../PackDeployPickerModal';
import type { Detection } from '../../../types';
const detections = [
  { id: 'd1', name: 'KQL rule' },
  { id: 'd2', name: 'SPL rule' },
] as Detection[];
beforeEach(() => { vi.clearAllMocks(); mocks.provider = 'defender_xdr'; });
it('shows per-rule skip reasons and submits only after eligibility completes', async () => {
  mocks.preview.mockResolvedValue([
    { detection_id: 'd1', detection_name: 'KQL rule', reason: null },
    { detection_id: 'd2', detection_name: 'SPL rule', reason: 'No non-empty KQL query' },
  ]);
  mocks.create.mockResolvedValue('job');
  render(<PackDeployPickerModal isOpen onClose={vi.fn()} packId="pack" detections={detections} />);
  fireEvent.click(await screen.findByRole('button', { name: /Defender/ }));
  const skipped = await screen.findByText(/1 skipped.*view reasons/);
  expect(skipped.closest('details')).not.toHaveAttribute('open');
  fireEvent.click(skipped);
  expect(screen.getByText('No non-empty KQL query (1)')).toBeInTheDocument();
  expect(screen.getByText('SPL rule')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Next: Review/ }));
  expect(screen.getByText(/MITRE tactics and techniques use each detection/)).toBeInTheDocument();
  expect(screen.getByText('Shared settings')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Deploy 1' }));
  await waitFor(() => expect(mocks.setActive).toHaveBeenCalledWith('job'));
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ detections, requestKey: expect.any(String) }));
  const config = mocks.create.mock.calls[0][0].ruleConfig;
  expect(config).not.toHaveProperty('category');
  expect(config).not.toHaveProperty('tactics');
  expect(config).not.toHaveProperty('techniques');
});
it('prevents queueing when the server cannot verify eligibility', async () => {
  mocks.preview.mockRejectedValue(new Error('Binding lookup failed'));
  render(<PackDeployPickerModal isOpen onClose={vi.fn()} packId="pack" detections={detections} />);
  fireEvent.click(await screen.findByRole('button', { name: /Defender/ }));
  expect(await screen.findByText('Binding lookup failed')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Next: Review/ })).toBeDisabled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it('reconciles directly in the wizard and refreshes eligibility without starting a job', async () => {
  mocks.provider = 'sentinel';
  mocks.preview.mockResolvedValueOnce([{ detection_id: 'd1', detection_name: 'KQL rule', reason: 'Unknown outcome', can_reconcile: true }]);
  let finish: (value: unknown) => void;
  mocks.preview.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  render(<PackDeployPickerModal isOpen onClose={vi.fn()} packId="pack" detections={detections} />);
  fireEvent.click(await screen.findByRole('button', { name: /Defender/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Reconcile with Sentinel' }));
  expect(await screen.findByRole('button', { name: 'Reconciling...' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Next: Review/ })).toBeDisabled();
  finish!([{ detection_id: 'd1', detection_name: 'KQL rule', reason: null, notice: 'No matching rule found' }]);
  await waitFor(() => expect(screen.getByRole('button', { name: /Next: Review/ })).toBeEnabled());
  expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ reconcile: true, integrationId: 'siem' }));
  expect(mocks.create).not.toHaveBeenCalled();
});

it('shows all eligible rules separately from the subset cleared against prior deployments', async () => {
  const pack = Array.from({ length: 50 }, (_, n) => ({ id: `d${n}`, name: `Rule ${n}` })) as Detection[];
  mocks.preview.mockResolvedValue(pack.map((d, n) => ({ detection_id: d.id, detection_name: d.name, reason: null, ...(n < 44 ? { notice: 'No current match' } : {}) })));
  render(<PackDeployPickerModal isOpen onClose={vi.fn()} packId="pack" detections={pack} />);
  fireEvent.click(await screen.findByRole('button', { name: /Defender/ }));
  expect(await screen.findByText(/50 of 50 eligible.*0 skipped/)).toBeInTheDocument();
  expect(screen.getByText(/Includes 44 rules eligible to be created again/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Next: Review/ }));
  expect(screen.getByRole('button', { name: 'Deploy 50' })).toBeEnabled();
  expect(mocks.create).not.toHaveBeenCalled();
});
