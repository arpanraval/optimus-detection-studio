import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyLibraryState } from '../UseCaseLibrary';
import { LIBRARY_DEVELOPMENT, LIBRARY_PRODUCTION } from '../../constants/library';

const renderState = (over: Partial<React.ComponentProps<typeof EmptyLibraryState>> = {}) => {
  const onClearFilters = vi.fn();
  render(
    <EmptyLibraryState
      libraryType={LIBRARY_PRODUCTION}
      isFiltered={false}
      canClearFilters={false}
      onClearFilters={onClearFilters}
      {...over}
    />
  );
  return onClearFilters;
};

describe('EmptyLibraryState', () => {
  it('says the library is empty only when nothing is filtering it', () => {
    renderState({ isFiltered: false });

    expect(screen.getByText('No rules yet')).toBeTruthy();
    expect(screen.getByText('Create your first detection.')).toBeTruthy();
  });

  it('says nothing matched when a filter is narrowing the list', () => {
    // The old copy keyed off the *filtered* page length, which is empty in both cases — so a
    // library of 11,689 rules whose filter matched nothing was told to create its first rule,
    // directly above a "Clear filters" link.
    renderState({ isFiltered: true, canClearFilters: true });

    expect(screen.getByText('No matching rules')).toBeTruthy();
    expect(screen.queryByText('Create your first detection.')).toBeNull();
  });

  it('offers to clear filters only when there is something clearable', () => {
    renderState({ isFiltered: true, canClearFilters: true });
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy();
  });

  it('hides the clear action for URL-only constraints that clearAll cannot clear', () => {
    renderState({ isFiltered: true, canClearFilters: false });

    expect(screen.getByText('No matching rules')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('never offers to clear filters on a genuinely empty library', () => {
    renderState({ isFiltered: false, canClearFilters: true });

    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('clears filters when asked', () => {
    const onClearFilters = renderState({ isFiltered: true, canClearFilters: true });

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onClearFilters).toHaveBeenCalled();
  });

  it('reserves height so the filter panel beside it is not squashed to a stub', () => {
    // It renders inside the content column; when that column collapsed to the height of a lone
    // select-all header, the collapsed filter rail shrank to an 80px floating pill.
    const { container } = render(
      <EmptyLibraryState
        libraryType={LIBRARY_DEVELOPMENT}
        isFiltered
        canClearFilters
        onClearFilters={vi.fn()}
      />
    );

    expect(container.firstElementChild?.className).toContain('min-h-[340px]');
  });
});
