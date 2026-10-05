import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilterCheckboxGroup } from '../FilterCheckboxGroup';
import { EMPTY_FILTER_VALUE } from '../../../constants/filters';

const OPTIONS = ['Defense Evasion', 'Execution', 'Persistence'];

function renderGroup(selected: string[] = [], showEmptyOption = true) {
  const onChange = vi.fn();
  render(
    <FilterCheckboxGroup
      label="MITRE Tactics"
      field="mitreTactics"
      options={OPTIONS}
      selected={selected}
      onChange={onChange}
      showEmptyOption={showEmptyOption}
    />
  );
  // Groups start collapsed.
  fireEvent.click(screen.getByRole('button', { name: /MITRE Tactics/ }));
  return onChange;
}

describe('FilterCheckboxGroup "(None)" option', () => {
  it('offers "(None)" above the values when the field supports it', () => {
    renderGroup();
    expect(screen.getByText('(None)')).toBeTruthy();
  });

  it('is not offered for fields that cannot be empty', () => {
    renderGroup([], false);
    expect(screen.queryByText('(None)')).toBeNull();
  });

  it('selecting "(None)" replaces any chosen values', () => {
    const onChange = renderGroup(['Defense Evasion', 'Execution']);

    fireEvent.click(screen.getByText('(None)'));

    expect(onChange).toHaveBeenCalledWith('mitreTactics', [EMPTY_FILTER_VALUE]);
  });

  it('choosing a value clears "(None)" rather than combining them', () => {
    // "no tactics OR Defense Evasion" is not a question anyone asks, and keeping the two apart
    // is what lets the server builder avoid mixing an emptiness check with a value list.
    const onChange = renderGroup([EMPTY_FILTER_VALUE]);

    fireEvent.click(screen.getByText('Defense Evasion'));

    expect(onChange).toHaveBeenCalledWith('mitreTactics', ['Defense Evasion']);
  });

  it('clicking "(None)" again clears the field', () => {
    const onChange = renderGroup([EMPTY_FILTER_VALUE]);

    fireEvent.click(screen.getByText('(None)'));

    expect(onChange).toHaveBeenCalledWith('mitreTactics', []);
  });

  it('adds to an existing value selection as before', () => {
    const onChange = renderGroup(['Defense Evasion']);

    fireEvent.click(screen.getByText('Execution'));

    expect(onChange).toHaveBeenCalledWith('mitreTactics', ['Defense Evasion', 'Execution']);
  });
});
