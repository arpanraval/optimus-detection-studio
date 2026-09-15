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

  it('does not link a rule that has no library copy', () => {
    draw([base]);
    expect(screen.queryByRole('link', { name: /Suspicious process/ })).toBeNull();
  });

  it('links an imported rule to its detection', () => {
    draw([{ ...base, relationship: 'already_in_library', binding_status: 'active', detection_id: 'd1' }]);
    expect(screen.getByRole('link', { name: /Suspicious process/ }).getAttribute('href')).toContain('d1');
    expect(screen.getAllByText('Already in library').length).toBeGreaterThan(0);
  });

  it('never reports an unread rule as disabled', () => {
    draw([{ ...base, availability: 'unknown', observed_enabled: null }]);
    expect(screen.getByText('Unknown')).toBeTruthy();
    expect(screen.queryByText('Disabled')).toBeNull();
  });

  it('explains why an unsupported rule cannot be imported', () => {
    draw([{ ...base, relationship: 'unsupported', normalization_error: 'Unsupported rule: no CQL query' }]);
    expect(screen.getByText('Unsupported')).toBeTruthy();
    expect(screen.getByText('Unsupported rule: no CQL query')).toBeTruthy();
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
    expect(screen.getByRole('button', { name: 'Open library rule' })).toBeTruthy();
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
});
