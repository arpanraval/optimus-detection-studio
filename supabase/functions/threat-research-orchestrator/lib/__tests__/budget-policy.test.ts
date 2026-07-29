// supabase/functions/threat-research-orchestrator/lib/__tests__/budget-policy.test.ts

import { describe, it, expect } from 'vitest';
import {
  sizeAfterResearch,
  sizeAfterPlanning,
  estimateCallTokens,
  SESSION_TOKEN_CEILING,
  MAX_BUDGETED_BEHAVIOURS,
  MAX_BUDGETED_OPPORTUNITIES,
} from '../budget-policy.ts';

describe('phase budget sizing', () => {
  it('reserves detection and qa before the planner has run', () => {
    // The whole point of sizing at research time: if detection and qa had no
    // floor until planning, research and attack_research could spend the
    // budget first. That is the shape of the 199 recorded "model-call budget
    // exhausted" failures.
    const budgets = sizeAfterResearch(8);
    expect(budgets.perPhase.detection).toBeGreaterThan(0);
    expect(budgets.perPhase.qa).toBeGreaterThan(0);
  });

  it('scales attack_research with behaviours and detection with opportunities', () => {
    const small = sizeAfterPlanning(4, 3);
    const large = sizeAfterPlanning(16, 12);
    expect(large.perPhase.attack_research).toBeGreaterThan(small.perPhase.attack_research);
    expect(large.perPhase.detection).toBeGreaterThan(small.perPhase.detection);
    // Research and planning are singleton jobs; their cost does not scale.
    expect(large.perPhase.research).toBe(small.perPhase.research);
    expect(large.perPhase.opportunity_planning).toBe(small.perPhase.opportunity_planning);
  });

  it('keeps the session cap at or above the sum of the floors', () => {
    // A ceiling below the floors would make the guarantees meaningless.
    for (const [b, o] of [[1, 1], [8, 5], [16, 12], [30, 40]] as const) {
      const { tokenCap, perPhase } = sizeAfterPlanning(b, o);
      const floorSum = Object.values(perPhase).reduce((a, x) => a + x, 0);
      expect(tokenCap).toBeGreaterThanOrEqual(floorSum);
    }
  });

  it('never exceeds the runaway ceiling', () => {
    // bc5804b3 spent 1.17M tokens across a 9.5-hour resume loop. That shape
    // is what the ceiling exists to stop.
    const huge = sizeAfterPlanning(10_000, 10_000);
    expect(huge.tokenCap).toBeLessThanOrEqual(SESSION_TOKEN_CEILING);
  });

  it('scales floors down and flags the session when the work exceeds the ceiling', () => {
    // A max fan-out wants ~3.5M tokens against a 2M ceiling. Raising the
    // ceiling would defeat it; leaving floors above it would make them
    // meaningless exactly where starvation happens. Scaling keeps detection
    // and qa's SHARE intact and marks the session capacity-limited.
    const maxed = sizeAfterPlanning(MAX_BUDGETED_BEHAVIOURS, MAX_BUDGETED_OPPORTUNITIES);
    expect(maxed.capped).toBe(true);

    const floorSum = Object.values(maxed.perPhase).reduce((a, x) => a + x, 0);
    expect(floorSum).toBeLessThanOrEqual(maxed.tokenCap);

    // Relative share preserved: detection still gets more than qa, in the same
    // proportion as the unscaled sizing.
    const unscaled = sizeAfterPlanning(4, 3);
    const ratio = (b: { detection: number; qa: number }) => b.detection / b.qa;
    expect(ratio(maxed.perPhase)).toBeCloseTo(ratio(unscaled.perPhase), 1);
  });

  it('does not flag a normal session as capacity-limited', () => {
    // Every session actually observed in production is well inside the
    // ceiling; the flag must mean something when it appears.
    for (const [b, o] of [[8, 5], [9, 7], [11, 11], [16, 12]] as const) {
      expect(sizeAfterPlanning(b, o).capped).toBe(false);
    }
  });

  it('funds a healthy session generously but bounds a runaway', () => {
    // Measured: a healthy 8-behaviour session runs 270-330K tokens. The two
    // pathological runs -- bc5804b3 at 1.17M across 4.2 hours with six QA
    // errors, ce6be6cf at 1.69M in the old multi-round-QA era -- are exactly
    // what a token cap exists to stop.
    const healthy = sizeAfterPlanning(8, 5);
    expect(healthy.tokenCap).toBeGreaterThan(330_000);   // real headroom
    expect(healthy.tokenCap).toBeLessThan(1_175_033);    // but bounds bc5804b3
  });

  it('clamps absurd or malformed counts instead of trusting them', () => {
    const clamped = sizeAfterPlanning(10_000, 10_000);
    const atMax = sizeAfterPlanning(MAX_BUDGETED_BEHAVIOURS, MAX_BUDGETED_OPPORTUNITIES);
    expect(clamped).toEqual(atMax);

    expect(() => sizeAfterResearch(NaN)).not.toThrow();
    expect(sizeAfterResearch(NaN).perPhase.attack_research).toBe(
      sizeAfterResearch(1).perPhase.attack_research,
    );
    expect(sizeAfterPlanning(0, 0).perPhase.detection).toBeGreaterThan(0);
  });

  it('estimates opportunities generously before planning', () => {
    // Measured planner behaviour: 8 behaviours -> 3, 5 or 6 opportunities;
    // 9 -> 7. Rounding up is the safe direction, because an under-reserved
    // detection phase is exactly the failure being fixed.
    const estimated = sizeAfterResearch(9);
    const actualLow = sizeAfterPlanning(9, 3);
    expect(estimated.perPhase.detection).toBeGreaterThan(actualLow.perPhase.detection);
  });

  it('re-sizing after planning can raise a floor', () => {
    // tr_set_phase_budgets only ever raises, so an estimate that undershot is
    // recoverable while one that overshot cannot retroactively starve a phase.
    const estimated = sizeAfterResearch(6);   // ~4 opportunities estimated
    const planned = sizeAfterPlanning(6, 10); // planner produced more
    expect(planned.perPhase.detection).toBeGreaterThan(estimated.perPhase.detection);
  });
});

describe('estimateCallTokens', () => {
  it('reserves the full output ceiling plus an input estimate', () => {
    // Over-reserving costs a leaf that might have squeaked through;
    // under-reserving costs real money. High is the cheaper error.
    expect(estimateCallTokens(4_000, 8_192)).toBe(1_000 + 8_192);
  });

  it('is dominated by max_tokens for a small prompt', () => {
    expect(estimateCallTokens(0, 16_384)).toBe(16_384);
  });
});
