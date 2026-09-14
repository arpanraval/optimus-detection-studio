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
