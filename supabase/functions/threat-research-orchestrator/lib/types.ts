// supabase/functions/threat-research-orchestrator/lib/types.ts
//
// Server-side mirror of src/types/threatResearch.ts. Kept in sync by hand.

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
  | 'tool_call' | 'tool_cache_hit'
  | 'library_match_found' | 'attack_research_completed';

/** MITRE ATT&CK Tactic (post-exploitation phases). NOT "kill chain phases". */
export type MitreTacticName =
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

/** The Knowledge Bundle is the Research Agent's full output: a complete
 *  intel picture organised by MITRE Tactic. Passed forward to BOTH the
 *  Attack Researcher (per-behaviour deep dive) and the Detection Engineer. */
export interface ResearchSubject {
  classification: ResearchInputClassification;
  subject: string;
  brief: string;
  intel_summary: {
    actor?: string;
    infrastructure?: string;
    victimology?: string;
    timing?: string;
    tooling?: string;
    attribution?: string;
  };
  citations: ResearchCitation[];
}

export interface PreflightSummary {
  existing_coverage_pct: number | null;
  covered_techniques: string[];
  gap_techniques: string[];
  skipped: boolean;
  ran_at: string;
}

/** When the Detection Engineer finds an existing detection in the user's
 *  library that already covers a behaviour (combined_score >= 0.75 by default),
 *  it sets `library_match` on the behaviour and skips generation entirely. The
 *  UI renders the leaf with a sage-green glow and a link to the existing
 *  detection. */
export interface LibraryMatch {
  existing_detection_id: string;
  name: string;
  query_language: string;
  combined_score: number;
  semantic_score: number;
  keyword_score: number;
}

/** The Attack Researcher's per-behaviour deep dive. Built once per behaviour. */
export interface AttackResearchDeepDive {
  how_it_works: string;
  controls_bypassed: string[];
  attacker_motivation: string;
  attacker_gain: string;
  success_signal: string;
  variants: string[];
  citations: ResearchCitation[];
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
  tactic: MitreTacticName;
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
  tactic: MitreTacticName;
  mitre_technique_ids: string[];
  data_sources: string[];
  artefacts: string[];
  citations: ResearchCitation[];

  /** The Attack Researcher's per-behaviour offensive deep dive. Filled by
   *  Phase 2 (one Attack Researcher invocation per behaviour). */
  deep_dive: AttackResearchDeepDive | null;

  /** When set, the user's library already covers this behaviour and the
   *  Detection Engineer did not generate a new detection. UI renders the
   *  leaf with a sage-green glow border. Mutually exclusive with
   *  `opportunities[]` populated content. */
  library_match: LibraryMatch | null;

  /** Detection Engineer's generated opportunities. Empty when library_match is set. */
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
