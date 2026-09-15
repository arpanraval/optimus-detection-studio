import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { ImportResultsPanel } from '../ImportResultsPanel';
import { routeHelpers } from '@/router/routes';
import type { NativeSyncRun, ImportResult } from '@/services/nativeSiemService';

const noop = () => {};

function run(overrides: Partial<NativeSyncRun>): NativeSyncRun {
  return {
    id: 'run-1',
    status: 'running',
    phase: 'hydration',
    kind: 'import_selection',
    created_at: '2026-09-15T00:00:00Z',
    completed_at: null,
    heartbeat_at: null,
    error_message: null,
    ...overrides,
  };
}

function renderPanel(props: {
  run: NativeSyncRun | null;
  results: ImportResult[];
  displayNames?: Record<string, string>;
  onCancel?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return render(
    <MemoryRouter>
      <ImportResultsPanel
        run={props.run}
        results={props.results}
        displayNames={props.displayNames ?? {}}
        onCancel={props.onCancel ?? noop}
        onRetry={props.onRetry ?? noop}
        onDismiss={props.onDismiss ?? noop}
      />
    </MemoryRouter>,
  );
}

function result(overrides: Partial<ImportResult>): ImportResult {
  return {
    vendor_rule_id: 'vendor-1',
    status: 'pending',
    error_message: null,
    detection_id: null,
    binding_id: null,
    ...overrides,
  };
}

describe('ImportResultsPanel', () => {
  it('renders progress copy and a stop button, with no retry button, while running', () => {
    const results = [
      result({ vendor_rule_id: 'v1', status: 'imported', detection_id: 'd1' }),
      result({ vendor_rule_id: 'v2', status: 'pending' }),
      result({ vendor_rule_id: 'v3', status: 'pending' }),
    ];
    renderPanel({ run: run({ status: 'running' }), results });
    expect(
      screen.getByText('Importing 1 of 3 rules. You can leave this page — the import continues.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop importing' })).toBeTruthy();
    expect(screen.queryByText(/^Retry /)).toBeNull();
  });

  it('renders the all-imported completion copy', () => {
    const results = Array.from({ length: 12 }, (_, i) =>
      result({ vendor_rule_id: `v${i}`, status: 'imported', detection_id: `d${i}` }),
    );
    renderPanel({ run: run({ status: 'complete', completed_at: '2026-09-15T00:05:00Z' }), results });
    expect(screen.getByText('Imported 12 rules into the Production Library.')).toBeTruthy();
  });

  it('shows a retry button sized to the failed count, and no retry when only changed_since_preview is present', () => {
    const partialResults = [
      result({ vendor_rule_id: 'v1', status: 'imported', detection_id: 'd1' }),
      result({ vendor_rule_id: 'v2', status: 'failed', error_message: 'boom' }),
      result({ vendor_rule_id: 'v3', status: 'failed', error_message: 'boom' }),
    ];
    const first = renderPanel({ run: run({ status: 'partial', completed_at: '2026-09-15T00:05:00Z' }), results: partialResults });
    expect(screen.getByRole('button', { name: 'Retry 2 failed' })).toBeTruthy();
    first.unmount();

    const changedResults = [
      result({ vendor_rule_id: 'v1', status: 'imported', detection_id: 'd1' }),
      result({ vendor_rule_id: 'v2', status: 'changed_since_preview' }),
    ];
    const { unmount } = renderPanel({
      run: run({ status: 'partial', completed_at: '2026-09-15T00:05:00Z' }),
      results: changedResults,
    });
    expect(screen.queryByRole('button', { name: /Retry \d+ failed/ })).toBeNull();
    expect(screen.getByText('Fetch rules again to review what changed.')).toBeTruthy();
    unmount();
  });

  it('links each imported row to the detection detail route', () => {
    const results = [result({ vendor_rule_id: 'v1', status: 'imported', detection_id: 'det-123' })];
    renderPanel({
      run: run({ status: 'complete', completed_at: '2026-09-15T00:05:00Z' }),
      results,
      displayNames: { v1: 'Suspicious process spawn' },
    });
    const link = screen.getByRole('link', { name: /Suspicious process spawn/ });
    expect(link.getAttribute('href')).toBe(routeHelpers.detectionDetail('det-123'));
  });

  it('shows IMPORT_OUTCOME_LABELS text and never "Already in library" for a linked outcome', () => {
    const results = [
      result({ vendor_rule_id: 'v1', status: 'linked', detection_id: 'det-1', binding_id: 'bind-1' }),
    ];
    renderPanel({
      run: run({ status: 'complete', completed_at: '2026-09-15T00:05:00Z' }),
      results,
      displayNames: { v1: 'Existing rule' },
    });
    expect(screen.getAllByText('Already present').length).toBeGreaterThan(0);
    expect(screen.queryByText('Already in library')).toBeNull();
  });

  it('states how many rules remain from a cancelled run', () => {
    const results = [
      result({ vendor_rule_id: 'v1', status: 'imported', detection_id: 'd1' }),
      result({ vendor_rule_id: 'v2', status: 'imported', detection_id: 'd2' }),
      result({ vendor_rule_id: 'v3', status: 'cancelled' }),
    ];
    renderPanel({ run: run({ status: 'cancelled', completed_at: '2026-09-15T00:05:00Z' }), results });
    expect(
      screen.getByText('Import cancelled. 2 rules were already imported and remain in your library.'),
    ).toBeTruthy();
  });

  it('shows the nothing-eligible copy when no rule can be imported', () => {
    const results = [result({ vendor_rule_id: 'v1', status: 'unsupported' })];
    renderPanel({ run: run({ status: 'complete', completed_at: '2026-09-15T00:05:00Z' }), results });
    expect(screen.getByText('None of the selected rules can be imported right now.')).toBeTruthy();
  });

  it('renders nothing when there is no run', () => {
    const { container } = renderPanel({ run: null, results: [] });
    expect(container.innerHTML).toBe('');
  });

  it('calls onCancel from the stop button and onRetry from the retry button', () => {
    const onCancel = vi.fn();
    renderPanel({ run: run({ status: 'running' }), results: [result({ vendor_rule_id: 'v1' })], onCancel });
    screen.getByRole('button', { name: 'Stop importing' }).click();
    expect(onCancel).toHaveBeenCalledTimes(1);

    const onRetry = vi.fn();
    renderPanel({
      run: run({ status: 'partial', completed_at: '2026-09-15T00:05:00Z' }),
      results: [result({ vendor_rule_id: 'v1', status: 'failed', error_message: 'x' })],
      onRetry,
    });
    screen.getByRole('button', { name: 'Retry 1 failed' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
