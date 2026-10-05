import React, { useState } from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ProviderRuleConfigForm } from '../ProviderRuleConfigForm';
import type { IntegrationProvider } from '../../../types';

function Form({ provider }: { provider: IntegrationProvider }) {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  return (
    <>
      <ProviderRuleConfigForm provider={provider} ruleConfig={config} onChange={setConfig} packMode />
      <output>{JSON.stringify(config)}</output>
    </>
  );
}

it('uses app dropdowns and derives Defender category without a shared category picker', () => {
  const { container } = render(<Form provider="defender_xdr" />);
  expect(container.querySelector('select')).toBeNull();
  expect(screen.getByText("From each detection's MITRE tactics")).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Daily' }));
  fireEvent.click(screen.getByRole('button', { name: 'Every 3 hours' }));
  expect(screen.getByRole('status')).toHaveTextContent('"frequency":"3H"');
  fireEvent.click(screen.getByRole('button', { name: "Use each detection's severity" }));
  fireEvent.click(screen.getByRole('button', { name: 'High' }));
  expect(screen.getByRole('status')).toHaveTextContent('"severity":"High"');
  expect(screen.getByRole('status')).not.toHaveTextContent('category');
});

it('keeps Sentinel lookback aligned when the custom frequency dropdown changes', () => {
  render(<Form provider="sentinel" />);
  fireEvent.click(screen.getByRole('button', { name: 'Every hour' }));
  fireEvent.click(screen.getByRole('button', { name: 'Every 12 hours' }));
  expect(screen.getByRole('status')).toHaveTextContent('"queryFrequency":"PT12H","queryPeriod":"P1D"');
});

it('captures the enable choice before React executes a deferred updater', () => {
  let update: ((value: Record<string, unknown>) => Record<string, unknown>) | undefined;
  render(
    <ProviderRuleConfigForm
      provider="sentinel"
      ruleConfig={{ enabled: false }}
      onChange={(value) => {
        update = value;
      }}
      packMode
    />,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Enable rule immediately after deployment' }));
  expect(update?.({ enabled: false }).enabled).toBe(true);
});
