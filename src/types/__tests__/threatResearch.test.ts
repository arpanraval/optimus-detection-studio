import { describe, it, expect } from 'vitest';
import type {
  ThreatResearchSession,
  ThreatResearchTree,
  ResearchSubject,
  AttackBehaviour,
  DetectionOpportunity,
  GeneratedDetection,
  QaResult,
  KillChainPhase,
  ResearchAgent,
  ResearchEventType,
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

  it('exposes a typed kill_chain_phase', () => {
    const phase: KillChainPhase = 'credential-access';
    expect(phase).toBeTruthy();
  });

  it('exposes the research agent enum', () => {
    const agents: ResearchAgent[] = ['orchestrator','preflight','research','attack-researcher','detection-engineer','qa'];
    expect(agents).toHaveLength(6);
  });
});
