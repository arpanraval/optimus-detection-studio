import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RulePreviewDialog } from '../RulePreviewDialog';
import { nativeSiemService } from '@/services/nativeSiemService';
import type { InventoryRow } from '../../../../supabase/functions/_shared/native-siem-model';

const row: InventoryRow = {
  id: 'r1', integration_id: 'c1', vendor_rule_id: '019e83af', rule_family: 'correlation',
  display_name: 'Suspicious process', observed_enabled: true, availability: 'present',
  normalization_error: null, match_candidate_count: 0, relationship: 'not_in_library',
  binding_id: null, binding_status: null, detection_id: null, last_seen_at: '2026-09-15T00:00:00Z',
  latest_snapshot_id: 'snap-1',
};

const content = {
  name: 'Suspicious process', description: 'Watches for odd parents', query: '#event_simpleName=ProcessRollup2',
  language: 'CQL' as const, severity: 'High', enabled: true,
  config: { search: { lookback: '1h' }, operation: { schedule: { definition: '@every 1h' } } },
};

describe('RulePreviewDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the observed query and configuration without importing anything', async () => {
    const read = vi.spyOn(nativeSiemService, 'remoteSnapshot').mockResolvedValue(content as never);
    render(<RulePreviewDialog row={row} onClose={() => {}} />);

    expect(await screen.findByText('#event_simpleName=ProcessRollup2')).toBeTruthy();
    expect(screen.getByText(/High/)).toBeTruthy();
    expect(screen.getByText('Watches for odd parents')).toBeTruthy();
    // Reads the snapshot the scan already recorded, which is the revision an import would freeze.
    expect(read).toHaveBeenCalledWith('snap-1');
    // Nothing here writes: previewing is a read, and the copy says so.
    expect(screen.getByText(/Nothing in CrowdStrike changes/)).toBeTruthy();
  });

  it('explains itself rather than showing an empty dialog when the rule was never read', async () => {
    const read = vi.spyOn(nativeSiemService, 'remoteSnapshot');
    render(<RulePreviewDialog row={{ ...row, latest_snapshot_id: null }} onClose={() => {}} />);

    expect((await screen.findByRole('alert')).textContent).toMatch(/has not been read from CrowdStrike yet/);
    expect(read).not.toHaveBeenCalled();
  });

  it('surfaces a read failure instead of rendering a blank body', async () => {
    vi.spyOn(nativeSiemService, 'remoteSnapshot').mockRejectedValue(new Error('permission denied'));
    render(<RulePreviewDialog row={row} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('permission denied'));
  });
});
