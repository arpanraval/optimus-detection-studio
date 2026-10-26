import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoDigestSettings } from '../useAutoDigestSettings';

const mocks = vi.hoisted(() => ({
  role: 'viewer',
  team: 'pipeline-owner' as string | null,
  failTable: '',
  queries: [] as { table: string; filters: Record<string, unknown>; operation: string; payload?: unknown }[],
  invoke: vi.fn(),
  rpc: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('../../context/PermissionsContext', () => ({
  usePermissions: () => ({ isLoading: false, hasRoleOrHigher: () => ['owner', 'admin'].includes(mocks.role) }),
}));
vi.mock('../useToast', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    rpc: mocks.rpc,
    from: (table: string) => {
      const record = { table, filters: {} as Record<string, unknown>, operation: 'select', payload: undefined as unknown };
      mocks.queries.push(record);
      const result = () => {
        if (mocks.failTable === table) return { data: null, error: { message: 'Permission denied' } };
        if (table === 'auto_digest_team') {
          if (record.operation === 'upsert') mocks.team = (record.payload as { user_id: string }).user_id;
          return { data: mocks.team ? { user_id: mocks.team } : null, error: null };
        }
        const data = table === 'auto_digest_settings' ? { user_id: mocks.team, is_enabled: true }
          : table === 'auto_digest_jobs' ? [{ id: 'shared-run', user_id: mocks.team, status: 'completed' }]
          : table === 'threat_intel_feeds' ? [{ id: 'shared-feed', curated_source_id: 'source-1' }] : [];
        return { data, error: null };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { record.filters[key] = value; return query; },
        not: () => query, is: () => query, order: () => query, limit: () => query,
        maybeSingle: () => Promise.resolve(result()), single: () => Promise.resolve(result()),
        insert: (payload: unknown) => { record.operation = 'insert'; record.payload = payload; return query; },
        upsert: (payload: unknown) => { record.operation = 'upsert'; record.payload = payload; return query; },
        update: (payload: unknown) => { record.operation = 'update'; record.payload = payload; return query; },
        delete: () => { record.operation = 'delete'; return query; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  },
}));

beforeEach(() => {
  mocks.role = 'viewer'; mocks.team = 'pipeline-owner'; mocks.failTable = ''; mocks.queries = [];
  vi.clearAllMocks();
});

describe('shared team auto digest', () => {
  it.each(['viewer', 'analyst', 'lead', 'admin', 'owner'])('loads the existing pipeline for a %s', async (role) => {
    mocks.role = role;
    const { result } = renderHook(() => useAutoDigestSettings('other-user'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.teamUserId).toBe('pipeline-owner');
    expect(result.current.settings?.is_enabled).toBe(true);
    expect(result.current.enabledSourceIds.has('source-1')).toBe(true);
    expect(result.current.recentJobs[0].id).toBe('shared-run');
    expect(mocks.queries.filter(q => ['auto_digest_settings', 'auto_digest_jobs', 'threat_intel_feeds'].includes(q.table))
      .every(q => q.filters.user_id === 'pipeline-owner')).toBe(true);
    expect(result.current.canManage).toBe(['owner', 'admin'].includes(role));
  });

  it.each(['viewer', 'analyst', 'lead'])('blocks all pipeline mutations for a %s', async (role) => {
    mocks.role = role;
    const { result } = renderHook(() => useAutoDigestSettings('other-user'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mocks.queries = [];
    await act(async () => {
      await result.current.saveSettings({ is_enabled: false });
      await result.current.addCustomFeed({ name: 'source', url: 'https://example.com/feed', feedType: 'rss' });
      await result.current.removeCustomFeed('shared-feed');
      await result.current.toggleCustomFeed('shared-feed', false);
      await result.current.toggleSource({ id: 'source-1' } as never, false);
      await result.current.triggerManualRun();
      await result.current.cancelJob('shared-run');
    });
    expect(mocks.queries).toEqual([]);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('saves admin changes under the pipeline identity', async () => {
    mocks.role = 'admin';
    const { result } = renderHook(() => useAutoDigestSettings('other-admin'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.saveSettings({ is_enabled: false }); });
    expect(mocks.queries.find(q => q.table === 'auto_digest_settings' && q.operation === 'upsert')?.payload)
      .toMatchObject({ user_id: 'pipeline-owner', is_enabled: false });
  });

  it('shows an error instead of treating failed reads as missing configuration', async () => {
    mocks.failTable = 'auto_digest_jobs';
    const { result } = renderHook(() => useAutoDigestSettings('other-user'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toMatch(/Unable to load/);
  });

  it('does not initialize a personal pipeline for a member', async () => {
    mocks.team = null;
    const { result } = renderHook(() => useAutoDigestSettings('other-user'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.teamUserId).toBe('');
    expect(mocks.queries.every(q => q.operation === 'select')).toBe(true);
  });

  it('allows the first admin to initialize the team identity', async () => {
    mocks.team = null; mocks.role = 'admin';
    const { result } = renderHook(() => useAutoDigestSettings('first-admin'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.teamUserId).toBe('first-admin');
  });
});
