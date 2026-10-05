import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilterPanel } from '../FilterPanel';
import type { FilterOptions } from '../../../hooks/useFilterOptions';

const EMPTY: FilterOptions = {
  technologies: [], log_sources: [], authors: [], platforms: [], tags: [],
  mitre_tactics: [], mitre_techniques: [], threat_actors: [], campaigns: [],
  software: [], cves: [], query_languages: [],
};

function renderPanel(query_languages: string[]) {
  render(
    <FilterPanel
      filters={{}}
      onChange={vi.fn()}
      filterOptions={{ ...EMPTY, query_languages }}
      filterOptionsLoading={false}
      libraryType="production"
      isOpen
      onToggle={vi.fn()}
      presets={[]}
      activePreset={null}
      onApplyPreset={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /Query Language/ }));
  // The group's rows follow its header; read the option labels in order.
  return () =>
    screen.getAllByRole('button')
      .map(b => b.textContent?.trim() ?? '')
      .filter(Boolean);
}

describe('Query Language filter options', () => {
  it('offers the curated vocabulary when the data adds nothing', () => {
    const options = renderPanel([]);

    expect(options()).toEqual(expect.arrayContaining(['SPL', 'KQL', 'YARA', 'YARA-L', 'CQL']));
  });

  it('appends values that exist in the data but not in the curated list', () => {
    // These were all actually stored and previously had no option at all, so their rules
    // could not be found through the filter.
    const options = renderPanel(['Splunk (SPL)', 'crowdstrike', 'yara', 'KQL']);

    for (const value of ['Splunk (SPL)', 'crowdstrike', 'yara']) {
      expect(options()).toContain(value);
    }
  });

  it('does not duplicate a stored value that is already curated', () => {
    const options = renderPanel(['KQL', 'SPL', 'YARA-L']);
    const labels = options();

    expect(labels.filter(l => l === 'KQL')).toHaveLength(1);
    expect(labels.filter(l => l === 'SPL')).toHaveLength(1);
    expect(labels.filter(l => l === 'YARA-L')).toHaveLength(1);
  });

  it('keeps the curated ordering, with stored extras after it', () => {
    const labels = renderPanel(['Splunk (SPL)'])();
    const curatedFirst = labels.indexOf('SPL');
    const extra = labels.indexOf('Splunk (SPL)');

    expect(curatedFirst).toBeGreaterThan(-1);
    expect(extra).toBeGreaterThan(curatedFirst);
  });

  it('lists YARA and YARA-L as separate options', () => {
    // Different languages: YARA is generic on-disk / VirusTotal scanning, YARA-L is Google
    // SecOps. Collapsing them in the filter would hide one behind the other.
    const labels = renderPanel(['YARA', 'YARA-L'])();

    expect(labels).toContain('YARA');
    expect(labels).toContain('YARA-L');
  });

  it('still renders when the RPC has not shipped query_languages yet', () => {
    // Older deployments return no such key; useFilterOptions defaults it to [].
    const options = renderPanel([]);

    expect(options()).toContain('SPL');
  });
});
