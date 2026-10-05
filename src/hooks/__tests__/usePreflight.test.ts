import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreflight } from '../usePreflight';
import { integrationService } from '../../lib/integrationService';
import type { PreflightResult } from '../../types';

vi.mock('../../lib/integrationService', () => ({ integrationService: { runPreflight: vi.fn(), cancelPreflight: vi.fn() } }));
vi.mock('../../lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }));
const args = { detectionId: 'd', integrationId: 'old', provider: 'sentinel' as const, windowDays: 7 };
const response = { id: 'old-run', status: 'success' } as PreflightResult;

describe('pre-flight connection changes', () => {
  beforeEach(() => vi.clearAllMocks());
  it('does not display a late result after the selected integration is reset', async () => {
    let resolve!: (value: PreflightResult) => void;
    vi.mocked(integrationService.runPreflight).mockReturnValue(new Promise(r => { resolve = r; }));
    const { result } = renderHook(() => usePreflight());
    let pending!: Promise<PreflightResult | null>;
    act(() => { pending = result.current.run(args); });
    act(() => result.current.reset());
    await act(async () => { resolve(response); await pending; });
    expect(result.current.result).toBeNull();
    expect(result.current.loading).toBe(false);
  });
  it('does not let an earlier completion stop the current run', async () => {
    let resolveOld!: (value: PreflightResult) => void;
    let resolveNew!: (value: PreflightResult) => void;
    vi.mocked(integrationService.runPreflight)
      .mockReturnValueOnce(new Promise(r => { resolveOld = r; }))
      .mockReturnValueOnce(new Promise(r => { resolveNew = r; }));
    const { result } = renderHook(() => usePreflight());
    let oldRun!: Promise<PreflightResult | null>;
    let newRun!: Promise<PreflightResult | null>;
    act(() => { oldRun = result.current.run(args); });
    act(() => { newRun = result.current.run({ ...args, integrationId: 'new' }); });
    await act(async () => { resolveOld(response); await oldRun; });
    expect(result.current.loading).toBe(true);
    expect(result.current.result).toBeNull();
    await act(async () => { resolveNew({ ...response, id: 'new-run' }); await newRun; });
    expect(result.current.result?.id).toBe('new-run');
    expect(result.current.loading).toBe(false);
  });
});
