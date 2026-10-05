import { describe, it, expect, vi, afterEach } from 'vitest';
import { nativeSiemService } from '../nativeSiemService';
import { supabase } from '@/lib/supabaseClient';

const { state } = vi.hoisted(() => ({ state: { status: 'imported' } }));
function defaultFrom(table: string) {
  const response = () => ({
    error: null,
    data:
      table === 'siem_rule_bindings'
        ? [{ id: 'binding', vendor_rule_id: 'remote-id', detection: { id: 'library-copy' } }]
        : table === 'siem_rule_snapshots'
          ? []
          : table === 'siem_sync_items'
            ? [{ vendor_rule_id: 'remote-id', status: state.status, error_message: null }]
            : { id: 'latest-run', completed_at: '2026-09-15T00:00:00Z' },
  });
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    range: () => query,
    in: () => query,
    limit: () => query,
    maybeSingle: () => Promise.resolve(response()),
    then: (resolve: (result: ReturnType<typeof response>) => unknown) => Promise.resolve(response()).then(resolve),
  };
  return query;
}
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(defaultFrom),
    rpc: vi.fn(),
  },
}));

afterEach(() => {
  vi.mocked(supabase.from).mockImplementation(defaultFrom as never);
});

describe('inventory reads', () => {
  it('filters, pages and searches on the server', async () => {
    const range = vi.fn(() =>
      Promise.resolve({
        data: Array.from({ length: 51 }, (_, i) => ({ id: `row-${i}`, relationship: 'not_in_library' })),
        error: null,
      }),
    );
    const chain: { order: () => typeof chain; range: typeof range } = { order: () => chain, range };
    const or = vi.fn(() => chain);
    const eq = vi.fn(() => ({ eq: () => ({ or, ...chain }), or, ...chain }));
    vi.mocked(supabase.from).mockReturnValue({ select: () => ({ eq }) } as never);

    const page = await nativeSiemService.inventoryPage({
      integrationId: 'c',
      relationship: 'not_in_library',
      search: 'proc',
      page: 1,
      pageSize: 50,
    });

    expect(range).toHaveBeenCalledWith(50, 100);
    expect(page.rows).toHaveLength(50);
    expect(page.hasMore).toBe(true);
  });

  it('neutralises PostgREST filter metacharacters in search input', async () => {
    const range = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const chain: { order: () => typeof chain; range: typeof range } = { order: () => chain, range };
    const or = vi.fn((_filter: string) => chain);
    vi.mocked(supabase.from).mockReturnValue({
      select: () => ({ eq: () => ({ or, ...chain }) }),
    } as never);

    await nativeSiemService.inventoryPage({ integrationId: 'c', search: 'a,b)(c%' });

    const filter = or.mock.calls[0][0] as string;
    // The only ( ) , % left are the ones the two ilike clauses legitimately contain.
    expect(filter).toBe('display_name.ilike.%abc%,vendor_rule_id.ilike.%abc%');
  });
});

describe('saved per-rule import outcomes', () => {
  it.each(['imported', 'unchanged', 'changed', 'linked'])(
    'loads %s from the latest job rather than inferring it from library membership',
    async (status) => {
      state.status = status;
      const inventory = await nativeSiemService.inventory('connection');
      expect(inventory.rules[0].importResult).toBe(status);
      expect(inventory.counts[status]).toBe(1);
    },
  );
});
