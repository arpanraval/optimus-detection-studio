import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture } from '@/lib/actionPlan/__tests__/preview.fixtures';
import type { EnvironmentProfile } from '@/types/environment';
import type { TechBucket } from '@/lib/actionPlan/technologyBuckets';
import { ActionPlanPreview } from '../ActionPlanPreview';

vi.mock('@/hooks/useTechniqueBuckets', () => ({
  useTechniqueBuckets: () => ({
    buckets: new Map([
      ['T1001', new Set<TechBucket>(['endpoint'])],
      ['T1002', new Set<TechBucket>(['endpoint'])],
    ]),
    loading: false,
    error: null,
  }),
}));
vi.mock('@/components/settings/environment-wizard/MiniMitreMatrix', () => ({
  MiniMitreMatrix: () => <div>Technical mapping matrix</div>,
}));
const profile = {
  sectors: ['Finance'],
  user_country: 'United States',
  log_sources: ['windows_security'],
  siem_platforms: ['Microsoft Sentinel'],
} as EnvironmentProfile;
function setup(intel = fixture()) {
  Element.prototype.scrollIntoView = vi.fn();
  return render(
    <MemoryRouter>
      <ActionPlanPreview
        intel={intel}
        profile={profile}
        totalLibrary={4436}
        compatibleLibrary={523}
        matchResult={null}
        includeDevelopment
        onScopeChange={vi.fn()}
      />
    </MemoryRouter>,
  );
}
afterEach(cleanup);
describe('assessment presents actions and evidence in the original design language', () => {
  it('keeps useful recommendations visible when five of 45 enabled rules lack mappings', () => {
    const intel = fixture();
    intel.deployedDetections = Array.from({ length: 45 }, (_, i) => ({
      ...intel.deployedDetections[0],
      id: `enabled-${i}`,
      mitreAttackIds: i < 5 ? [] : ['T1001'],
    }));
    setup(intel);
    expect(screen.getByText(/5 of 45 enabled rules have no ATT&CK mappings/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Check ATT&CK mappings on 5 enabled rules/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Evaluate an existing rule/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Endpoint: 2 actions/ })).toBeTruthy();
    expect(screen.queryByText('Confirm the assessment baseline before adding detections.')).toBeNull();
  });
  it('keeps the ring, gradient card action, technology and threat panels without headline coverage claims', () => {
    const view = setup();
    expect(view.container.querySelectorAll('svg circle').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: /Review next actions/ }).getAttribute('style')).toContain(
      'linear-gradient',
    );
    expect(screen.getByText('By Technology')).toBeTruthy();
    expect(screen.getByText('Relevant Threat Groups')).toBeTruthy();
    const summary = screen.getByRole('region', { name: 'Assessment summary' });
    expect(within(summary).getByText('2 actions')).toBeTruthy();
    expect(within(summary).queryByText(/50%|12%|523 rules to review/)).toBeNull();
    expect(screen.getByText('Where does the library fit?').closest('details')?.open).toBe(false);
  });
  it('states the specific outcome and completion criteria and keeps alternatives inside the action', () => {
    setup();
    const work = screen.getByRole('region', { name: 'Prioritized Actions' });
    expect(within(work).getByText(/no new rule is proposed/)).toBeTruthy();
    const reuse = within(work)
      .getByRole('heading', { name: /Evaluate an existing rule/ })
      .closest('article')!;
    fireEvent.click(within(reuse).getByRole('button', { name: /Evidence & completion/ }));
    expect(within(reuse).getByText('Done when')).toBeTruthy();
    expect(within(reuse).getByText(/accepted or rejected with evidence/)).toBeTruthy();
    expect(
      within(reuse)
        .getByText(/1 alternative/)
        .closest('details')?.open,
    ).toBe(false);
    expect(
      within(reuse)
        .getByRole('link', { name: /Review candidate/ })
        .getAttribute('href'),
    ).toBe('/library/detections/one');
  });
  it('filters the same batch by technology and lets users change the batch without changing production', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Endpoint: 2 actions/ }));
    const work = screen.getByRole('region', { name: 'Endpoint / Actions' });
    expect(within(work).getAllByRole('article')).toHaveLength(2);
    fireEvent.click(within(work).getByRole('checkbox', { name: /Plan: Evaluate/ }));
    expect(screen.getByRole('button', { name: 'Next 1 action' })).toBeTruthy();
    const summary = screen.getByRole('region', { name: 'Assessment summary' });
    expect(within(summary).getByText('1 action')).toBeTruthy();
  });
  it('keeps unresolved techniques in a research finding rather than emitting one task per missing technique', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'All 3 findings' }));
    expect(screen.getByRole('heading', { name: 'Investigate unresolved detection needs' })).toBeTruthy();
    expect(screen.getByText(/not a requirement to write one rule per technique/)).toBeTruthy();
  });
});
