import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase BEFORE importing the module under test — the real client throws
// at import time without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
vi.mock('../../../lib/supabaseClient', () => {
  const chain: Record<string, any> = {};
  chain.from = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.update = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.single = vi.fn(() => Promise.resolve({ data: { id: 'det', name: 'Det', vendor_metadata: {} }, error: null }));
  return { supabase: chain };
});

vi.mock('../../bulk-import/parsers/ParserFactory', () => ({
  parserFactory: {
    initialize: vi.fn(async () => {}),
    parse: vi.fn(),
  },
}));

vi.mock('../../bulk-import/validators/DuplicateDetector', () => ({
  duplicateDetector: { compareFields: vi.fn(() => []) },
}));

vi.mock('../../../lib/audit/auditLogger', () => ({
  logAuditEvent: vi.fn(async () => {}),
}));

vi.mock('../../../lib/quality/scoringEngine', () => ({
  scoreDetection: vi.fn(() => ({ score: 0 })),
}));

vi.mock('../driftService', () => ({
  // bulkKeepMine doesn't call getDriftForDetection directly, but keepMine does.
  getDriftForDetection: vi.fn(async (id: string) => ({
    detection_id: id,
    drift_state: 'conflict',
    upstream_raw_snapshot: '{"sourceFormat":"sigma","query":"q"}',
    upstream_hash: 'uh',
    external_id: id,
    source_url: 'https://github.com/x/y',
    upstream_path: 'rules/x.yml',
  })),
}));

import { bulkKeepMine, bulkApplyUpstream } from '../driftMutations';
import * as service from '../driftService';

describe('bulkKeepMine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns per-id success/failure outcomes', async () => {
    // Even with mocks above, keepMine still hits supabase under the hood;
    // since the mocked chain returns no error, all should succeed.
    const result = await bulkKeepMine(['det-1', 'det-2', 'det-3'], { actorId: 'user-1' });
    expect(result.succeeded.length + result.failed.length).toBe(3);
    expect([...result.succeeded, ...result.failed.map((f) => f.detectionId)].sort()).toEqual(['det-1', 'det-2', 'det-3']);
  });

  it('continues past per-id failures (does not throw)', async () => {
    // Force getDriftForDetection to throw for one id.
    let n = 0;
    (service.getDriftForDetection as unknown as { mockImplementation: (fn: any) => void }).mockImplementation(async (id: string) => {
      n++;
      if (id === 'det-2') throw new Error('boom');
      return { detection_id: id, drift_state: 'conflict', upstream_raw_snapshot: '{"q":1}', upstream_hash: 'h', external_id: id, source_url: 'u', upstream_path: 'p' };
    });
    const result = await bulkKeepMine(['det-1', 'det-2', 'det-3'], { actorId: 'user-1' });
    expect(n).toBeGreaterThanOrEqual(3);
    expect(result.failed.find((f) => f.detectionId === 'det-2')).toBeTruthy();
    expect(result.succeeded).not.toContain('det-2');
  });

  it('exposes the same shape as bulkApplyUpstream (BulkResult)', async () => {
    const r1 = await bulkKeepMine([], { actorId: 'u' });
    const r2 = await bulkApplyUpstream([], { actorId: 'u' });
    expect(Object.keys(r1).sort()).toEqual(Object.keys(r2).sort());
  });
});
