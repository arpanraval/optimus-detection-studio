import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Select } from '../Select';
import { Modal } from '../Modal';

const options = [
  { value: '', label: 'All severities' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium', disabled: true },
  { value: 'high', label: 'High' },
];

describe('Select', () => {
  it('supports controlled values, empty filters, and external updates', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Select label="Severity" value="high" options={options} onChange={onChange} />);
    const trigger = screen.getByRole('combobox', { name: 'Severity' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'All severities' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('');
    expect(trigger).toHaveTextContent('High');
    rerender(<Select label="Severity" value="" options={options} onChange={onChange} />);
    expect(trigger).toHaveTextContent('All severities');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('navigates without committing, skips disabled options, and commits with Enter', () => {
    const onChange = vi.fn();
    render(<Select label="Severity" defaultValue="low" options={options} onChange={onChange} />);
    const trigger = screen.getByRole('combobox');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'High' }).id);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('high');
    expect(trigger).toHaveTextContent('High');
    expect(trigger).toHaveFocus();
  });

  it('supports Home, End and typeahead and lets Tab leave without changing the value', () => {
    const onChange = vi.fn();
    render(<Select label="Severity" options={options} onChange={onChange} />);
    const trigger = screen.getByRole('combobox');
    fireEvent.keyDown(trigger, { key: 'End' });
    expect(trigger).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'High' }).id);
    fireEvent.keyDown(trigger, { key: 'Home' });
    expect(trigger).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'All severities' }).id);
    fireEvent.keyDown(trigger, { key: 'l' });
    expect(trigger).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Low' }).id);
    expect(fireEvent.keyDown(trigger, { key: 'Tab' })).toBe(true);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not open disabled controls or commit disabled options', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Select label="Severity" disabled options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    rerender(<Select label="Severity" options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Medium' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('portals out of clipped containers, displays groups, and dismisses on outside click', () => {
    const { container } = render(
      <div style={{ overflow: 'hidden' }}>
        <Select
          label="Platform"
          options={[
            { value: 'splunk', label: 'Splunk', group: 'SIEM' },
            { value: 'defender', label: 'Defender', group: 'EDR' },
          ]}
        />
      </div>,
    );
    fireEvent.click(screen.getByRole('combobox'));
    expect(container).not.toContainElement(screen.getByRole('listbox'));
    expect(screen.getByRole('option', { name: 'EDR: Defender' })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes only the menu on Escape inside a dialog and keeps focus on its trigger', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Edit rule" onClose={onClose}>
        <Select label="Severity" options={options} />
      </Modal>,
    );
    const trigger = screen.getByRole('combobox');
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('retains required validation, form data and uncontrolled form reset', () => {
    render(
      <form aria-label="Rule">
        <Select name="severity" label="Severity" required options={options} />
      </form>,
    );
    const form = screen.getByRole('form') as HTMLFormElement;
    act(() => {
      expect(form.checkValidity()).toBe(false);
    });
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveFocus();
    fireEvent.click(screen.getByRole('option', { name: 'High' }));
    expect(form.checkValidity()).toBe(true);
    expect(new FormData(form).get('severity')).toBe('high');
    fireEvent.reset(form);
    expect(trigger).toHaveTextContent('All severities');
    expect(new FormData(form).get('severity')).toBe('');
  });

  it('links external labels and helper text to the visible control', () => {
    render(
      <>
        <label htmlFor="platform">Platform</label>
        <p id="help">Select your SIEM</p>
        <Select id="platform" aria-describedby="help" helperText="Required for deployment" options={options} />
      </>,
    );
    expect(screen.getByRole('combobox', { name: 'Platform' })).toHaveAccessibleDescription(
      'Select your SIEM Required for deployment',
    );
  });

  it('opens above the trigger when the viewport has insufficient room below', () => {
    render(<Select label="Severity" options={options} />);
    const trigger = screen.getByRole('combobox');
    vi.spyOn(trigger.parentElement!, 'getBoundingClientRect').mockReturnValue({
      top: 700,
      bottom: 740,
      left: 40,
      right: 240,
      width: 200,
      height: 40,
      x: 40,
      y: 700,
      toJSON: () => ({}),
    });
    fireEvent.click(trigger);
    const menu = screen.getByRole('listbox');
    expect(menu.style.top).toBe('');
    expect(Number.parseFloat(menu.style.bottom)).toBe(window.innerHeight - 700 + 4);
    expect(menu.style.minWidth).toBe('200px');
  });

  it('gives compact menus room for labels and anchors them inside the right viewport edge', () => {
    render(
      <Select
        label="Group usage by"
        size="sm"
        defaultValue="model"
        options={[
          { value: 'feature', label: 'Feature' },
          { value: 'model', label: 'Model' },
          { value: 'category', label: 'Category' },
        ]}
      />,
    );
    const trigger = screen.getByRole('combobox');
    const right = window.innerWidth - 8;
    vi.spyOn(trigger.parentElement!, 'getBoundingClientRect').mockReturnValue({
      top: 40,
      bottom: 72,
      left: right - 90,
      right,
      width: 90,
      height: 32,
      x: right - 90,
      y: 40,
      toJSON: () => ({}),
    });
    fireEvent.click(trigger);
    const menu = screen.getByRole('listbox');
    expect(menu.style.minWidth).toBe('160px');
    expect(menu.style.width).toBe('max-content');
    expect(menu.style.left).toBe('');
    expect(menu.style.right).toBe('8px');
    fireEvent.click(screen.getByRole('option', { name: 'Category' }));
    expect(trigger).toHaveTextContent('Category');
  });
});
