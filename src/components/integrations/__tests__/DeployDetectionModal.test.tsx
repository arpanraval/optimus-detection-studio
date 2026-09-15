import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DeployDetectionModal } from '../DeployDetectionModal';
import { integrationService } from '@/lib/integrationService';
import { nativeSiemService } from '@/services/nativeSiemService';
import { Status } from '@/types';
import { ThemeProvider } from '@/context/ThemeContext';

function renderModal(props: ReturnType<typeof boundProps>) {
  render(
    <MemoryRouter>
      <ThemeProvider>
        <DeployDetectionModal {...props} />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

// A tracked rule still routes through pre-flight like any other deploy — it's a LIVE
// production detection, so validating the query before overwriting it matters more here,
// not less. Navigate the same way a user would: wait for the pre-flight step to render, then
// click through to configure, exactly as the "Continue to Configure" soft gate always allows.
async function proceedThroughPreflight() {
  const button = await screen.findByRole('button', { name: /^Continue to Configure$/ });
  fireEvent.click(button);
}

// Fixtures: a detection already bound to a CrowdStrike rule, with a library edit to send.
const preview = {
  // The binding row is selected with `*`, so it carries its connection: the modal re-checks at
  // submit that the comparison it reviewed belongs to the connection still selected.
  binding: { id: 'b1', detection_id: 'd1', integration_id: 'int-1', vendor_rule_id: 'v1', availability: 'present' },
  baseline: { query: 'old' }, local: { query: 'new' }, remote: { query: 'old', enabled: true },
  drift: 'local_changed', remoteHash: 'hash-1', localVersion: 3, writesEnabled: true,
  capabilities: { update: null, enable: null, disable: null, delete: null },
};

// The same rule with the configuration an update writes, for the tests that edit it.
const ruleConfig = {
  search: { outcome: 'detection', lookback: '1h0m' },
  operation: { schedule: { definition: '@every 1h0m' } },
};
const configuredPreview = {
  ...preview,
  local: { ...preview.local, language: 'CQL', severity: 'High', enabled: true, config: ruleConfig },
  remote: { ...preview.remote, severity: 'High', enabled: true, config: ruleConfig },
};

const CROWDSTRIKE_INTEGRATION = {
  id: 'int-1',
  user_id: 'u1',
  provider: 'crowdstrike' as const,
  name: 'CrowdStrike',
  category: 'siem' as const,
  config: {},
  auth_type: 'api_key' as const,
  status: 'connected' as const,
  last_tested_at: null,
  last_test_result: null,
  last_synced_at: null,
  is_default: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function boundProps() {
  const detection = {
    id: 'd1',
    user_id: 'u1',
    version: 1,
    createdDate: '2026-01-01',
    updatedDate: '2026-01-01',
    name: 'Suspicious PowerShell Download',
    description: 'Detects suspicious PowerShell activity',
    author: 'analyst',
    status: Status.Production,
    detectionQuery: 'new',
    queryLanguage: 'CQL',
    siem_observations: [
      {
        id: 'b1',
        integration_id: 'int-1',
        vendor_rule_id: 'v1',
        binding_status: 'active',
        availability: 'present',
        observed_enabled: true,
        last_seen_at: '2026-01-01T00:00:00Z',
      },
    ],
  } as any;

  return {
    detection,
    onClose: vi.fn(),
    userRole: 'admin',
  };
}

describe('DeployDetectionModal for a rule already tracked in a SIEM', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(integrationService, 'listIntegrations').mockResolvedValue([CROWDSTRIKE_INTEGRATION] as never);
    vi.spyOn(nativeSiemService, 'preview').mockResolvedValue(preview as never);
  });

  it('shows the production comparison instead of a create-or-update choice', async () => {
    renderModal(boundProps());
    await proceedThroughPreflight();
    expect(await screen.findByText(/already exists in CrowdStrike/i)).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /create a new rule/i })).toBeNull();
  });

  it('submits the hash it showed the user', async () => {
    const deploy = vi.spyOn(integrationService, 'deployDetection').mockResolvedValue({} as never);
    renderModal(boundProps());
    await proceedThroughPreflight();
    fireEvent.click(await screen.findByRole('button', { name: /^Update in CrowdStrike/ }));
    await waitFor(() => expect(deploy).toHaveBeenCalled());
    expect(deploy.mock.calls[0][0]).toMatchObject({ expectedHash: 'hash-1', expectedVersion: 3 });
  });

  // The server refuses with this sentence anyway; showing it up front is the point of capabilities.
  it('disables the action and states the reason when the write is gated', async () => {
    vi.spyOn(nativeSiemService, 'preview').mockResolvedValue({
      ...preview, writesEnabled: false,
      capabilities: { update: 'Sending changes to CrowdStrike is not enabled for this installation.',
                      enable: null, disable: null, delete: null },
    } as never);
    renderModal(boundProps());
    await proceedThroughPreflight();
    const button = await screen.findByRole('button', { name: /^Update in CrowdStrike/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/not enabled for this installation/)).toBeTruthy();
  });

  // SQL refuses a Draft at the moment of writing ("Review this detection before deploying").
  // Skipping the validation screen for a tracked rule only moved that refusal to after the user
  // pressed Update, with the reason buried in a non-2xx response.
  it('keeps a Draft on the validation screen instead of offering it an Update button', async () => {
    const props = boundProps();
    props.detection.status = Status.Draft;
    renderModal(props);
    expect(await screen.findByText(/must be in Production, Testing, or Review status/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Update in CrowdStrike/ })).toBeNull();
  });

  // Without the comparison there is no reviewed revision to send, so the ordinary form can only
  // end in a server refusal. The one action that helps is loading the comparison again.
  it('fails closed and offers a retry when the comparison cannot be loaded', async () => {
    vi.spyOn(nativeSiemService, 'preview').mockRejectedValue(new Error('Comparison unavailable'));
    renderModal(boundProps());
    expect(await screen.findByText('Comparison unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Retry comparison/ })).toBeTruthy();
    const advance = screen.getByRole('button', { name: /^Continue$/ }) as HTMLButtonElement;
    expect(advance.disabled).toBe(true);
  });

  // The binding names WHICH query is deployed. Re-picking the first compatible query here meant
  // the preview, the validation and the write could each concern a different one.
  it('deploys the query the binding selected, not the first compatible one', async () => {
    const props = boundProps();
    props.detection.queries = [
      { id: 'q1', language: 'CQL', query: 'first-query' },
      { id: 'q2', language: 'CQL', query: 'bound-second-query' },
    ];
    vi.spyOn(nativeSiemService, 'preview').mockResolvedValue({
      ...preview,
      local: { ...preview.local, query: 'bound-second-query', language: 'CQL', name: 'Saved library name' },
    } as never);
    const deploy = vi.spyOn(integrationService, 'deployDetection').mockResolvedValue({} as never);
    renderModal(props);
    await proceedThroughPreflight();
    fireEvent.click(await screen.findByRole('button', { name: /^Update in CrowdStrike/ }));
    await waitFor(() => expect(deploy).toHaveBeenCalled());
    expect(deploy.mock.calls[0][0]).toMatchObject({ query: 'bound-second-query', queryLanguage: 'CQL' });
  });

  // The native writer derives name and description from the saved detection, so an edit typed
  // into this form would be shown to the user and then dropped.
  it('shows the saved name read-only and submits it rather than a local edit', async () => {
    vi.spyOn(nativeSiemService, 'preview').mockResolvedValue({
      ...preview,
      local: { ...preview.local, name: 'Saved library name', description: 'Saved description' },
    } as never);
    const deploy = vi.spyOn(integrationService, 'deployDetection').mockResolvedValue({} as never);
    renderModal(boundProps());
    await proceedThroughPreflight();
    const name = await screen.findByDisplayValue('Saved library name') as HTMLInputElement;
    expect(name.readOnly).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^Update in CrowdStrike/ }));
    await waitFor(() => expect(deploy).toHaveBeenCalled());
    expect((deploy.mock.calls[0][0] as { ruleConfig: Record<string, unknown> }).ruleConfig)
      .toMatchObject({ name: 'Saved library name', description: 'Saved description' });
  });

  // Re-deploying is not only a query change. The server writes the SAVED library content and SQL
  // refuses a deploy whose version does not match it, so a settings edit has to be saved first and
  // the write has to use the revision that save produced.
  it('saves a settings change to the library, then deploys that revision', async () => {
    const save = vi.spyOn(nativeSiemService, 'save').mockResolvedValue({} as never);
    vi.spyOn(nativeSiemService, 'preview')
      .mockResolvedValueOnce(configuredPreview as never)
      .mockResolvedValueOnce({ ...configuredPreview, localVersion: 4 } as never);
    const deploy = vi.spyOn(integrationService, 'deployDetection').mockResolvedValue({} as never);
    renderModal(boundProps());
    await proceedThroughPreflight();

    fireEvent.change(await screen.findByDisplayValue('1h0m'), { target: { value: '24h0m' } });
    fireEvent.click(screen.getByRole('button', { name: /^Update in CrowdStrike/ }));

    await waitFor(() => expect(deploy).toHaveBeenCalled());
    expect(save.mock.calls[0][1]).toMatchObject({ lookback: '24h0m', schedule: '@every 1h0m', severity: 'High' });
    expect(deploy.mock.calls[0][0]).toMatchObject({ expectedVersion: 4, expectedHash: 'hash-1' });
  });

  // Saving touches nothing in production, so the comparison the user approved may have gone stale
  // in the meantime. Writing then would overwrite a version nobody looked at.
  it('does not write when production moved while the settings were being edited', async () => {
    vi.spyOn(nativeSiemService, 'save').mockResolvedValue({} as never);
    vi.spyOn(nativeSiemService, 'preview')
      .mockResolvedValueOnce(configuredPreview as never)
      .mockResolvedValueOnce({ ...configuredPreview, remoteHash: 'hash-2' } as never);
    const deploy = vi.spyOn(integrationService, 'deployDetection').mockResolvedValue({} as never);
    renderModal(boundProps());
    await proceedThroughPreflight();

    fireEvent.change(await screen.findByDisplayValue('1h0m'), { target: { value: '24h0m' } });
    fireEvent.click(screen.getByRole('button', { name: /^Update in CrowdStrike/ }));

    expect(await screen.findByText(/CrowdStrike changed while you were editing/)).toBeTruthy();
    expect(deploy).not.toHaveBeenCalled();
  });
});

// The regression that would hurt most: a future change that started attaching
// expectedHash/expectedVersion unconditionally would silently break every one of the five
// providers that can never have a binding (Splunk, Sentinel, Defender XDR, Elastic,
// Chronicle) — none of the bound-rule tests above would notice, since they all pass a binding.
const SPLUNK_INTEGRATION = {
  id: 'int-2',
  user_id: 'u1',
  provider: 'splunk' as const,
  name: 'Splunk Prod',
  category: 'siem' as const,
  config: {},
  auth_type: 'api_key' as const,
  status: 'connected' as const,
  last_tested_at: null,
  last_test_result: null,
  last_synced_at: null,
  is_default: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function unboundProps() {
  const detection = {
    id: 'd2',
    user_id: 'u1',
    version: 1,
    createdDate: '2026-01-01',
    updatedDate: '2026-01-01',
    name: 'Suspicious PowerShell Download',
    description: 'Detects suspicious PowerShell activity',
    author: 'analyst',
    status: Status.Production,
    detectionQuery: 'index=main sourcetype=powershell',
    queryLanguage: 'SPL',
    siem_observations: [],
  } as any;

  return {
    detection,
    onClose: vi.fn(),
    userRole: 'admin',
  };
}

describe('DeployDetectionModal for a detection with no SIEM binding', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(integrationService, 'listIntegrations').mockResolvedValue([SPLUNK_INTEGRATION] as never);
    vi.spyOn(integrationService, 'getDeploymentHistory').mockResolvedValue([
      { id: 'dep-1', action: 'create', status: 'success', vendor_rule_id: 'splunk-rule-1', created_at: '2026-01-01T00:00:00Z' },
    ] as never);
  });

  it('sends no expectedHash/expectedVersion, and keeps the create-vs-update radio and config form', async () => {
    const deploy = vi.spyOn(integrationService, 'deployDetection').mockResolvedValue({} as never);
    renderModal(unboundProps());

    fireEvent.click(await screen.findByRole('button', { name: /Splunk Prod/ }));

    // The create-vs-update radio (existingDeployment path) is intact, not replaced by the
    // production-comparison panel — there is no binding, so nothing to compare against.
    expect(await screen.findByText(/Previously Deployed/i)).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Update existing rule/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Create new rule/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Continue$/ }));

    // ProviderRuleConfigForm renders (the comparison panel does not) — Splunk's own config
    // fields, e.g. the security domain selector, are the giveaway that this is the unbound form.
    expect(await screen.findByText(/Security Domain/i)).toBeTruthy();
    expect(screen.queryByText(/already exists in/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Update$/ }));

    await waitFor(() => expect(deploy).toHaveBeenCalled());
    const call = deploy.mock.calls[0][0] as Record<string, unknown>;
    expect('expectedHash' in call).toBe(false);
    expect('expectedVersion' in call).toBe(false);
    expect(call.vendorRuleId).toBe('splunk-rule-1');
  });
});
