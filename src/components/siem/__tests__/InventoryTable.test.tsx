import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { InventoryTable } from '../InventoryTable';
import type { InventoryRow } from '../../../../supabase/functions/_shared/native-siem-model';

const base: InventoryRow = {
  id: 'r1', integration_id: 'c1', vendor_rule_id: '019e83af', rule_family: 'correlation',
  display_name: 'Suspicious process', observed_enabled: true, availability: 'present',
  normalization_error: null, match_candidate_count: 0, relationship: 'not_in_library',
  binding_id: null, binding_status: null, detection_id: null, last_seen_at: '2026-09-15T00:00:00Z',
  latest_snapshot_id: 'snap-1',
};
const draw = (rows: InventoryRow[]) =>
  render(<MemoryRouter><InventoryTable rows={rows} loading={false} /></MemoryRouter>);

describe('inventory table', () => {
  it('shows library relationship and SIEM state as separate columns', () => {
    draw([base]);
    expect(screen.getByText('Not in library')).toBeTruthy();
    expect(screen.getByText('Enabled')).toBeTruthy();
    expect(screen.getByText('Ready to import')).toBeTruthy();
  });

  it('does not promise an import for a rule the scan never read', () => {
    render(
      <MemoryRouter>
        <InventoryTable
          rows={[{ ...base, latest_snapshot_id: null }]}
          loading={false}
          selectedIds={new Set()}
          onTogglePage={() => {}}
          onToggle={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Import unavailable · Not read from CrowdStrike yet')).toBeTruthy();
    expect(screen.queryByText('Ready to import')).toBeNull();
    expect((screen.getByRole('checkbox', { name: /Select Suspicious process/ }) as HTMLInputElement).disabled).toBe(true);
  });

  it('does not promise an import for a rule that is gone from CrowdStrike', () => {
    render(
      <MemoryRouter>
        <InventoryTable
          rows={[{ ...base, availability: 'missing' }]}
          loading={false}
          selectedIds={new Set()}
          onTogglePage={() => {}}
          onToggle={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Not found in the connected SIEM')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: /Select Suspicious process/ }) as HTMLInputElement).disabled).toBe(true);
  });

  it('offers a read-only preview for a readable rule that is not in the library', () => {
    const seen: string[] = [];
    render(
      <MemoryRouter>
        <InventoryTable rows={[base]} loading={false} onPreview={(row) => seen.push(row.vendor_rule_id)} />
      </MemoryRouter>,
    );
    screen.getByRole('button', { name: 'Preview' }).click();
    expect(seen).toEqual([base.vendor_rule_id]);
  });

  it('offers Review changes separately from opening the library rule', () => {
    const reviewed: string[] = [];
    render(
      <MemoryRouter>
        <InventoryTable
          rows={[{ ...base, relationship: 'already_in_library', binding_status: 'active',
                   detection_id: 'd1', binding_id: 'b1' }]}
          loading={false}
          onReview={(row) => reviewed.push(row.vendor_rule_id)}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Open library rule' }).getAttribute('href')).toContain('d1');
    screen.getByRole('button', { name: 'Review changes' }).click();
    expect(reviewed).toEqual([base.vendor_rule_id]);
    // A tracked rule is already in the library; previewing the catalog copy is not the question.
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
  });

  it('does not link a rule that has no library copy', () => {
    draw([base]);
    expect(screen.queryByRole('link', { name: /Suspicious process/ })).toBeNull();
  });

  it('links an imported rule to its detection', () => {
    draw([{ ...base, relationship: 'already_in_library', binding_status: 'active', detection_id: 'd1' }]);
    expect(screen.getByRole('link', { name: /Suspicious process/ }).getAttribute('href')).toContain('d1');
    expect(screen.getAllByText('In library').length).toBeGreaterThan(0);
  });

  it('never reports an unread rule as disabled', () => {
    draw([{ ...base, availability: 'unknown', observed_enabled: null }]);
    expect(screen.getByText('State unavailable')).toBeTruthy();
    expect(screen.queryByText('Disabled')).toBeNull();
  });

  it('explains why an unsupported rule cannot be imported', () => {
    draw([{ ...base, relationship: 'unsupported', normalization_error: 'Unsupported rule: no CQL query' }]);
    expect(screen.getByText('Import unavailable · Unsupported rule family')).toBeTruthy();
    expect(screen.getByText('Import unavailable · Unsupported rule: no CQL query')).toBeTruthy();
  });

  it('offers no per-row import action', () => {
    draw([base]);
    expect(screen.queryByRole('button', { name: /import/i })).toBeNull();
  });

  it('shows an archived library copy as archived, not as not in library', () => {
    draw([{ ...base, relationship: 'archived_in_library', binding_status: 'tombstone', detection_id: 'd1' }]);
    expect(screen.getAllByText('Archived in library').length).toBeGreaterThan(0);
    expect(screen.queryByText('Not in library')).toBeNull();
  });

  it('still links and offers to open the library rule for an archived copy', () => {
    draw([{ ...base, relationship: 'archived_in_library', binding_status: 'tombstone', detection_id: 'd1' }]);
    expect(screen.getByRole('link', { name: /Suspicious process/ }).getAttribute('href')).toContain('d1');
    // "Open library rule" now navigates to the rule. It used to be a button that opened the
    // production comparison, so the label and the destination disagreed.
    expect(screen.getByRole('link', { name: 'Open library rule' }).getAttribute('href')).toContain('d1');
  });

  it('disables selection of an archived row and explains how to restore it', () => {
    render(
      <MemoryRouter>
        <InventoryTable
          rows={[{ ...base, relationship: 'archived_in_library', binding_status: 'tombstone', detection_id: 'd1' }]}
          loading={false}
          selectedIds={new Set()}
          onTogglePage={() => {}}
          onToggle={() => {}}
        />
      </MemoryRouter>
    );
    const checkbox = screen.getByRole('checkbox', { name: /Select Suspicious process/ });
    expect(checkbox).toHaveProperty('disabled', true);
    expect(checkbox.getAttribute('title')).toBe('Archived in library. Restore it from the library to track it again.');
  });

  it('never checks the header box when the page has no eligible row and pageAllSelected is absent', () => {
    // Regression: rows.every(...) over an empty/all-ineligible page is vacuously true.
    // pageAllSelected must come from the selection hook, not be re-derived here.
    render(
      <MemoryRouter>
        <InventoryTable
          rows={[{ ...base, relationship: 'already_in_library', binding_status: 'active', detection_id: 'd1' }]}
          loading={false}
          selectedIds={new Set()}
          onTogglePage={() => {}}
          onToggle={() => {}}
        />
      </MemoryRouter>
    );
    const header = screen.getByRole('checkbox', { name: 'Select all eligible rules on this page' });
    expect(header).toHaveProperty('checked', false);
  });
});
