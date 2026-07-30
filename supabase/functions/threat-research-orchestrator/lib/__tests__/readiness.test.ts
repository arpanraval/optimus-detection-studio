// supabase/functions/threat-research-orchestrator/lib/__tests__/readiness.test.ts

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

describe('artifact and review derivation', () => {
  it('a generated query with a pass verdict is a production candidate', () => {
    const s = deriveDetectionStates(generated({ qa: { verdict: 'pass' } }));
    expect(s).toEqual({ artifact: 'generated', review: 'pass', readiness: 'production_candidate' });
  });

  it('pass_with_concerns is shippable, not a veto', () => {
    // Empirically the verdict essentially every generated detection receives:
    // one clean 'pass' in 31 sessions. Excluding it would leave the product
    // unable to ever produce a candidate at all.
    const s = deriveDetectionStates(generated({ qa: { verdict: 'pass_with_concerns' } }));
    expect(s.readiness).toBe('production_candidate');
  });

  it('a QA error preserves the query and asks for a human', () => {
    // Session bc5804b3: 1.17M tokens, ten queries written, six QA errors, one
    // delivered. The queries existed the whole time.
    const s = deriveDetectionStates(generated({ qa_error: 'qa_pipeline_error' }));
    expect(s.artifact).toBe('generated');
    expect(s.review).toBe('unreviewed');
    expect(s.readiness).toBe('needs_review');
  });

  it('does NOT call an unreviewed query production-ready', () => {
    // The opposite failure: 793cafab reported success while the real work died.
    const s = deriveDetectionStates(generated({ qa_error: 'qa_pipeline_error' }));
    expect(s.readiness).not.toBe('production_candidate');
  });

  it('a failed verdict is a draft, not a candidate', () => {
    expect(deriveDetectionStates(generated({ qa: { verdict: 'fail' } })).readiness).toBe('draft');
  });

  it('a revision that was never re-critiqued reads as revised_unverified', () => {
    // The engineer revises once on a fail and ships with no second critique.
    // Persisting the stale 'fail' meant a repaired detection read as broken
    // AND was excluded from the usable count -- punished twice for being fixed.
    const s = deriveDetectionStates(generated({
      qa: { verdict: 'fail' },
      revised_after_fail: true,
    }));
    expect(s.review).toBe('revised_unverified');
    expect(s.readiness).toBe('needs_review');
  });

  it('engineer_failed means no artifact exists', () => {
    const s = deriveDetectionStates({ query: '', qa_error: 'engineer_failed' });
    expect(s.artifact).toBe('generation_failed');
    expect(s.readiness).toBe('draft');
  });

  it('an empty query is a failed artifact whatever QA said', () => {
    expect(deriveDetectionStates({ query: '   ', qa: { verdict: 'pass' } }).artifact)
      .toBe('generation_failed');
  });

  it('a reused library rule is the user\'s own content and is not re-judged', () => {
    // Telling users to re-approve rules they already run would be noise.
    const s = deriveDetectionStates({
      query: QUERY,
      reused_from_library: true,
      saved_detection_id: 'det-1',
    });
    expect(s.artifact).toBe('library_reused');
    expect(s.readiness).toBe('production_candidate');
  });
});

describe('session yield and status', () => {
  it('reports failed only when nothing at all was preserved', () => {
    const y = summariseYield([
      { query: '', qa_error: 'engineer_failed' },
      { query: '', qa_error: 'engineer_failed' },
    ]);
    expect(y.preserved).toBe(0);
    expect(deriveSessionStatus(y)).toBe('failed');
  });

  it('reports partial when work was preserved but still needs a human', () => {
    // This is the state the pipeline could not previously express, which is
    // why it lied in both directions.
    const y = summariseYield([
      generated({ qa: { verdict: 'pass_with_concerns' } }),
      generated({ qa_error: 'qa_pipeline_error' }),
    ]);
    expect(y.productionCandidates).toBe(1);
    expect(y.needsReview).toBe(1);
    expect(deriveSessionStatus(y)).toBe('partial');
  });

  it('reports completed only when everything is ready to act on', () => {
    const y = summariseYield([
      generated({ qa: { verdict: 'pass' } }),
      generated({ qa: { verdict: 'pass_with_concerns' } }),
    ]);
    expect(deriveSessionStatus(y)).toBe('completed');
  });

  it('rescues the bc5804b3 shape instead of discarding it', () => {
    // Ten generated queries, six of which QA errored on, one clean pass.
    // Old gate: usable = 1, and the six were thrown away.
    const detections: DetectionLike[] = [
      generated({ qa: { verdict: 'pass' } }),
      ...Array.from({ length: 6 }, () => generated({ qa_error: 'qa_pipeline_error' })),
      ...Array.from({ length: 3 }, () => generated({ qa: { verdict: 'pass_with_concerns' } })),
    ];
    const y = summariseYield(detections);

    expect(y.preserved).toBe(10);        // was 1
    expect(y.productionCandidates).toBe(4);
    expect(y.needsReview).toBe(6);
    expect(deriveSessionStatus(y)).toBe('partial');
  });

  it('does not dress a credit-exhausted run up as a success', () => {
    // 793cafab: five library matches survived while every generated leaf died.
    // Reporting that as 'completed' is what forced a manual correction.
    const y = summariseYield([
      ...Array.from({ length: 5 }, () => ({
        query: QUERY, reused_from_library: true, saved_detection_id: 'det-x',
      })),
      ...Array.from({ length: 2 }, () => ({ query: '', qa_error: 'engineer_failed' })),
    ]);
    expect(deriveSessionStatus(y)).toBe('partial');
    expect(y.drafts).toBe(2);
  });
});

// A verdict about the QUERY says nothing about whether the estate can run it.
// `pass_with_concerns` mapped straight to production_candidate, so a detection
// over a log source the customer does not collect was reported as ready to
// ship. That is the inversion this module exists to prevent, arriving through a
// door it did not cover.
//
// The signal is deterministic: validators/index.ts compares the opportunity's
// telemetry against environment_profiles. It is a fact about the estate, not a
// model's opinion about it, which is why readiness may act on it.
describe('telemetry-blocked detections', () => {
  const MISSING = '2/3 required telemetry source(s) not found in the user\'s configured '
    + 'environment: Zeek conn.log; Sysmon Event ID 3. Verify against /settings/environment.';

  it('a correct query the environment cannot feed is not a production candidate', () => {
    const s = deriveDetectionStates(generated({
      qa: { verdict: 'pass_with_concerns' },
      validator_findings: { telemetry_feasibility: MISSING },
    }));
    expect(s.review).toBe('pass_with_concerns');   // the verdict is untouched
    expect(s.readiness).toBe('needs_telemetry');
  });

  it('applies to a clean pass too', () => {
    const s = deriveDetectionStates(generated({
      qa: { verdict: 'pass' },
      validator_findings: { telemetry_feasibility: MISSING },
    }));
    expect(s.readiness).toBe('needs_telemetry');
  });

  it('does not rescue a detection QA rejected', () => {
    // 'the query is wrong' outranks 'we could not feed it'. Reporting a failed
    // query as merely blocked on collection would hide a real defect behind an
    // infrastructure excuse.
    const s = deriveDetectionStates(generated({
      qa: { verdict: 'fail' },
      validator_findings: { telemetry_feasibility: MISSING },
    }));
    expect(s.readiness).toBe('draft');
  });

  it('does not muddy needs_review, which means something different', () => {
    // No trustworthy verdict at all is not the same problem as a known
    // collection gap, and the two have different remedies.
    const s = deriveDetectionStates(generated({
      qa_error: 'qa timed out',
      validator_findings: { telemetry_feasibility: MISSING },
    }));
    expect(s.readiness).toBe('needs_review');
  });

  it('leaves a reused library rule alone', () => {
    // The user's own deployed rule. If it needs telemetry they lack, that is
    // their existing posture, and re-judging it would tell them to re-approve
    // rules they already run.
    const s = deriveDetectionStates({
      query: QUERY, reused_from_library: true, saved_detection_id: 'det-x',
      validator_findings: { telemetry_feasibility: MISSING },
    });
    expect(s.readiness).toBe('production_candidate');
  });

  it('ignores an empty finding rather than treating it as a gap', () => {
    for (const finding of ['', '   ']) {
      const s = deriveDetectionStates(generated({
        qa: { verdict: 'pass' },
        validator_findings: { telemetry_feasibility: finding },
      }));
      expect(s.readiness, JSON.stringify(finding)).toBe('production_candidate');
    }
  });

  it('other validator findings do not block readiness', () => {
    // Only telemetry feasibility is a deployability blocker. A citation or
    // MITRE finding is advisory and must not silently gate shipping.
    const s = deriveDetectionStates(generated({
      qa: { verdict: 'pass' },
      validator_findings: { citation_check: 'one citation did not resolve' },
    }));
    expect(s.readiness).toBe('production_candidate');
  });

  it('counts as preserved work, and makes the session partial not completed', () => {
    // Preserved: the query was generated and kept. Partial: it cannot run yet,
    // so the session has not finished the job.
    const y = summariseYield([
      generated({ qa: { verdict: 'pass' } }),
      generated({ qa: { verdict: 'pass' }, validator_findings: { telemetry_feasibility: MISSING } }),
    ]);
    expect(y.productionCandidates).toBe(1);
    expect(y.needsTelemetry).toBe(1);
    expect(y.needsReview).toBe(0);
    expect(y.preserved).toBe(2);
    expect(deriveSessionStatus(y)).toBe('partial');
  });
});
