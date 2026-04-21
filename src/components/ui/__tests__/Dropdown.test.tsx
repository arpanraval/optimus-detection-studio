import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Dropdown } from '../Dropdown';

function Harness({ initial }: { initial?: string }) {
  const [value, setValue] = useState<string | undefined>(initial);
  return (
    <Dropdown
      triggerIcon="systems"
      placeholder="All Platforms"
      options={[
        { value: 'windows', label: 'Windows' },
        { value: 'linux', label: 'Linux' },
        { value: 'macos', label: 'macOS' },
      ]}
      value={value}
      onChange={setValue}
      includeAllOption={{ label: 'All Platforms' }}
    />
  );
}

describe('Dropdown', () => {
  it('shows placeholder when no value is selected', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /all platforms/i })).toBeInTheDocument();
  });

  it('opens the panel on trigger click and renders options', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /all platforms/i }));
    expect(screen.getByRole('button', { name: /^windows$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^linux$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^macos$/i })).toBeInTheDocument();
  });

  it('calls onChange with the selected value and closes the panel', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /all platforms/i }));
    fireEvent.click(screen.getByRole('button', { name: /^linux$/i }));
    expect(screen.getByRole('button', { name: /^linux$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^windows$/i })).not.toBeInTheDocument();
  });

  it('calls onChange(undefined) when the All row is selected', () => {
    render(<Harness initial="linux" />);
    fireEvent.click(screen.getByRole('button', { name: /^linux$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^all platforms$/i }));
    expect(screen.getByRole('button', { name: /all platforms/i })).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /all platforms/i }));
    expect(screen.getByRole('button', { name: /^windows$/i })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: /^windows$/i })).not.toBeInTheDocument();
  });

  it('filters options via search input when searchable', () => {
    function SearchableHarness() {
      const [v, setV] = useState<string | undefined>();
      return (
        <Dropdown
          triggerIcon="systems"
          placeholder="Pick"
          searchable
          options={[
            { value: 'windows', label: 'Windows' },
            { value: 'linux', label: 'Linux' },
            { value: 'macos', label: 'macOS' },
          ]}
          value={v}
          onChange={setV}
        />
      );
    }
    render(<SearchableHarness />);
    fireEvent.click(screen.getByRole('button', { name: /pick/i }));
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'lin' } });
    expect(screen.getByRole('button', { name: /^linux$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^windows$/i })).not.toBeInTheDocument();
  });
});
