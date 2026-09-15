import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchResolutionDialog } from '../MatchResolutionDialog';
import { nativeSiemService, type MatchCandidate } from '@/services/nativeSiemService';
import type { InventoryRow } from '../../../../supabase/functions/_shared/native-siem-model';

const row: InventoryRow = {
  id: 'r1',
  integration_id: 'connection',
  vendor_rule_id: 'vendor-1',
  rule_family: 'correlation',
  display_name: 'Suspicious process',
  observed_enabled: true,
  availability: 'present',
  normalization_error: null,
  match_candidate_count: 1,
  relationship: 'match_needed',
  binding_id: null,
  binding_status: null,
  detection_id: null,
  last_seen_at: '2026-09-15T00:00:00Z',
  latest_snapshot_id: 'snapshot-1',
};

const twoQueryCandidate: MatchCandidate[] = [
  {
    detection_id: 'det-2',
    detection_name: 'Two-query rule',
    evidence: 'Legacy external ID matches',
    query_id: 'q-a',
    query_language: 'CQL',
    query_text: '#event_simpleName=ProcessRollup2',
    detection_version: 3,
  },
  {
    detection_id: 'det-2',
    detection_name: 'Two-query rule',
    evidence: 'Legacy external ID matches',
    query_id: 'q-b',
    query_language: 'CQL',
    query_text: '#event_simpleName=NetworkConnectIP4',
    detection_version: 3,
  },
];

function draw(candidates: MatchCandidate[]) {
  vi.spyOn(nativeSiemService, 'matchCandidates').mockResolvedValue(candidates);
  vi.spyOn(nativeSiemService, 'remoteSnapshot').mockResolvedValue({
    name: 'Suspicious process',
    description: '',
    query: '#event_simpleName=ProcessRollup2',
    language: 'CQL',
    severity: 'High',
    enabled: true,
    config: {},
  });
  const onClose = vi.fn<() => void>();
  const onLinked = vi.fn<() => void>();
  const onImportSeparate = vi.fn<() => void>();
  render(
    <MatchResolutionDialog
      integrationId="connection"
      row={row}
      onClose={onClose}
      onLinked={onLinked}
      onImportSeparate={onImportSeparate}
    />,
  );
  return { onClose, onLinked, onImportSeparate };
}

describe('MatchResolutionDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders every candidate with its evidence string, and only the candidates it was given', async () => {
    draw(twoQueryCandidate);
    await waitFor(() => expect(screen.getAllByText('Legacy external ID matches').length).toBeGreaterThan(0));
    // Exactly one detection group rendered (both rows share detection_id 'det-2'); no invented
    // name-only candidate appears.
    expect(screen.getAllByText('Two-query rule').length).toBe(1);
    expect(screen.getAllByText('Legacy external ID matches').length).toBe(1);
  });

  it('keeps Link existing library rule disabled until a candidate and one of its queries is chosen', async () => {
    draw(twoQueryCandidate);
    await waitFor(() => expect(screen.getByText('Two-query rule')).toBeTruthy());
    const linkButton = screen.getByRole('button', { name: 'Link existing library rule' });
    expect((linkButton as HTMLButtonElement).disabled).toBeTruthy();

    // Select the candidate but not a query yet — two CQL queries means the query radios appear
    // and nothing is auto-chosen.
    fireEvent.click(screen.getByRole('radio', { name: /Two-query rule/ }));
    expect((linkButton as HTMLButtonElement).disabled).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'q-a' }));
    expect((linkButton as HTMLButtonElement).disabled).toBeFalsy();
  });

  it('shows Baseline not established and the review warning when the selected query differs from the remote query', async () => {
    draw(twoQueryCandidate);
    await waitFor(() => expect(screen.getByText('Two-query rule')).toBeTruthy());
    fireEvent.click(screen.getByRole('radio', { name: /Two-query rule/ }));
    // q-b's text ('#event_simpleName=NetworkConnectIP4') differs from the mocked remote query
    // ('#event_simpleName=ProcessRollup2').
    fireEvent.click(screen.getByRole('radio', { name: 'q-b' }));
    await waitFor(() => expect(screen.getByText(/Baseline not established/)).toBeTruthy());
    expect(
      screen.getByText('Linking will not change either copy. Review the difference before deploying.', {
        exact: false,
      }),
    ).toBeTruthy();
  });

  it('calls onImportSeparate without a detectionId argument', async () => {
    const { onImportSeparate } = draw(twoQueryCandidate);
    await waitFor(() => expect(screen.getByText('Two-query rule')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Import as a separate rule' }));
    expect(onImportSeparate).toHaveBeenCalledTimes(1);
    expect(onImportSeparate.mock.calls[0].length).toBe(0);
  });

  it('closes without any callback when Skip is chosen', async () => {
    const { onClose, onLinked, onImportSeparate } = draw(twoQueryCandidate);
    await waitFor(() => expect(screen.getByText('Two-query rule')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onLinked).not.toHaveBeenCalled();
    expect(onImportSeparate).not.toHaveBeenCalled();
  });

  it('renders no candidate rows when a rule has none', async () => {
    draw([]);
    await waitFor(() =>
      expect(screen.getByText('No eligible library rule found for this CrowdStrike rule.')).toBeTruthy(),
    );
  });
});
