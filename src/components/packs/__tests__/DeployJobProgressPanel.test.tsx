import React from 'react';
import '@testing-library/jest-dom/vitest';
import '@testing-library/jest-dom/vitest';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  retry: vi.fn(),
  cancel: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('../../../hooks/usePackDeployJob', () => ({ usePackDeployJob: () => mocks.state }));
vi.mock('../../../hooks/useToast', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock('../../../lib/packDeployJobService', () => ({ retryFailedItems: mocks.retry, cancelJob: mocks.cancel }));
import { DeployJobProgressPanel } from '../DeployJobProgressPanel';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = {
    job: { status: 'failed', total_items: 2, failed_count: 2, succeeded_count: 0, skipped_count: 0 },
    items: [
      { id: '1', status: 'failed', retryable: true, needs_reconciliation: false },
      { id: '2', status: 'failed', retryable: false, needs_reconciliation: true },
    ],
    refresh: vi.fn(),
  };
});
it('offers retry only for known-safe items and reports control errors', async () => {
  mocks.retry.mockRejectedValue(new Error('A worker is still active'));
  render(<DeployJobProgressPanel jobId="job" onDismiss={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Retry 1 Failed' }));
  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith('error', 'Deployment action failed', 'A worker is still active'),
  );
});
it('does not offer retry for uncertain writes', () => {
  mocks.state.items = [{ id: '2', status: 'failed', retryable: false, needs_reconciliation: true }];
  render(<DeployJobProgressPanel jobId="job" onDismiss={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
});
