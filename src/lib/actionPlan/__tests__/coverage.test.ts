// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { deployedDetectionsFromBindings, observedAttackIds, partitionActionPlan, type CoverageBinding } from '../coverage';

function binding(overrides: Partial<CoverageBinding> = {}): CoverageBinding {
  return {
    detection_id: 'live', binding_status: 'active', availability: 'present', observed_enabled: true,
    detection: { library_type: 'production' },
    snapshot: { content: { name: 'Remote rule', enabled: true, language: 'KQL', config: { techniques: ['T1059'] } } },
    ...overrides,
  };
}

describe('observed deployed coverage', () => {
  it('uses remote ATT&CK mappings rather than pending local changes or local Draft status', () => {
    const observation = { ...binding(), detection: { library_type: 'production', status: 'Draft', mitreAttackIds: ['T1110'] } };
    expect(deployedDetectionsFromBindings([observation])[0].mitreAttackIds).toEqual(['T1059']);
  });

  it.each([
    { observed_enabled: false }, { observed_enabled: null }, { availability: 'missing' },
    { availability: 'unknown' }, { binding_status: 'retired' }, { snapshot: null },
    { detection: null }, { detection: { library_type: 'development' } },
    { snapshot: { content: { enabled: false, config: { techniques: ['T1110'] } } } },
  ])('excludes unavailable or inactive observations: %j', (overrides) => {
    expect(deployedDetectionsFromBindings([binding(overrides)])).toEqual([]);
  });

  it('merges multiple enabled bindings without counting a detection or technique twice', () => {
    const result = deployedDetectionsFromBindings([binding(), binding(), binding({
      snapshot: { content: { enabled: true, config: { techniques: ['T1059', 'T1110'] } } },
    })]);
    expect(result).toHaveLength(1);
    expect(result[0].mitreAttackIds).toEqual(['T1059', 'T1110']);
  });

  it('reads provider metadata fields and ignores technique-like text elsewhere', () => {
    expect(observedAttackIds({
      technique: 'T1003', techniques: ['T1059.001'], mitreTechniques: ['T1110'],
      threat: [{ technique: [{ id: 'T1078' }] }],
      'action.correlationsearch.annotations': { mitre_attack: ['T1021'] },
      fields: { mitre_attack: ['T1105'] }, query: 'T9999', description: 'T9998',
    })).toEqual(['T1003', 'T1059.001', 'T1110', 'T1078', 'T1021', 'T1105']);
  });
});

describe('candidate scope', () => {
  const deployed = deployedDetectionsFromBindings([binding()]);
  const compatible = [
    { id: 'live', library_type: 'production', mitreAttackIds: ['T1059', 'T9999'] },
    { id: 'lab', library_type: 'development', mitreAttackIds: ['T1110'] },
    { id: 'disabled', library_type: 'production', mitreAttackIds: ['T1003'] },
    { id: 'duplicate', library_type: 'development', mitreAttackIds: ['T1059'] },
  ];
  it('includes My Lab only as potential coverage and omits already covered candidates', () => {
    const result = partitionActionPlan(deployed, compatible, true);
    expect([...result.coveredTechniqueIds]).toEqual(['T1059']);
    expect(result.candidates.map(d => d.id)).toEqual(['lab', 'disabled']);
    expect([...result.candidateTechniqueIds]).toEqual(['T1110', 'T1003']);
  });
  it('hiding My Lab changes candidates, never deployed coverage', () => {
    const result = partitionActionPlan(deployed, compatible, false);
    expect([...result.coveredTechniqueIds]).toEqual(['T1059']);
    expect(result.candidates.map(d => d.id)).toEqual(['disabled']);
  });
  it('does not infer deployment from an unobserved Production workflow status', () => {
    const result = partitionActionPlan([], compatible, true);
    expect(result.coveredTechniqueIds.size).toBe(0);
  });
});
