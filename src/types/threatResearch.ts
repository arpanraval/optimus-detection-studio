// src/types/threatResearch.ts
import { QUERY_LANGUAGES } from '../constants';

export type ResearchStatus =
  | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ResearchInputClassification =
  | 'cve' | 'group' | 'campaign' | 'technique' | 'concept';

export type ResearchAgent =
  | 'orchestrator' | 'preflight'
  | 'research' | 'attack-researcher' | 'detection-engineer' | 'qa';

export type ResearchEventType =
  | 'agent_started' | 'agent_iteration' | 'agent_tool_call' | 'agent_narration'
  | 'agent_completed' | 'agent_failed'
  | 'preflight_started' | 'preflight_completed'
  | 'behaviour_created' | 'opportunity_created' | 'detection_generated'
  | 'qa_verdict' | 'qa_refinement_started' | 'qa_refinement_completed'
  | 'session_completed' | 'session_cancelled' | 'session_failed'
  | 'tool_call' | 'tool_cache_hit';

export type KillChainTactic =
  | 'reconnaissance' | 'resource-development' | 'initial-access'
  | 'execution' | 'persistence' | 'privilege-escalation'
  | 'defense-evasion' | 'credential-access' | 'discovery'
  | 'lateral-movement' | 'collection' | 'command-and-control'
  | 'exfiltration' | 'impact';

export interface ResearchCitation {
  source: string;          // "Mandiant", "MITRE", "CrowdStrike", etc.
  url: string;
  claim: string;           // what this citation supports
}

export interface ResearchSubject {
  classification: ResearchInputClassification;
  subject: string;         // canonical name e.g. "Scattered Spider (UNC3944)"
  brief: string;           // 1-paragraph synthesis
  scope_hints: string[];   // user-relevant scopes the agent picked up on
  citations: ResearchCitation[];
}

export interface PreflightSummary {
  existing_coverage_pct: number | null;
  covered_techniques: string[];     // MITRE technique IDs
  gap_techniques: string[];
  skipped: boolean;
  ran_at: string;                   // ISO timestamp
}

export interface AttackBehaviour {
  id: string;
  title: string;
  narrative_description: string;
  kill_chain_phase: KillChainTactic;
  mitre_technique_ids: string[];
  data_sources: string[];
  artefacts: string[];
  citations: ResearchCitation[];
  library_already_covers_ids: string[];   // detection IDs from the user's library
  opportunities: DetectionOpportunity[];
}

export interface DetectionOpportunity {
  id: string;
  title: string;
  description: string;
  detection: GeneratedDetection;
}

export type FeasibilityVerdict = 'covered' | 'partial' | 'uncovered';

/** Query language used for a generated detection. Derived from the canonical
 *  list in `src/constants.ts` so the agent's choices are restricted to the same
 *  set the rest of the app already understands. */
export type ResearchQueryLanguage = (typeof QUERY_LANGUAGES)[number];

export type QaVerdict = 'pass' | 'pass_with_concerns' | 'fail';
export type QaCoverageQuality = 'tight' | 'acceptable' | 'loose';

export interface QaIteration {
  verdict: QaVerdict;
  concerns: string[];
  diff_from_previous: string | null;     // unified diff vs prior iteration's query
}

export interface QaResult {
  verdict: QaVerdict;
  coverage_quality: QaCoverageQuality;
  concerns: string[];
  suggested_changes: string[];
  duplicate_of: string | null;            // existing detection id
  iteration_history: QaIteration[];
  iteration_count: number;
}

export interface GeneratedDetection {
  id: string;
  name: string;
  description: string;
  query_language: ResearchQueryLanguage;
  query: string;
  mitre_technique_ids: string[];
  kill_chain_phase: KillChainTactic;
  suggested_severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';
  suggested_detection_type: 'Detection' | 'Hunting';
  feasibility: FeasibilityVerdict;
  feasibility_notes: string;
  citations: ResearchCitation[];
  covers_behaviour_ids: string[];
  qa: QaResult | null;
  saved_detection_id: string | null;      // FK back into the user's library
  archived: boolean;
}

export interface ResearchOpenQuestion {
  agent: ResearchAgent;
  question: string;
  context: string;
}

export interface ThreatResearchTree {
  subject: ResearchSubject | null;
  preflight: PreflightSummary | null;
  behaviours: AttackBehaviour[];
  open_questions: ResearchOpenQuestion[];
}

export interface ThreatResearchSession {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;

  input_text: string;
  input_classification: ResearchInputClassification | null;

  status: ResearchStatus;
  failure_reason: string | null;
  duration_ms: number | null;

  tree: ThreatResearchTree;
  environment_snapshot: Record<string, unknown> | null;

  coverage_impact: number | null;

  total_tokens: number | null;
  total_cost_usd: number | null;
  tool_calls_used: number | null;
  model_versions: Record<string, string> | null;
}

export interface ThreatResearchEvent {
  id: string;
  session_id: string;
  user_id: string | null;
  created_at: string;
  agent: ResearchAgent;
  event_type: ResearchEventType;
  message: string | null;
  duration_ms: number | null;
  payload: Record<string, unknown> | null;
  narration: string | null;
}
