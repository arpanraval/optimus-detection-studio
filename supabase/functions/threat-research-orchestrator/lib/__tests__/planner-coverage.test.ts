// supabase/functions/threat-research-orchestrator/lib/__tests__/planner-coverage.test.ts
//
// The planner validator required only ONE valid opportunity. Any behaviour it
// happened to leave out was then stamped `not_detectable` with "Opportunity
// planner did not produce a detection opportunity for this behaviour" — which
// reads as a judgement and is actually the absence of one.
//
// For the six MSHTA surfaces or the four AdFind primitives, that is precisely
// how real detections vanish without anyone deciding they should.
//
// The validator is not exported (it is closed over by runOpportunityPlanner),
// so these drive it through the exported config the agent loop uses.

import { describe, it, expect } from 'vitest';
import { buildPlannerValidator, salvagePartialPlan } from '../agents/opportunity-planner.ts';

const BEHAVIOURS = ['b1', 'b2', 'b3'];
const validate = buildPlannerValidator(new Set(BEHAVIOURS));

function opportunity(primary: string, sources: string[] = [primary]) {
  return {
    title: `detect ${primary}`,
    description: 'a detection opportunity',
    observable_chain: ['process creation'],
    telemetry: ['DeviceProcessEvents'],
    mitre_technique_ids: ['T1218.005'],
    tactic: 'defense-evasion',
    primary_behaviour_id: primary,
    source_behaviour_ids: sources,
    variants: [],
    detectability: 'siem',
    detectability_rationale: 'endpoint telemetry present',
  };
}

describe('planner coverage invariant', () => {
  it('accepts a plan where every behaviour is a primary', () => {
    const r = validate(JSON.stringify({
      opportunities: BEHAVIOURS.map(b => opportunity(b)),
    }));
    expect(r.ok).toBe(true);
  });

  it('accepts a merge — a behaviour referenced as a source is accounted for', () => {
    // Merging is the planner's job; it must not be punished for doing it.
    const r = validate(JSON.stringify({
      opportunities: [opportunity('b1', ['b1', 'b2', 'b3'])],
    }));
    expect(r.ok).toBe(true);
  });

  it('REJECTS a plan that silently omits a behaviour', () => {
    // Previously this passed validation and b3 became "not detectable".
    const r = validate(JSON.stringify({
      opportunities: [opportunity('b1'), opportunity('b2')],
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('b3');
      expect(r.reason).toContain('unaccounted');
    }
  });

  it('accepts an omission that is explicitly excluded with a reason', () => {
    const r = validate(JSON.stringify({
      opportunities: [opportunity('b1'), opportunity('b2')],
      excluded_behaviours: [{ behaviour_id: 'b3', reason: 'no telemetry records this' }],
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.excluded_behaviours).toEqual([
        { behaviour_id: 'b3', reason: 'no telemetry records this' },
      ]);
    }
  });

  it('rejects an exclusion with no reason — that is still a silent drop', () => {
    const r = validate(JSON.stringify({
      opportunities: [opportunity('b1'), opportunity('b2')],
      excluded_behaviours: [{ behaviour_id: 'b3', reason: '' }],
    }));
    expect(r.ok).toBe(false);
  });

  it('ignores an exclusion naming a behaviour that was never researched', () => {
    // Accounting for something that does not exist accounts for nothing.
    const r = validate(JSON.stringify({
      opportunities: [opportunity('b1'), opportunity('b2')],
      excluded_behaviours: [{ behaviour_id: 'b99', reason: 'invented' }],
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('b3');
  });

  it('still rejects a response with no valid opportunities at all', () => {
    const r = validate(JSON.stringify({ opportunities: [] }));
    expect(r.ok).toBe(false);
  });

  it('reports every unaccounted behaviour, not just the first', () => {
    // The agent loop feeds the reason back verbatim, so naming one at a time
    // would take three round trips to fix three omissions.
    const r = validate(JSON.stringify({ opportunities: [opportunity('b1')] }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('b2');
      expect(r.reason).toContain('b3');
    }
  });
});

// ---------------------------------------------------------------------------
// salvagePartialPlan
// ---------------------------------------------------------------------------

describe('salvagePartialPlan', () => {
  it('recovers a plan that failed ONLY the coverage invariant', () => {
    // Before this, the strict validator's rejection meant the agent loop
    // returned no output, the orchestrator saw null, and nine correct merged
    // opportunities were discarded to rescue one unaccounted behaviour. It also
    // made the targeted-rescue branch unreachable: that branch can only act on
    // a partial plan, and a partial plan never arrived.
    const salvaged = salvagePartialPlan(
      JSON.stringify({ opportunities: [opportunity('b1'), opportunity('b2')] }),
      new Set(BEHAVIOURS),
    );
    expect(salvaged).not.toBeNull();
    expect(salvaged!.opportunities).toHaveLength(2);
    expect(salvaged!.unaccounted_behaviour_ids).toEqual(['b3']);
  });

  it('counts explicit exclusions as accounted for', () => {
    const salvaged = salvagePartialPlan(
      JSON.stringify({
        opportunities: [opportunity('b1')],
        excluded_behaviours: [{ behaviour_id: 'b2', reason: 'no telemetry' }],
      }),
      new Set(BEHAVIOURS),
    );
    expect(salvaged!.unaccounted_behaviour_ids).toEqual(['b3']);
  });

  it('returns null when the response is unusable for any other reason', () => {
    // A genuine parse failure or a plan with no valid opportunities still means
    // full fallback — salvage must not paper over those.
    expect(salvagePartialPlan('not json', new Set(BEHAVIOURS))).toBeNull();
    expect(salvagePartialPlan(JSON.stringify({ opportunities: [] }), new Set(BEHAVIOURS))).toBeNull();
  });

  it('reports nothing unaccounted when coverage was actually complete', () => {
    const salvaged = salvagePartialPlan(
      JSON.stringify({ opportunities: BEHAVIOURS.map(b => opportunity(b)) }),
      new Set(BEHAVIOURS),
    );
    expect(salvaged!.unaccounted_behaviour_ids).toEqual([]);
  });
});
