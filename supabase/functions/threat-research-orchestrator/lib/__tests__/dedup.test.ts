import { describe, it, expect } from 'vitest';
import { flagCrossBehaviourDuplicates } from '../dedup';
import type {
  AttackBehaviour, DetectionOpportunity, GeneratedDetection, QaResult, ThreatResearchTree,
} from '../types';

function detection(over: Partial<GeneratedDetection> = {}): GeneratedDetection {
  return {
    id: 'd_o1',
    name: 'Mimikatz LSASS access',
    description: '',
    query_language: 'KQL',
    query: "DeviceProcessEvents | where FileName contains 'mimikatz'",
    mitre_technique_ids: ['T1003.001'],
    unverified_mitre_ids: [],
    tactic: 'credential-access',
    suggested_severity: 'High',
    suggested_detection_type: 'Detection',
    feasibility: 'partial',
    feasibility_notes: '',
    citations: [],
    covers_behaviour_ids: ['b1'],
    qa: null,
    qa_error: null,
    saved_detection_id: null,
    archived: false,
    ...over,
  };
}

function qa(over: Partial<QaResult> = {}): QaResult {
  return {
    verdict: 'pass',
    coverage_quality: 'good',
    concerns: [],
    suggested_changes: [],
    duplicate_of: null,
    iteration_history: [],
    iteration_count: 1,
    ...over,
  };
}

function opportunity(id: string, det: GeneratedDetection): DetectionOpportunity {
  return { id, title: id, description: '', telemetry: ['DeviceProcessEvents'], detection: det };
}

function behaviour(id: string, opps: DetectionOpportunity[]): AttackBehaviour {
  return {
    id,
    title: id,
    narrative_description: '',
    tactic: 'credential-access',
    mitre_technique_ids: ['T1003.001'],
    unverified_mitre_ids: [],
    tactic_inconsistent_mitre_ids: [],
    data_sources: [],
    artefacts: [],
    citations: [],
    unsourced: false,
    deep_dive: null,
    library_match: null,
    detectability: 'siem',
    detectability_rationale: null,
    artefacts_required: [],
    opportunities: opps,
  };
}

function treeOf(behaviours: AttackBehaviour[]): ThreatResearchTree {
  return {
    subject: null, preflight: null, tactic_summary: [], behaviours, open_questions: [],
  } as unknown as ThreatResearchTree;
}

describe('flagCrossBehaviourDuplicates', () => {
  it('never invents a QA verdict for a detection QA did not judge', () => {
    // The regression this guards: the duplicate used to be recorded by
    // synthesising a whole qa block with verdict 'pass_with_concerns'. The list
    // view reads det.qa?.verdict first, so the leaf rendered as "Passed with
    // concerns" and was picked up by "select all passing" — a detection that
    // QA had never seen became bulk-save eligible.
    const first = detection({ id: 'd_o1' });
    const dup = detection({ id: 'd_o2', qa: null, qa_error: null });
    const tree = treeOf([
      behaviour('b1', [opportunity('o1', first)]),
      behaviour('b2', [opportunity('o2', dup)]),
    ]);

    expect(flagCrossBehaviourDuplicates(tree)).toBe(1);

    expect(dup.qa).toBeNull();
    expect(dup.duplicate_of).toBe('d_o1');
    expect(dup.qa_error).toBe('duplicate_no_qa');
    // The canonical (first) detection is untouched.
    expect(first.duplicate_of).toBeUndefined();
    expect(first.qa).toBeNull();
  });

  it('preserves an existing qa_error rather than masking it', () => {
    const first = detection({ id: 'd_o1' });
    const dup = detection({ id: 'd_o2', qa_error: 'model_budget_exhausted' });
    const tree = treeOf([
      behaviour('b1', [opportunity('o1', first)]),
      behaviour('b2', [opportunity('o2', dup)]),
    ]);

    flagCrossBehaviourDuplicates(tree);

    expect(dup.duplicate_of).toBe('d_o1');
    // The original pipeline failure is the more actionable signal — keep it.
    expect(dup.qa_error).toBe('model_budget_exhausted');
  });

  it('annotates qa.duplicate_of when a real verdict exists, leaving it intact', () => {
    const first = detection({ id: 'd_o1' });
    const dup = detection({ id: 'd_o2', qa: qa({ verdict: 'fail', concerns: ['too broad'] }) });
    const tree = treeOf([
      behaviour('b1', [opportunity('o1', first)]),
      behaviour('b2', [opportunity('o2', dup)]),
    ]);

    flagCrossBehaviourDuplicates(tree);

    expect(dup.qa?.verdict).toBe('fail');           // model's judgement preserved
    expect(dup.qa?.duplicate_of).toBe('d_o1');
    expect(dup.qa?.concerns).toHaveLength(2);
    expect(dup.duplicate_of).toBeUndefined();       // recorded on qa, not both
  });

  it('leaves genuinely distinct detections alone', () => {
    const a = detection({ id: 'd_o1' });
    const b = detection({
      id: 'd_o2',
      mitre_technique_ids: ['T1566.001'],
      query: "EmailEvents | where AttachmentCount > 0 and SenderFromDomain endswith '.ru'",
    });
    const tree = treeOf([
      behaviour('b1', [opportunity('o1', a)]),
      behaviour('b2', [{ ...opportunity('o2', b), telemetry: ['EmailEvents'] }]),
    ]);

    expect(flagCrossBehaviourDuplicates(tree)).toBe(0);
    expect(b.duplicate_of).toBeUndefined();
    expect(b.qa_error).toBeNull();
  });

  it('skips archived leaves and leaves with no query', () => {
    const first = detection({ id: 'd_o1' });
    const archived = detection({ id: 'd_o2', archived: true });
    const empty = detection({ id: 'd_o3', query: '' });
    const tree = treeOf([
      behaviour('b1', [opportunity('o1', first)]),
      behaviour('b2', [opportunity('o2', archived)]),
      behaviour('b3', [opportunity('o3', empty)]),
    ]);

    expect(flagCrossBehaviourDuplicates(tree)).toBe(0);
    expect(archived.duplicate_of).toBeUndefined();
    expect(empty.duplicate_of).toBeUndefined();
  });
});
