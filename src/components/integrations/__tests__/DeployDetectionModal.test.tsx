import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DeployDetectionModal } from '../DeployDetectionModal';
import { integrationService } from '@/lib/integrationService';
import { nativeSiemService } from '@/services/nativeSiemService';
import { Status } from '@/types';

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
    render(<DeployDetectionModal {...boundProps()} />);
    expect(await screen.findByText(/already exists in CrowdStrike/i)).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /create a new rule/i })).toBeNull();
  });

  it('submits the hash it showed the user', async () => {
    const deploy = vi.spyOn(integrationService, 'deployDetection').mockResolvedValue({} as never);
    render(<DeployDetectionModal {...boundProps()} />);
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
    render(<DeployDetectionModal {...boundProps()} />);
    const button = await screen.findByRole('button', { name: /^Update in CrowdStrike/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/not enabled for this installation/)).toBeTruthy();
  });
});
