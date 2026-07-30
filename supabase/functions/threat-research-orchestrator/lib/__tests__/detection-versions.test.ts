// supabase/functions/threat-research-orchestrator/lib/__tests__/detection-versions.test.ts
//
// A QA `fail` used to overwrite the query in place, with no second critique.
// So a wrong fail destroyed the better detector and there was no way back.
//
// The realistic loss is not exotic: a broad, useful primitive gets "improved"
// into a narrow chain-specific query that misses the general case. These tests
// pin that both versions survive and the analyst can still reach the original.

import { describe, it, expect } from 'vitest';
import {
  driveSinglePassQa, withCandidateVersion, applyCandidateValidation,
} from '../agents/detection-engineer.ts';
import type { GeneratedDetection, QaResult } from '../types.ts';

const BROAD = 'DeviceProcessEvents | where FileName =~ "mshta.exe" | where ProcessCommandLine has_any ("http://", "https://")';
const NARROW = 'DeviceProcessEvents | where FileName =~ "mshta.exe" and InitiatingProcessFileName =~ "explorer.exe" | where ProcessCommandLine has "http"';

function detection(query = BROAD): GeneratedDetection {
  return {
    id: 'det-1',
    name: 'Remote MSHTA',
    description: 'mshta.exe fetching a remote payload',
    query_language: 'KQL',
    query,
    mitre_technique_ids: ['T1218.005'],
    tactic: 'defense-evasion',
    suggested_severity: 'High',
    suggested_detection_type: 'Detection',
    feasibility: 'covered',
    feasibility_notes: '',
    citations: [],
    covers_behaviour_ids: ['b1'],
    qa: null,
    qa_error: null,
  } as unknown as GeneratedDetection;
}

function qaResult(verdict: QaResult['verdict']): QaResult {
  return {
    verdict,
    coverage_quality: 'acceptable',
    concerns: verdict === 'fail' ? ['too broad'] : [],
    suggested_changes: verdict === 'fail' ? ['require explorer.exe parent'] : [],
    duplicate_of: null,
    iteration_history: [],
    iteration_count: 0,
  };
}

describe('withCandidateVersion', () => {
  it('records the first version and makes it active', () => {
    const d = withCandidateVersion(detection(), BROAD, 'generated', null);
    expect(d.candidate_versions).toHaveLength(1);
    expect(d.candidate_versions![0]).toMatchObject({ version: 1, query: BROAD, source: 'generated' });
    expect(d.active_version).toBe(1);
    expect(d.query).toBe(BROAD);
  });

  it('appends a second version and switches active, keeping the first', () => {
    const v1 = withCandidateVersion(detection(), BROAD, 'generated', null);
    const v2 = withCandidateVersion(v1, NARROW, 'qa_revision', 'fail');

    expect(v2.candidate_versions).toHaveLength(2);
    expect(v2.candidate_versions![0].query).toBe(BROAD);   // original still reachable
    expect(v2.candidate_versions![1].query).toBe(NARROW);
    expect(v2.candidate_versions![1].prompted_by_verdict).toBe('fail');
    expect(v2.active_version).toBe(2);
    expect(v2.query).toBe(NARROW);                          // `query` mirrors active
  });

  it('does not record a version for an unchanged query', () => {
    // Two indistinguishable versions would imply a change that never happened.
    const v1 = withCandidateVersion(detection(), BROAD, 'generated', null);
    const same = withCandidateVersion(v1, BROAD, 'qa_revision', 'fail');
    expect(same.candidate_versions).toHaveLength(1);
    expect(same.active_version).toBe(1);
  });
});

describe('driveSinglePassQa versioning', () => {
  it('a passing verdict still records version 1', async () => {
    const out = await driveSinglePassQa(
      detection(),
      async () => { throw new Error('writeFn must not be called on pass'); },
      async () => ({ kind: 'completed', qa: qaResult('pass') }),
    );
    expect(out.candidate_versions).toHaveLength(1);
    expect(out.query).toBe(BROAD);
    expect(out.qa?.verdict).toBe('pass');
  });

  it('pass_with_concerns ships unchanged and is not revised', async () => {
    const out = await driveSinglePassQa(
      detection(),
      async () => { throw new Error('writeFn must not be called on pass_with_concerns'); },
      async () => ({ kind: 'completed', qa: qaResult('pass_with_concerns') }),
    );
    expect(out.query).toBe(BROAD);
    expect(out.candidate_versions).toHaveLength(1);
  });

  it('a fail PRESERVES the original alongside the revision', async () => {
    // The assertion that matters. Previously BROAD was gone forever.
    const out = await driveSinglePassQa(
      detection(),
      async (prev) => ({ ...prev, query: NARROW }),
      async () => ({ kind: 'completed', qa: qaResult('fail') }),
    );

    expect(out.candidate_versions).toHaveLength(2);
    expect(out.candidate_versions![0].query).toBe(BROAD);
    expect(out.candidate_versions![0].source).toBe('generated');
    expect(out.candidate_versions![1].query).toBe(NARROW);
    expect(out.candidate_versions![1].source).toBe('qa_revision');
    expect(out.revised_after_fail).toBe(true);
    // The verdict is still the original fail -- inventing a passing one would
    // be fabrication; readiness.ts turns this into revised_unverified.
    expect(out.qa?.verdict).toBe('fail');
  });

  it('records version 1 even when the QA pipeline errors', async () => {
    // A QA transport failure must not cost the generated query.
    const out = await driveSinglePassQa(
      detection(),
      async () => { throw new Error('writeFn must not be called'); },
      async () => ({ kind: 'pipeline_error', reason: 'qa timed out' }),
    );
    expect(out.candidate_versions).toHaveLength(1);
    expect(out.query).toBe(BROAD);
    expect(out.qa_error).toBe('qa timed out');
  });
});

// Keeping both versions was only half the fix. The revision still became active
// automatically and was never re-checked, so the body that reached the analyst
// was the one nothing had validated -- a wrong `fail` could still put a broken
// query in front of them, just with the working one behind a tab.
describe('applyCandidateValidation', () => {
  const twoVersions = () => withCandidateVersion(
    withCandidateVersion(detection(), BROAD, 'generated', null),
    NARROW, 'qa_revision', 'fail',
  );

  it('keeps the earlier version active when the revision breaks the schema', () => {
    const out = applyCandidateValidation(twoVersions(), {
      1: [],
      2: ['unknown column: InitiatingProcessFileNam'],
    });
    expect(out.active_version).toBe(1);
    // `query` must follow, or every reader that only understands `query` still
    // gets the broken body.
    expect(out.query).toBe(BROAD);
    // The rejected revision is still reachable, with its reason attached.
    expect(out.candidate_versions![1].validation).toEqual({
      checked: true, problems: ['unknown column: InitiatingProcessFileNam'],
    });
  });

  it('promotes the revision when it is the clean one', () => {
    const out = applyCandidateValidation(twoVersions(), { 1: ['unknown column: Computer'], 2: [] });
    expect(out.active_version).toBe(2);
    expect(out.query).toBe(NARROW);
  });

  it('promotes the revision when both are clean', () => {
    const out = applyCandidateValidation(twoVersions(), { 1: [], 2: [] });
    expect(out.active_version).toBe(2);
  });

  it('still promotes the revision when NEITHER is clean', () => {
    // Falling back to v1 here would re-activate a body QA had already
    // rejected, on the strength of it being equally broken.
    const out = applyCandidateValidation(twoVersions(), { 1: ['a'], 2: ['b'] });
    expect(out.active_version).toBe(2);
  });

  it('records checked:false for a version it could not check', () => {
    // "No problems found" and "never looked at" must not render the same.
    const out = applyCandidateValidation(twoVersions(), { 1: [] });
    expect(out.candidate_versions![0].validation).toEqual({ checked: true, problems: [] });
    expect(out.candidate_versions![1].validation).toEqual({ checked: false, problems: [] });
    // An unchecked version cannot be "the newest clean one".
    expect(out.active_version).toBe(1);
  });

  it('leaves a legacy detection with no versions untouched', () => {
    const legacy = detection();
    expect(applyCandidateValidation(legacy, {})).toBe(legacy);
  });
});

describe('driveSinglePassQa revalidation', () => {
  const failThenNarrow = async (prev: GeneratedDetection) => ({ ...prev, query: NARROW });
  const failVerdict = async () => ({ kind: 'completed' as const, qa: qaResult('fail') });

  it('does not activate a revision that fails revalidation', async () => {
    const out = await driveSinglePassQa(
      detection(), failThenNarrow, failVerdict,
      async (query) => (query === NARROW ? ['unknown column: Nope'] : []),
    );
    expect(out.candidate_versions).toHaveLength(2);
    expect(out.active_version).toBe(1);
    expect(out.query).toBe(BROAD);
    // The revision is preserved as a proposal, not discarded.
    expect(out.candidate_versions![1].query).toBe(NARROW);
  });

  it('activates a revision that revalidates cleanly', async () => {
    const out = await driveSinglePassQa(detection(), failThenNarrow, failVerdict, async () => []);
    expect(out.active_version).toBe(2);
    expect(out.query).toBe(NARROW);
  });

  it('a validator that throws cannot mark a body as problematic', async () => {
    // The schema RPC being unreachable says nothing about the query. Treating
    // that as a defect would let an outage silently change which version ships.
    const out = await driveSinglePassQa(
      detection(), failThenNarrow, failVerdict,
      async () => { throw new Error('rpc unreachable'); },
    );
    expect(out.candidate_versions!.every(v => v.validation?.checked === false)).toBe(true);
    expect(out.active_version).toBe(2);
  });

  it('leaves activation alone when no validator is supplied', async () => {
    // Sigma and Sentinel sessions have no schema to check against.
    const out = await driveSinglePassQa(detection(), failThenNarrow, failVerdict);
    expect(out.active_version).toBe(2);
    expect(out.candidate_versions![1].validation).toBeUndefined();
  });
});
