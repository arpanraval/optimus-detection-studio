// supabase/functions/threat-research-orchestrator/lib/__tests__/detection-versions.test.ts
//
// Candidate versioning outlived the thing it was built for.
//
// It existed because a QA `fail` overwrote the query in place with no second
// critique, so a wrong fail destroyed the better detector with no way back —
// typically a broad, useful primitive "improved" into a narrow chain-specific
// query that misses the general case. The QA agent is gone, so nothing rewrites
// a query any more and only version 1 is ever recorded in the pipeline.
//
// The machinery stays because the UI reads candidate_versions to render the
// query, and because the next thing that proposes an edit (a user-driven
// revision, most likely) needs the original to remain reachable. These tests
// pin the append-and-activate contract that guarantees that.

import { describe, it, expect } from 'vitest';
import { withCandidateVersion } from '../agents/detection-engineer.ts';
import type { GeneratedDetection } from '../types.ts';

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
