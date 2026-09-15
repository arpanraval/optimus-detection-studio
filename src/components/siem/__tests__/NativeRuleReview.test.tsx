import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NativeRuleReview } from '../NativeRuleReview';
import { nativeSiemService } from '@/services/nativeSiemService';
import { integrationService } from '@/lib/integrationService';

const content = {
  name: 'Okta admin role granted',
  description: 'Someone was granted an admin role in Okta.',
  query: '#Vendor="okta"',
  language: 'CQL',
  severity: 'Medium',
  enabled: true,
  config: { search: { outcome: 'detection', lookback: '1h0m' } },
};

function previewFixture(overrides: Record<string, unknown> = {}) {
  return {
    binding: {
      id: 'b1', detection_id: 'd1', integration_id: 'int-1', vendor_rule_id: 'rule-42',
      availability: 'present', binding_status: 'active', last_seen_at: '2026-09-15T10:00:00Z',
    },
    baseline: content,
    local: content,
    remote: content,
    drift: 'local_changed',
    remoteHash: 'hash-1',
    localVersion: 2,
    writesEnabled: true,
    capabilities: { update: null, enable: null, disable: null, delete: null },
    ...overrides,
  };
}

describe('NativeRuleReview production actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(nativeSiemService, 'revisions').mockResolvedValue([] as never);
  });

  // An imported rule has no deployment history to act on, so with these gone there was no route
  // to disabling or deleting it anywhere in the app.
  it('offers Disable for a rule that is enabled in production, and sends it', async () => {
    vi.spyOn(nativeSiemService, 'preview').mockResolvedValue(previewFixture() as never);
    const toggle = vi.spyOn(integrationService, 'toggleVendorRule').mockResolvedValue(undefined as never);
    render(<NativeRuleReview bindingId="b1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Disable rule in CrowdStrike' }));
    expect(screen.getByRole('alertdialog').textContent).toContain('rule-42');
    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/ }));

    await waitFor(() => expect(toggle).toHaveBeenCalledWith('int-1', 'rule-42', false));
  });

  it('offers Enable instead when production has the rule switched off', async () => {
    vi.spyOn(nativeSiemService, 'preview')
      .mockResolvedValue(previewFixture({ remote: { ...content, enabled: false } }) as never);
    render(<NativeRuleReview bindingId="b1" />);

    expect(await screen.findByRole('button', { name: 'Enable rule in CrowdStrike' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Disable rule in CrowdStrike' })).toBeNull();
  });

  // Deleting the rule in CrowdStrike is a different act from deleting the library copy, and the
  // confirmation has to say which one is about to happen.
  it('names the remote rule and separates it from deleting the library copy', async () => {
    vi.spyOn(nativeSiemService, 'preview').mockResolvedValue(previewFixture() as never);
    const remove = vi.spyOn(integrationService, 'deleteVendorRule').mockResolvedValue(undefined as never);
    render(<NativeRuleReview bindingId="b1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete rule from CrowdStrike' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('rule-42');
    expect(dialog.textContent).toContain('not Delete from library');
    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/ }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith('int-1', 'rule-42'));
  });

  // The server refuses with this sentence; offering the button anyway would only find that out
  // after the user pressed it.
  it('disables a gated action and states the reason the server gave', async () => {
    vi.spyOn(nativeSiemService, 'preview').mockResolvedValue(previewFixture({
      capabilities: {
        update: null, enable: null,
        disable: 'CrowdStrike changed since you last checked. Review the difference before enabling or disabling.',
        delete: null,
      },
    }) as never);
    render(<NativeRuleReview bindingId="b1" />);

    const disable = await screen.findByRole('button', { name: 'Disable rule in CrowdStrike' });
    expect((disable as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Review the difference before enabling or disabling/)).toBeTruthy();
  });
});
