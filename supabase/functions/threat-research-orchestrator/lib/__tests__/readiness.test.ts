// supabase/functions/threat-research-orchestrator/lib/__tests__/readiness.test.ts
//
// These tests exist to make the QA removal deliberate rather than incidental.
//
// The previous derivation had five review states and four readiness states,
// because an LLM critic sat between the engineer and the user and its verdict
// decided what shipped. That critic was removed after session 7382a9c2, where
// it returned pass_with_concerns on all seven detections while asserting two
// schema facts that are false. The telemetry-feasibility gate went with it: it
// matched free-text prose against environment labels by word overlap and
// blocked three of the same seven, two of which called their own requirement
// optional.
//
// So the assertions below are deliberately blunt. If a future change makes a
// detection with a real query stop being a production candidate, that is a
// product decision and these tests should fail loudly rather than quietly
// re-introduce a gate.

import { describe, it, expect } from 'vitest';
import {
  deriveDetectionStates,
  summariseYield,
  deriveSessionStatus,
  type DetectionLike,
} from '../readiness.ts';

const QUERY = 'DeviceProcessEvents | where FileName =~ "adfind.exe"';

const generated = (over: Partial<DetectionLike> = {}): DetectionLike =>
  ({ query: QUERY, ...over });

describe('artifact derivation', () => {
  it('a query the engineer wrote is generated', () => {
    expect(deriveDetectionStates(generated()).artifact).toBe('generated');
  });

  it('a saved_detection_id means the leaf points at an existing library rule', () => {
    expect(deriveDetectionStates(generated({ saved_detection_id: 'lib-1' })).artifact)
      .toBe('library_reused');
  });

  it('reused_from_library counts even without an id yet', () => {
    expect(deriveDetectionStates(generated({ reused_from_library: true })).artifact)
      .toBe('library_reused');
  });

  it('engineer_failed means no artifact was produced', () => {
    expect(deriveDetectionStates({ query: '', qa_error: 'engineer_failed' }).artifact)
      .toBe('generation_failed');
  });

  it('a whitespace-only query is not a query', () => {
    expect(deriveDetectionStates({ query: '   ' }).artifact).toBe('generation_failed');
  });
});

describe('readiness derivation', () => {
  it('a generated query is a production candidate — the user decides, not a model', () => {
    expect(deriveDetectionStates(generated())).toEqual({
      artifact: 'generated',
      readiness: 'production_candidate',
    });
  });

  it('a reused library rule is a production candidate', () => {
    expect(deriveDetectionStates(generated({ saved_detection_id: 'lib-1' })).readiness)
      .toBe('production_candidate');
  });

  it('only the absence of a query produces a draft', () => {
    expect(deriveDetectionStates({ query: null }).readiness).toBe('draft');
  });

  // Regression guards. Each of these used to downgrade a perfectly usable
  // query; none of them may do so again without an explicit decision.
  it('a stale QA verdict on a historical leaf does not downgrade it', () => {
    // Sessions predating the removal still carry qa blocks. They render, but
    // they no longer decide anything.
    const s = deriveDetectionStates({
      query: QUERY,
      qa_error: 'iteration_cap',
    } as DetectionLike);
    expect(s.readiness).toBe('production_candidate');
  });

  it('a telemetry finding no longer blocks — the validator is gone', () => {
    const s = deriveDetectionStates({
      query: QUERY,
      // Shape a pre-removal session would have persisted.
      validator_findings: { telemetry_feasibility: 'not found in environment' },
    } as DetectionLike);
    expect(s.readiness).toBe('production_candidate');
  });
});

describe('session yield and status', () => {
  it('counts candidates and drafts, and treats candidates as preserved', () => {
    const y = summariseYield([
      generated(),
      generated({ saved_detection_id: 'lib-1' }),
      { query: '', qa_error: 'engineer_failed' },
    ]);
    expect(y.total).toBe(3);
    expect(y.productionCandidates).toBe(2);
    expect(y.drafts).toBe(1);
    expect(y.preserved).toBe(2);
  });

  it('a session that produced nothing is failed', () => {
    const y = summariseYield([{ query: '', qa_error: 'engineer_failed' }]);
    expect(deriveSessionStatus(y)).toBe('failed');
    expect(y.preserved).toBe(0);
  });

  it('a session where every opportunity yielded a query is completed', () => {
    expect(deriveSessionStatus(summariseYield([generated(), generated()])))
      .toBe('completed');
  });

  it('a mixed session is partial — some work happened, some did not', () => {
    const y = summariseYield([generated(), { query: '', qa_error: 'engineer_failed' }]);
    expect(deriveSessionStatus(y)).toBe('partial');
  });

  it('an empty session is failed, not completed', () => {
    expect(deriveSessionStatus(summariseYield([]))).toBe('failed');
  });
});
