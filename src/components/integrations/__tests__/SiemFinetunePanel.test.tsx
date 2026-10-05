import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Detection } from '../../../types';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  poll: vi.fn(),
  tool: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('../../../lib/finetuneService', () => ({ finetuneService: mocks }));

import { SiemFinetunePanel } from '../SiemFinetunePanel';

const detection = { id: 'det-1', name: 'Managed Identity Sign-In Activity' } as unknown as Detection;
const runningPoll = {
  status: 'running', timeline: [], pendingTools: [], queryCount: 0, result: null, usage: null,
};

function renderPanel(strict: boolean) {
  const panel = (
    <SiemFinetunePanel
      detection={detection}
      integrationId="int-1"
      windowDays={30}
      baselineHitCount={100}
      preflightRunId="pf-1"
      onApplyRefinement={() => {}}
    />
  );
  return render(strict ? <React.StrictMode>{panel}</React.StrictMode> : panel);
}

describe('SiemFinetunePanel start → poll loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.start.mockResolvedValue({ runId: 'run-1', sessionId: 'sesn_1' });
    mocks.poll.mockResolvedValue(runningPoll);
  });

  it('polls the run after start resolves (production render, no StrictMode)', async () => {
    renderPanel(false);
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.poll).toHaveBeenCalledWith('run-1'));
  });

  it('polls the run after start resolves under React.StrictMode (dev server render)', async () => {
    renderPanel(true);
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.poll).toHaveBeenCalledWith('run-1'));
  });
});
