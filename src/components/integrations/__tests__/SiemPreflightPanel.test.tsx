import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SiemPreflightPanel } from '../SiemPreflightPanel';
import type { Detection } from '../../../types';

const mocks = vi.hoisted(() => ({ list: vi.fn(), run: vi.fn(), reset: vi.fn() }));
vi.mock('../../../lib/integrationService', () => ({ integrationService: { listIntegrations: mocks.list } }));
vi.mock('../../../hooks/usePreflight', () => ({ usePreflight: () => ({ run: mocks.run, reset: mocks.reset,
  cancel: vi.fn(), loading: false, result: null, error: null }) }));
vi.mock('../SiemPreflightCharts', () => ({ PreflightTimeChart: () => null, PreflightEntityChart: () => null }));
vi.mock('../SiemFinetuneModal', () => ({ SiemFinetuneModal: () => null }));
vi.mock('../CrowdStrikeFinetuneModal', () => ({ CrowdStrikeFinetuneModal: () => null }));
const detection = { id: 'd1', name: 'Defender rule', queries: [{ id: 'q1', language: 'KQL', query: 'DeviceEvents' }],
  siem_observations: [{ id: 'b1', integration_id: 'defender', selected_query_id: 'q1', binding_status: 'active' }],
} as Detection;

describe('pre-flight integration selection', () => {
  beforeEach(() => vi.clearAllMocks());
  it('keeps a bound Defender connection visible while testing instead of selecting Sentinel', async () => {
    mocks.list.mockResolvedValue([
      { id: 'sentinel', provider: 'sentinel', name: 'Sentinel production', status: 'connected' },
      { id: 'defender', provider: 'defender_xdr', name: 'Defender production', status: 'testing' },
    ]);
    render(<MemoryRouter><SiemPreflightPanel detection={detection} mode="standalone" /></MemoryRouter>);
    expect((await screen.findByRole('alert')).textContent).toContain('Defender production is marked testing');
    expect((screen.getByRole('button', { name: 'Run pre-flight' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/KQL against Defender Advanced Hunting/)).toBeTruthy();
  });
  it('defaults to the bound Defender connection when both Microsoft connections are connected', async () => {
    mocks.list.mockResolvedValue([
      { id: 'sentinel', provider: 'sentinel', name: 'Sentinel production', status: 'connected' },
      { id: 'defender', provider: 'defender_xdr', name: 'Defender production', status: 'connected' },
    ]);
    render(<MemoryRouter><SiemPreflightPanel detection={detection} mode="standalone" /></MemoryRouter>);
    expect(await screen.findByText(/Defender production - Microsoft Defender XDR/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Run pre-flight' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
