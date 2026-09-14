import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InventorySelectionBar } from '../InventorySelectionBar';

const noop = () => {};

describe('InventorySelectionBar', () => {
  it('does not render when nothing is selected', () => {
    const { container } = render(
      <InventorySelectionBar
        selectedCount={0}
        eligibleTotal={500}
        canSelectAllMatching={true}
        discoveryComplete={true}
        clearedByFilterChange={false}
        onSelectAllMatching={noop}
        onClear={noop}
        onSubmit={noop}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows the exact selected count in the primary button', () => {
    render(
      <InventorySelectionBar
        selectedCount={12}
        eligibleTotal={500}
        canSelectAllMatching={true}
        discoveryComplete={true}
        clearedByFilterChange={false}
        onSelectAllMatching={noop}
        onClear={noop}
        onSubmit={noop}
      />,
    );
    expect(screen.getAllByText('Import selected (12)').length).toBeGreaterThan(0);
  });

  it('shows the all-matching-minus-exclusions count', () => {
    render(
      <InventorySelectionBar
        selectedCount={497}
        eligibleTotal={500}
        canSelectAllMatching={true}
        discoveryComplete={true}
        clearedByFilterChange={false}
        onSelectAllMatching={noop}
        onClear={noop}
        onSubmit={noop}
      />,
    );
    expect(screen.getAllByText('Import selected (497)').length).toBeGreaterThan(0);
  });

  it('always names the destination', () => {
    render(
      <InventorySelectionBar
        selectedCount={3}
        eligibleTotal={500}
        canSelectAllMatching={true}
        discoveryComplete={true}
        clearedByFilterChange={false}
        onSelectAllMatching={noop}
        onClear={noop}
        onSubmit={noop}
      />,
    );
    expect(
      screen.getAllByText('Imported rules are added to the shared Production Library as unreviewed drafts.').length,
    ).toBeGreaterThan(0);
  });

  it('hides the span-pages action and shows the partial-discovery note when discovery is incomplete', () => {
    render(
      <InventorySelectionBar
        selectedCount={3}
        eligibleTotal={500}
        canSelectAllMatching={false}
        discoveryComplete={false}
        clearedByFilterChange={false}
        onSelectAllMatching={noop}
        onClear={noop}
        onSubmit={noop}
      />,
    );
    expect(screen.queryByText(/Select all \d+ matching rules/)).toBeNull();
    expect(
      screen.getAllByText('Still checking CrowdStrike. You can import the rules found so far.').length,
    ).toBeGreaterThan(0);
  });

  it('shows the span-pages action when eligible for it', () => {
    render(
      <InventorySelectionBar
        selectedCount={3}
        eligibleTotal={500}
        canSelectAllMatching={true}
        discoveryComplete={true}
        clearedByFilterChange={false}
        onSelectAllMatching={noop}
        onClear={noop}
        onSubmit={noop}
      />,
    );
    expect(screen.getAllByText('Select all 500 matching rules').length).toBeGreaterThan(0);
  });

  it('shows the filter-clear note after a filter-driven clear', () => {
    render(
      <InventorySelectionBar
        selectedCount={0}
        eligibleTotal={500}
        canSelectAllMatching={true}
        discoveryComplete={true}
        clearedByFilterChange={true}
        onSelectAllMatching={noop}
        onClear={noop}
        onSubmit={noop}
      />,
    );
    expect(screen.getAllByText('Selection cleared because the filter changed.').length).toBeGreaterThan(0);
  });

  it('disables the submit control with the deliberate not-wired-up reason', () => {
    render(
      <InventorySelectionBar
        selectedCount={12}
        eligibleTotal={500}
        canSelectAllMatching={true}
        discoveryComplete={true}
        clearedByFilterChange={false}
        onSelectAllMatching={noop}
        onClear={noop}
        onSubmit={vi.fn()}
      />,
    );
    const button = screen.getByText('Import selected (12)').closest('button');
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute('title')).toBe('Importing is not wired up yet');
  });
});
