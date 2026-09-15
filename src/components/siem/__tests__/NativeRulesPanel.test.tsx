import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NativeRulesPanel } from '../NativeRulesPanel';
import { SiemLibraryBadge } from '../SiemLibraryBadge';
import { nativeSiemService } from '@/services/nativeSiemService';
import type { Detection, Integration } from '@/types';
import type { InventoryRow } from '../../../../supabase/functions/_shared/native-siem-model';

const integrationFixture = { id: 'connection', name: 'Falcon', provider: 'crowdstrike' } as Integration;

function rowsFixture(count: number): InventoryRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    integration_id: 'connection',
    vendor_rule_id: `vendor-${i}`,
    rule_family: 'correlation',
    display_name: `Suspicious process ${i}`,
    observed_enabled: true,
    availability: 'present',
    normalization_error: null,
    match_candidate_count: 0,
    relationship: 'not_in_library',
    binding_id: null,
    binding_status: null,
    detection_id: null,
    last_seen_at: '2026-09-15T00:00:00Z',
  }));
}

const ZERO_COUNTS = {
  not_in_library: 0,
  already_in_library: 0,
  archived_in_library: 0,
  match_needed: 0,
  unsupported: 0,
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(nativeSiemService, 'latestRun').mockResolvedValue(null);
  vi.spyOn(nativeSiemService, 'inventoryCounts').mockResolvedValue(ZERO_COUNTS);
  vi.spyOn(nativeSiemService, 'inventoryPage').mockResolvedValue({ rows: [], hasMore: false });
});

describe('NativeRulesPanel', () => {
  it('shows the fetch action and the never-fetched empty state', async () => {
    render(
      <MemoryRouter>
        <NativeRulesPanel integration={integrationFixture} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: 'Fetch rules from CrowdStrike' })).toBeTruthy();
    expect(await screen.findByText('No inventory yet')).toBeTruthy();
  });

  it('prefers the search empty state over the never-fetched state', async () => {
    // Regression: an existing connection whose catalog came from the Task 1 backfill has no
    // 'inventory'/'refresh_tracked' run (hasEverFetched is false) even though rows exist. A
    // non-matching search on it must explain the search, not claim there is no inventory.
    render(
      <MemoryRouter>
        <NativeRulesPanel integration={integrationFixture} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search production rules' }), {
      target: { value: 'nonexistent-rule' },
    });
    expect(await screen.findByText('No matching rules')).toBeTruthy();
    expect(screen.queryByText('No inventory yet')).toBeNull();
  });

  it('prefers the filter empty state over the never-fetched state', async () => {
    vi.spyOn(nativeSiemService, 'inventoryCounts').mockResolvedValue({
      ...ZERO_COUNTS,
      already_in_library: 5,
    });
    render(
      <MemoryRouter>
        <NativeRulesPanel integration={integrationFixture} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Match needed 0' }));
    expect(await screen.findByText('Nothing in this view')).toBeTruthy();
    expect(screen.queryByText('No inventory yet')).toBeNull();
  });

  it('still shows the never-fetched state with no search and no filter active', async () => {
    render(
      <MemoryRouter>
        <NativeRulesPanel integration={integrationFixture} />
      </MemoryRouter>,
    );
    expect(await screen.findByText('No inventory yet')).toBeTruthy();
  });

  it('shows the empty-account state once a run has completed and found nothing', async () => {
    vi.spyOn(nativeSiemService, 'latestRun').mockResolvedValue({
      id: 'run-1',
      status: 'complete',
      phase: 'complete',
      kind: 'inventory',
      discovery_complete: true,
      created_at: '2026-09-15T00:00:00Z',
      completed_at: '2026-09-15T00:05:00Z',
      heartbeat_at: null,
      error_message: null,
    });
    render(
      <MemoryRouter>
        <NativeRulesPanel integration={integrationFixture} />
      </MemoryRouter>,
    );
    expect(await screen.findByText('No rules in this CrowdStrike account')).toBeTruthy();
    expect(screen.queryByText('No inventory yet')).toBeNull();
  });

  it('renders the six classification chips with counts', async () => {
    vi.spyOn(nativeSiemService, 'inventoryCounts').mockResolvedValue({
      not_in_library: 3,
      already_in_library: 1,
      archived_in_library: 2,
      match_needed: 1,
      unsupported: 1,
    });
    render(
      <MemoryRouter>
        <NativeRulesPanel integration={integrationFixture} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: 'All rules 8' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not in library 3' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Already in library 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Match needed 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Archived in library 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unsupported 1' })).toBeTruthy();
  });

  it('creates no detection and issues no write calls by rendering', async () => {
    const startInventory = vi.spyOn(nativeSiemService, 'startInventory');
    render(
      <MemoryRouter>
        <NativeRulesPanel integration={integrationFixture} />
      </MemoryRouter>,
    );
    await screen.findByText('No inventory yet');
    expect(startInventory).not.toHaveBeenCalled();
  });

  it('renders one page at a time regardless of inventory size', async () => {
    const inventoryPage = vi
      .spyOn(nativeSiemService, 'inventoryPage')
      .mockResolvedValue({ rows: rowsFixture(50), hasMore: true });
    vi.spyOn(nativeSiemService, 'inventoryCounts').mockResolvedValue({
      not_in_library: 2000,
      already_in_library: 0,
      archived_in_library: 0,
      match_needed: 0,
      unsupported: 0,
    });

    render(
      <MemoryRouter>
        <NativeRulesPanel integration={integrationFixture} />
      </MemoryRouter>,
    );

    await screen.findByText('Suspicious process 0');
    expect(screen.getAllByRole('row')).toHaveLength(51); // 50 rows + header
    expect(inventoryPage).toHaveBeenCalledWith(expect.objectContaining({ page: 0 }));
    // 2,000 rules in the account, one page in the browser.
    expect(inventoryPage).toHaveBeenCalledTimes(1);
  });

  it('asks the server for the next page instead of slicing a full download', async () => {
    const inventoryPage = vi
      .spyOn(nativeSiemService, 'inventoryPage')
      .mockResolvedValue({ rows: rowsFixture(50), hasMore: true });
    render(
      <MemoryRouter>
        <NativeRulesPanel integration={integrationFixture} />
      </MemoryRouter>,
    );
    await screen.findByText('Suspicious process 0');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(inventoryPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });
});

describe('NativeRulesPanel import submission', () => {
  it('submits explicit ids from a partial, incomplete inventory run', async () => {
    const partialRun = {
      id: 'run-partial',
      status: 'partial',
      phase: 'hydration',
      kind: 'inventory',
      discovery_complete: false,
      created_at: '2026-09-15T00:00:00Z',
      completed_at: null,
      heartbeat_at: null,
      error_message: null,
    };
    vi.spyOn(nativeSiemService, 'latestRun').mockImplementation(async (_integrationId, kinds) => {
      if (kinds.includes('import_selection')) return null;
      return partialRun;
    });
    vi.spyOn(nativeSiemService, 'inventoryPage').mockResolvedValue({ rows: rowsFixture(1), hasMore: false });
    vi.spyOn(nativeSiemService, 'inventoryCounts').mockResolvedValue({ ...ZERO_COUNTS, not_in_library: 1 });
    vi.spyOn(nativeSiemService, 'importResults').mockResolvedValue([]);
    const startImport = vi.spyOn(nativeSiemService, 'startImport').mockResolvedValue({
      id: 'import-1',
      status: 'queued',
      phase: 'hydration',
      kind: 'import_selection',
      created_at: '2026-09-15T00:00:00Z',
      completed_at: null,
      heartbeat_at: null,
      error_message: null,
    });

    render(
      <MemoryRouter>
        <NativeRulesPanel integration={integrationFixture} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Suspicious process 0' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import selected (1)' }));

    await vi.waitFor(() => expect(startImport).toHaveBeenCalled());
    expect(startImport).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRunId: 'run-partial',
        ids: ['vendor-0'],
      }),
    );
    expect(startImport.mock.calls[0][0].allMatching).toBeFalsy();
  });

  it('shows the fetch-first message and issues no import call when there is no inventory run at all', async () => {
    // Current production state for the one live connection: its catalog came from the Task 1
    // backfill, so latestRun(['inventory']) resolves null even though rows already exist.
    vi.spyOn(nativeSiemService, 'latestRun').mockResolvedValue(null);
    vi.spyOn(nativeSiemService, 'inventoryPage').mockResolvedValue({ rows: rowsFixture(1), hasMore: false });
    vi.spyOn(nativeSiemService, 'inventoryCounts').mockResolvedValue({ ...ZERO_COUNTS, not_in_library: 1 });
    const startImport = vi.spyOn(nativeSiemService, 'startImport');

    render(
      <MemoryRouter>
        <NativeRulesPanel integration={integrationFixture} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Suspicious process 0' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import selected (1)' }));

    expect(await screen.findByText('Fetch rules from CrowdStrike before importing')).toBeTruthy();
    expect(startImport).not.toHaveBeenCalled();
  });

  it('submits a completed inventory run id unchanged', async () => {
    const completeRun = {
      id: 'run-complete',
      status: 'complete',
      phase: 'complete',
      kind: 'inventory',
      discovery_complete: true,
      created_at: '2026-09-15T00:00:00Z',
      completed_at: '2026-09-15T00:05:00Z',
      heartbeat_at: null,
      error_message: null,
    };
    vi.spyOn(nativeSiemService, 'latestRun').mockImplementation(async (_integrationId, kinds) => {
      if (kinds.includes('import_selection')) return null;
      return completeRun;
    });
    vi.spyOn(nativeSiemService, 'inventoryPage').mockResolvedValue({ rows: rowsFixture(1), hasMore: false });
    vi.spyOn(nativeSiemService, 'inventoryCounts').mockResolvedValue({ ...ZERO_COUNTS, not_in_library: 1 });
    vi.spyOn(nativeSiemService, 'importResults').mockResolvedValue([]);
    const startImport = vi.spyOn(nativeSiemService, 'startImport').mockResolvedValue({
      id: 'import-2',
      status: 'queued',
      phase: 'hydration',
      kind: 'import_selection',
      created_at: '2026-09-15T00:00:00Z',
      completed_at: null,
      heartbeat_at: null,
      error_message: null,
    });

    render(
      <MemoryRouter>
        <NativeRulesPanel integration={integrationFixture} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Suspicious process 0' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import selected (1)' }));

    await vi.waitFor(() => expect(startImport).toHaveBeenCalled());
    expect(startImport).toHaveBeenCalledWith(expect.objectContaining({ sourceRunId: 'run-complete' }));
  });
});

describe('SiemLibraryBadge', () => {
  it('does not infer deployment from library status or hidden connection data', () => {
    render(
      <SiemLibraryBadge
        detection={
          {
            status: 'Production',
            native_provenance: {
              kind: 'native_siem',
              provider: 'crowdstrike',
              connection_name: 'Falcon',
              imported_at: '',
            },
          } as Detection
        }
      />,
    );
    expect(screen.getByText('CrowdStrike · Unknown')).toBeTruthy();
  });

  it('shows a Draft library rule as enabled when the SIEM observation says so', () => {
    render(
      <SiemLibraryBadge
        detection={
          {
            status: 'Draft',
            native_provenance: {
              kind: 'native_siem',
              provider: 'crowdstrike',
              connection_name: 'Falcon',
              imported_at: '',
            },
            siem_observations: [
              {
                binding_status: 'active',
                availability: 'present',
                observed_enabled: true,
                last_seen_at: '2026-09-14T10:00:00Z',
              },
            ],
          } as Detection
        }
      />,
    );
    expect(screen.getByText('CrowdStrike · Enabled')).toBeTruthy();
  });
});
