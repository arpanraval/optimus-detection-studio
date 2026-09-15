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
  binding: { id: 'b1', detection_id: 'd1', vendor_rule_id: 'v1', availability: 'present' },
  baseline: { query: 'old' }, local: { query: 'new' }, remote: { query: 'old', enabled: true },
  drift: 'local_changed', remoteHash: 'hash-1', localVersion: 3, writesEnabled: true,
  capabilities: { update: null, enable: null, disable: null, delete: null },
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
