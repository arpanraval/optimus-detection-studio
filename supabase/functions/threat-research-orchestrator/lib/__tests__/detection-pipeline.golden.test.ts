// supabase/functions/threat-research-orchestrator/lib/__tests__/detection-pipeline.golden.test.ts
//
// Replays the golden set through the real decision path: product routing →
// library adjudication → versioning → readiness → session yield.
//
// This is an integration test of the DECISION pipeline, not a live session. It
// uses the production functions rather than reimplementing their logic, so a
// regression in any of them fails here — but it does not exercise the queue,
// the workers, or the model. Naming that plainly matters: a green run here means
// the judgement chain is consistent, not that the feature works end to end.
//
// The judged cases are reported, never enforced. Their labels are proposals
// pending staff review, and asserting on a proposal would turn a guess into a
// gate.

import { describe, it, expect } from 'vitest';
import { supportsDefenderSchemaValidation } from '../query-language.ts';
import { adjudicateReuse } from '../coverage.ts';
import { withCandidateVersion } from '../agents/detection-engineer.ts';
import { deriveDetectionStates, summariseYield, deriveSessionStatus } from '../readiness.ts';
import { extractLeadingTable, extractSchemaColumnRefs } from '../tools/defender-schema-lookup.ts';
import {
  GOLDEN_CASES,
  deterministicCases,
  judgedCases,
  unknownColumnsAgainstFixture,
  type GoldenCase,
} from './golden/detection-golden-set.ts';
import type { GeneratedDetection } from '../types.ts';

function asDetection(c: GoldenCase, over: Partial<GeneratedDetection> = {}): GeneratedDetection {
  return {
    id: `det-${c.id}`,
    name: c.id,
    description: c.intent,
    query_language: c.language,
    query: c.query,
    mitre_technique_ids: c.mitreIds,
    tactic: 'defense-evasion',
    suggested_severity: 'Medium',
    suggested_detection_type: 'Detection',
    feasibility: 'covered',
    feasibility_notes: '',
    citations: [],
    covers_behaviour_ids: ['b1'],
    qa: null,
    qa_error: null,
    ...over,
  } as unknown as GeneratedDetection;
}

describe('golden set — deterministic cases are enforced', () => {
  it('covers every deterministic case with an assertion', () => {
    // Guard against a case being added to the data file and silently never run.
    expect(deterministicCases().length).toBeGreaterThan(0);
    for (const c of deterministicCases()) {
      expect(Object.keys(c.expected).length).toBeGreaterThan(0);
    }
  });

  it.each(deterministicCases().filter(c => c.expected.schemaFlagged !== undefined))(
    'schema routing: $id',
    (c) => {
      expect(supportsDefenderSchemaValidation(c.product)).toBe(c.expected.schemaFlagged);
    },
  );

  // The routing assertion above compares two strings, so on its own it would
  // pass with a completely broken column extractor. These cases run the real
  // parser and check its verdict against a schema fixture, which is what makes
  // the routing decision mean something.
  it.each(deterministicCases().filter(c => c.expected.unknownColumns !== undefined))(
    'schema columns: $id',
    (c) => {
      const table = extractLeadingTable(c.query);
      expect(table).not.toBeNull();
      const unknown = unknownColumnsAgainstFixture(table!, extractSchemaColumnRefs(c.query));
      expect(unknown.sort()).toEqual([...c.expected.unknownColumns!].sort());
    },
  );

  it.each(deterministicCases().filter(c => c.expected.suppressGeneration !== undefined))(
    'library adjudication: $id',
    (c) => {
      // A deployed, runnable rule on the SAME telemetry as the query under test.
      const a = adjudicateReuse({
        opportunityMitreIds: c.mitreIds,
        match: {
          status: 'Production',
          query_language: c.language,
          detection_query: c.query,
          mitre_technique_ids: c.mitreIds,
        },
        targetLanguage: c.language,
        opportunityObservableChain: c.observableChain,
        opportunityTelemetry: c.telemetry,
      });
      expect(a.suppressGeneration).toBe(c.expected.suppressGeneration);
    },
  );

  it('a generated query reaches the user regardless of any pipeline error', () => {
    // bc5804b3 generated ten queries, hit six QA errors, and delivered one.
    // Nothing discards written work any more.
    const c = GOLDEN_CASES.find(x => x.id === 'a-generated-query-reaches-the-user')!;
    const states = deriveDetectionStates(asDetection(c, { qa_error: 'qa timed out' }));
    expect(states.artifact).toBe('generated');
    expect(states.readiness).toBe(c.expected.readiness);
  });

  it('a telemetry gap is surfaced, not used to withhold the query', () => {
    const c = GOLDEN_CASES.find(x => x.id === 'telemetry-the-estate-may-lack-is-still-the-users-call')!;
    const states = deriveDetectionStates(asDetection(c, {
      // Shape a pre-removal session persisted. Nothing reads it now.
      validator_findings: {
        telemetry_feasibility: '1/1 required telemetry source(s) not found',
      },
    } as never));
    expect(states.readiness).toBe(c.expected.readiness);
  });

  it('a 30-day lookback stays usable once classified as a hunt', () => {
    const c = GOLDEN_CASES.find(x => x.id === 'thirty-day-lookback-is-a-hunt')!;
    const states = deriveDetectionStates(asDetection(c, {
      suggested_detection_type: c.expected.detectionType,
    }));
    expect(states.readiness).toBe(c.expected.readiness);
  });
});

describe('golden set — versioning keeps an earlier body reachable', () => {
  it('appending a narrower query does not destroy the broad one', () => {
    // No stage rewrites a query now, so this exercises the mechanism rather
    // than the old QA revision path. It stays because the UI reads
    // candidate_versions, and because whatever proposes the next edit must not
    // be able to lose the original.
    const broad = GOLDEN_CASES.find(x => x.id === 'broad-lolbin-query-is-usefully-broad')!;
    const narrow = GOLDEN_CASES.find(x => x.id === 'overconstrained-narrowing-loses-recall')!;

    const v1 = withCandidateVersion(asDetection(broad), broad.query, 'generated', null);
    const v2 = withCandidateVersion(v1, narrow.query, 'qa_revision', 'fail');

    expect(v2.active_version).toBe(2);
    // The recall-preserving original is still reachable. This is the assertion
    // that would have failed before versioning: it was gone.
    expect(v2.candidate_versions!.map(v => v.query)).toContain(broad.query);

    expect(deriveDetectionStates(v2).readiness).toBe(narrow.expected.readiness);
  });
});

describe('golden set — session yield over the whole set', () => {
  it('a mixed session reports partial, not success or failure', () => {
    // Two opportunities produced a query, one produced nothing. Neither
    // "completed" nor "failed" is honest about that.
    const detections = [
      asDetection(GOLDEN_CASES[1]),
      asDetection(GOLDEN_CASES[0], { qa_error: 'qa timed out' }),
      asDetection(GOLDEN_CASES[0], { query: '', qa_error: 'engineer_failed' }),
    ];
    const y = summariseYield(detections);

    expect(y.productionCandidates).toBe(2);
    expect(y.drafts).toBe(1);
    expect(y.preserved).toBe(2);
    expect(deriveSessionStatus(y)).toBe('partial');
  });
});

describe('golden set — judged cases are reported, not enforced', () => {
  it('records which cases still need a staff label', () => {
    const pending = judgedCases();
    // Deliberately not asserting their expected outcomes. These are proposals;
    // enforcing them would turn a guess into a gate and let a green run be
    // mistaken for validated judgement.
    expect(pending.length).toBeGreaterThan(0);
    for (const c of pending) {
      expect(c.rationale).toContain('NEEDS A STAFF LABEL');
    }
    console.log(
      `[golden] ${pending.length} case(s) awaiting staff labels: ` +
      pending.map(c => c.id).join(', '),
    );
  });
});
