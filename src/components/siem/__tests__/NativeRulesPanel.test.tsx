import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { NativeRulesPanel } from '../NativeRulesPanel';
import { SiemLibraryBadge } from '../SiemLibraryBadge';
import type { Detection, Integration } from '@/types';

const { start, state } = vi.hoisted(() => ({ start: vi.fn(), state: { result: 'imported' } }));
vi.mock('@/hooks/useNativeSiemInventory', () => ({
  useNativeSiemInventory: () => ({
    loading: false,
    running: false,
    error: null,
    start,
    reload: vi.fn(),
    inventory: {
      counts: {},
      issues: [],
      run: null,
      rules: Array.from({ length: 125 }, (_, i) => ({
        id: String(i),
        detection_id: String(i),
        vendor_rule_id: `vendor-${i}`,
        binding_status: 'active',
        availability: 'present',
        observed_enabled: true,
        drift: 'in_sync',
        importResult: state.result,
        last_seen_at: '2026-09-14T10:00:00Z',
        detection: { name: `Rule ${i}`, status: 'Draft' },
      })),
    },
  }),
}));
vi.mock('../NativeRuleReview', () => ({
  NativeRuleReview: () => <div>Comparison detail</div>,
  NATIVE_DRIFT_LABELS: { in_sync: 'Matches CrowdStrike' },
}));

describe('Native SIEM inventory language and scale', () => {
  it('offers an explicit import and identifies newly imported rules in a large inventory', () => {
    render(
      <MemoryRouter>
        <NativeRulesPanel integration={{ id: 'connection', name: 'Falcon' } as Integration} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import rules from CrowdStrike' }));
    expect(start).toHaveBeenCalledOnce();
    expect(within(screen.getByRole('table')).getAllByText('Newly imported')).toHaveLength(50);
    expect(screen.queryByText('Already in library')).toBeNull();
    expect(screen.queryByText('Comparison detail')).toBeNull();
    expect(screen.getByText('1–50 of 125 rules')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('51–100 of 125 rules')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'View changes' })[0]);
    expect(within(screen.getByRole('dialog')).getByText('Comparison detail')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Needs attention 0' }));
    expect(screen.getByText('Nothing needs attention')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All rules 125' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search production rules' }), {
      target: { value: 'vendor-124' },
    });
    expect(screen.getByText('Rule 124')).toBeTruthy();
    expect(screen.getByText('1–1 of 1 rules')).toBeTruthy();
  });

  it('distinguishes a repeat import from a fresh import after deletion', () => {
    const view = render(
      <MemoryRouter>
        <NativeRulesPanel integration={{ id: 'connection' } as Integration} />
      </MemoryRouter>,
    );
    expect(within(screen.getByRole('table')).getAllByText('Newly imported')).toHaveLength(50);
    state.result = 'unchanged';
    view.rerender(
      <MemoryRouter>
        <NativeRulesPanel integration={{ id: 'connection' } as Integration} />
      </MemoryRouter>,
    );
    expect(screen.getAllByText('Already present · unchanged')).toHaveLength(50);
    expect(within(screen.getByRole('table')).queryByText('Newly imported')).toBeNull();
    state.result = 'imported';
    view.rerender(
      <MemoryRouter>
        <NativeRulesPanel integration={{ id: 'connection' } as Integration} />
      </MemoryRouter>,
    );
    expect(within(screen.getByRole('table')).getAllByText('Newly imported')).toHaveLength(50);
  });

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
