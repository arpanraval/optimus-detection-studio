import { describe, it, expect } from 'vitest';
import type {
  ThreatResearchSession,
  ThreatResearchTree,
  AttackBehaviour,
  GeneratedDetection,
  QaResult,
  KillChainTactic,
  ResearchAgent,
  ThreatResearchEvent,
} from '../threatResearch';

describe('threat research types', () => {
  it('exposes a ThreatResearchSession matching the schema', () => {
    const session: ThreatResearchSession = {
      id: 'a',
      user_id: 'u',
      created_at: '2026-04-30T00:00:00Z',
      updated_at: '2026-04-30T00:00:00Z',
      completed_at: null,
      input_text: 'Scattered Spider',
      input_classification: 'group',
      status: 'pending',
      failure_reason: null,
      duration_ms: null,
      tree: {} as ThreatResearchTree,
      environment_snapshot: null,
      coverage_impact: null,
      total_tokens: null,
      total_cost_usd: null,
      tool_calls_used: null,
      model_versions: null,
    };
    expect(session.status).toBe('pending');
  });

  it('exposes a typed kill_chain_phase via KillChainTactic', () => {
    const phase: KillChainTactic = 'credential-access';
    expect(phase).toBeTruthy();
  });

  it('exposes the research agent enum', () => {
    const agents: ResearchAgent[] = ['orchestrator','preflight','research','attack-researcher','detection-engineer','qa'];
    expect(agents).toHaveLength(6);
  });

  it('exposes a typed AttackBehaviour', () => {
    const b: AttackBehaviour = {
      id: 'b1',
      title: 't',
      narrative_description: 'd',
      kill_chain_phase: 'execution',
      mitre_technique_ids: ['T1059'],
      data_sources: ['Sysmon EID 1'],
      artefacts: [],
      citations: [],
      library_already_covers_ids: [],
      opportunities: [],
    };
    expect(b.kill_chain_phase).toBe('execution');
  });

  it('exposes a typed GeneratedDetection with constrained query_language', () => {
    const d: GeneratedDetection = {
      id: 'd1',
      name: 'n',
      description: 'desc',
      query_language: 'KQL',
      query: 'DeviceProcessEvents | take 1',
      mitre_technique_ids: ['T1059'],
      kill_chain_phase: 'execution',
      suggested_severity: 'High',
      suggested_detection_type: 'Detection',
      feasibility: 'covered',
      feasibility_notes: 'all sources present',
      citations: [],
      covers_behaviour_ids: [],
      qa: null,
      saved_detection_id: null,
      archived: false,
    };
    expect(d.feasibility).toBe('covered');
    expect(d.query_language).toBe('KQL');
  });

  it('exposes a typed QaResult with iteration history', () => {
    const q: QaResult = {
      verdict: 'pass',
      coverage_quality: 'tight',
      concerns: [],
      suggested_changes: [],
      duplicate_of: null,
      iteration_history: [{ verdict: 'pass', concerns: [], diff_from_previous: null }],
      iteration_count: 1,
    };
    expect(q.verdict).toBe('pass');
    expect(q.iteration_history).toHaveLength(1);
  });

  it('exposes a typed ThreatResearchEvent', () => {
    const e: ThreatResearchEvent = {
      id: 'e1',
      session_id: 's1',
      user_id: 'u1',
      created_at: '2026-04-30T00:00:00Z',
      agent: 'detection-engineer',
      event_type: 'detection_generated',
      message: 'wrote detection',
      duration_ms: 1234,
      payload: { detection_id: 'd1' },
      narration: 'searching for similar detections...',
    };
    expect(e.agent).toBe('detection-engineer');
    expect(e.event_type).toBe('detection_generated');
  });
});
