import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withSiemLibraryState } from '../siemLibraryState';
import type { Detection } from '@/types';

const bindingRows = [
  { id: 'b1', integration_id: 'i1', vendor_rule_id: 'v1', detection_id: 'd1', binding_status: 'active', availability: 'present', observed_enabled: true, last_seen_at: '2026-09-15T00:00:00Z' },
];

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => {
      const query = {
        select: () => query,
        in: () => Promise.resolve({ data: bindingRows, error: null }),
      };
      return query;
    }),
  },
}));

function detection(id: string): Detection {
  return { id } as Detection;
}

describe('withSiemLibraryState', () => {
  it('attaches siem_observations for a detection with an active binding', async () => {
    const [withState] = await withSiemLibraryState([detection('d1')]);
    expect((withState as unknown as { siem_observations: unknown[] }).siem_observations).toEqual(bindingRows);
  });

  it('attaches an empty array for a detection with no bindings', async () => {
    const [withState] = await withSiemLibraryState([detection('unrelated')]);
    expect((withState as unknown as { siem_observations: unknown[] }).siem_observations).toEqual([]);
  });
});

// C1 regression guard: the detail route's fetch must run its result through
// withSiemLibraryState before rendering, or the Deploy modal's binding lookup on
// /library/detections/:id is always undefined (siem_observations is not a DB column,
// so a plain `select('*')` never carries it) and the bound native-deploy path is
// unreachable from the page users actually deploy from.
describe('DetectionDetailPage route wiring', () => {
  const source = readFileSync(
    resolve(__dirname, '../../router/pages/DetectionDetailPage.tsx'),
    'utf8'
  );

  it('imports withSiemLibraryState', () => {
    expect(source).toContain("import { withSiemLibraryState } from '../../lib/siemLibraryState'");
  });

  it('runs the fetched detection through withSiemLibraryState before setDetection', () => {
    expect(source).toMatch(/withSiemLibraryState\(\[sanitizeDetection\(data\)\]\)/);
  });
});
