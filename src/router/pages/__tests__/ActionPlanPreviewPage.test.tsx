import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture } from '@/lib/actionPlan/__tests__/preview.fixtures';
import { ActionPlanPreviewPage, resetActionPlanPreviewSession } from '../ActionPlanPreviewPage';

const mocks = vi.hoisted(() => ({
  user: 'user-one',
  environment: {} as Record<string, unknown>,
  intel: {} as Record<string, unknown>,
  feasibility: {} as Record<string, unknown>,
}));
vi.mock('@/router/AppDataContext', () => ({ useAppData: () => ({ user: { id: mocks.user } }) }));
vi.mock('@/hooks/useEnvironmentProfile', () => ({ useEnvironmentProfile: () => mocks.environment }));
vi.mock('@/hooks/useProfileIntelligence', () => ({ useProfileIntelligence: () => mocks.intel }));
vi.mock('@/components/settings/environment-wizard/useFeasibilityLive', () => ({
  useFeasibilityLive: () => mocks.feasibility,
}));
vi.mock('@/hooks/useTechniqueBuckets', () => ({
  useTechniqueBuckets: () => ({ buckets: new Map(), loading: false, error: null }),
}));
vi.mock('@/services/directFeasibilityService', () => ({ computeEffectiveGroupKeys: () => ['windows_security'] }));
vi.mock('@/components/action-plan/ActionPlanPreview', () => ({
  ActionPlanPreview: ({ intel }: { intel: ReturnType<typeof fixture> }) => {
    const [selection, setSelection] = useState<string[]>([]);
    return (
      <section aria-label="Retained plan">
        <p>{intel.deployedDetections.length} enabled detections</p>
        <p>{selection.length} saved choices</p>
        <button
          onClick={() => {
            setSelection(['chosen']);
          }}
        >
          Choose a rule
        </button>
      </section>
    );
  },
}));
const profile = {
  id: 'profile',
  user_id: 'user-one',
  sectors: ['Finance'],
  log_sources: ['windows_security'],
  siem_platforms: ['Microsoft Sentinel'],
  custom_log_sources: [],
  edr_tools: [],
  cloud_platforms: {},
};
const page = () => (
  <MemoryRouter>
    <ActionPlanPreviewPage />
  </MemoryRouter>
);
beforeEach(() => {
  resetActionPlanPreviewSession();
  mocks.user = 'user-one';
  mocks.environment = { profile, isLoading: false, error: null };
  mocks.feasibility = {
    matchResult: { matchedDetections: [] },
    loading: false,
    error: null,
    totalCount: 100,
    matchedCount: 20,
  };
  mocks.intel = { ...fixture(), loading: true };
});
afterEach(cleanup);

async function loadedPage() {
  const view = render(page());
  mocks.intel = { ...fixture(), loading: false };
  view.rerender(page());
  await screen.findByRole('region', { name: 'Retained plan' });
  return view;
}
describe('preview retains its last successful result', () => {
  it('keeps the plan mounted and selections intact during focus refresh, then updates counts', async () => {
    const view = await loadedPage();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a rule' }));
    const node = screen.getByRole('region', { name: 'Retained plan' });
    mocks.intel = { ...mocks.intel, loading: true };
    view.rerender(page());
    expect(screen.getByRole('region', { name: 'Retained plan' })).toBe(node);
    expect(screen.getByText('1 saved choices')).toBeTruthy();
    expect(screen.getByText(/Updating in the background/)).toBeTruthy();
    mocks.intel = { ...fixture(), loading: false, deployedDetections: [] };
    view.rerender(page());
    await screen.findByText('0 enabled detections');
    expect(screen.getByText('1 saved choices')).toBeTruthy();
  });
  it('restores the same user’s plan immediately on route return while profile and intelligence reload', async () => {
    const view = await loadedPage();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a rule' }));
    view.unmount();
    mocks.environment = { profile: null, isLoading: true, error: null };
    mocks.intel = { ...fixture(), deployedDetections: [], loading: true };
    mocks.feasibility = { ...mocks.feasibility, matchResult: null, loading: true };
    render(page());
    expect(screen.getByText('1 enabled detections')).toBeTruthy();
  });
  it('keeps last good data on error, and never shows another user’s cached plan', async () => {
    const view = await loadedPage();
    mocks.intel = { ...mocks.intel, loading: false, error: 'Fetch failed' };
    view.rerender(page());
    expect(screen.getByRole('alert').textContent).toContain('showing your last loaded plan');
    expect(screen.getByText('1 enabled detections')).toBeTruthy();
    view.unmount();
    mocks.user = 'user-two';
    mocks.environment = { profile: null, isLoading: true, error: null };
    render(page());
    expect(screen.queryByRole('region', { name: 'Retained plan' })).toBeNull();
    expect(screen.getByText('Loading environment profile…')).toBeTruthy();
  });
  it('does not publish empty initial intelligence before a completed fetch', async () => {
    mocks.intel = { ...fixture(), loading: false, deployedDetections: [], groupTechniqueDetails: {} };
    render(page());
    await act(async () => {});
    expect(screen.queryByRole('region', { name: 'Retained plan' })).toBeNull();
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Preparing your first plan'));
  });
});
