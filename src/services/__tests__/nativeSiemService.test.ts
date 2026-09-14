import { describe, it, expect, vi } from 'vitest';
import { nativeSiemService } from '../nativeSiemService';

const { state } = vi.hoisted(() => ({ state: { status: 'imported' } }));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
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
    },
  },
}));

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
