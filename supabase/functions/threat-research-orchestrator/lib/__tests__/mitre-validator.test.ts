import { describe, it, expect } from 'vitest';
import { runMitreValidator } from '../validators/mitre-validator';

/** Minimal fake matching the .from().select().in() chain
 *  lib/mitre-validator.ts's bare functions expect. Both calls (id lookup,
 *  tactics lookup) hit the same table; returning every known field on every
 *  row is harmless since each caller only reads the columns it needs. */
function fakeSupabase(known: Array<{ mitre_id: string; tactics: string[] }>) {
  return {
    from: () => ({
      select: () => ({
        in: async (_col: string, ids: string[]) => ({
          data: known.filter(k => ids.includes(k.mitre_id)),
          error: null,
        }),
      }),
    }),
  } as any;
}

describe('runMitreValidator', () => {
  it('returns null when there are no MITRE IDs to check', async () => {
    const result = await runMitreValidator(fakeSupabase([]), [], 'execution');
    expect(result).toBeNull();
  });

  it('returns null when all IDs are verified and tactic-consistent', async () => {
    const known = [{ mitre_id: 'T1218.005', tactics: ['defense-evasion'] }];
    const result = await runMitreValidator(fakeSupabase(known), ['T1218.005'], 'defense-evasion');
    expect(result).toBeNull();
  });

  it('flags a hallucinated MITRE ID not in the canonical catalog', async () => {
    const known = [{ mitre_id: 'T1218.005', tactics: ['defense-evasion'] }];
    const result = await runMitreValidator(fakeSupabase(known), ['T1218.005', 'T9999.999'], 'defense-evasion');
    expect(result).toContain('T9999.999');
    expect(result).toContain('unverified');
  });

  it("flags a verified technique whose canonical tactic doesn't match the detection's tactic", async () => {
    const known = [{ mitre_id: 'T1598.003', tactics: ['reconnaissance'] }];
    const result = await runMitreValidator(fakeSupabase(known), ['T1598.003'], 'initial-access');
    expect(result).toContain('T1598.003');
    expect(result).toContain("doesn't match");
  });

  it('does not tactic-check an unverified ID (already reported separately)', async () => {
    const known: Array<{ mitre_id: string; tactics: string[] }> = [];
    const result = await runMitreValidator(fakeSupabase(known), ['T9999.999'], 'initial-access');
    expect(result).toContain('unverified');
    expect(result).not.toContain("doesn't match");
  });
});
