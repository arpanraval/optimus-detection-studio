// supabase/functions/threat-research-orchestrator/lib/types.ts
//
// Server-side mirror of src/types/threatResearch.ts. Kept in sync by hand.
// Deno cannot import Vite/TypeScript paths from src/, so the duplication is
// deliberate. Keep these definitions byte-equivalent to the client copy
// (excluding the `import { QUERY_LANGUAGES }` line — server uses a literal
// union since the constants file is in the client tree).

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

export type FeasibilityVerdict = 'covered' | 'partial' | 'uncovered';

export type ResearchQueryLanguage =
  | 'SPL' | 'KQL' | 'Kuery' | 'Sigma' | 'EQL' | 'ESQL' | 'CQL'
  | 'SQL' | 'YARA' | 'YARA-L' | 'Lucene'
  | 'Carbon Black' | 'Datadog' | 'Elasticsearch DSL';

export type QaVerdict = 'pass' | 'pass_with_concerns' | 'fail';
export type QaCoverageQuality = 'tight' | 'acceptable' | 'loose';

export interface ResearchCitation {
  source: string;
  url: string;
  claim: string;
}

export interface ResearchSubject {
  classification: ResearchInputClassification;
  subject: string;
  brief: string;
  scope_hints: string[];
  citations: ResearchCitation[];
}

export interface PreflightSummary {
  existing_coverage_pct: number | null;
  covered_techniques: string[];
  gap_techniques: string[];
  skipped: boolean;
  ran_at: string;
}

export interface QaIteration {
  verdict: QaVerdict;
  concerns: string[];
  diff_from_previous: string | null;
}

export interface QaResult {
  verdict: QaVerdict;
  coverage_quality: QaCoverageQuality;
  concerns: string[];
  suggested_changes: string[];
  duplicate_of: string | null;
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
  saved_detection_id: string | null;
  archived: boolean;
}

export interface DetectionOpportunity {
  id: string;
  title: string;
  description: string;
  detection: GeneratedDetection;
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
  library_already_covers_ids: string[];
  opportunities: DetectionOpportunity[];
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
