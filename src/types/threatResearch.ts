// src/types/threatResearch.ts
import { QUERY_LANGUAGES } from '../constants';

export type ResearchStatus =
  | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ResearchInputClassification =
  | 'cve' | 'group' | 'campaign' | 'technique' | 'concept';

export type ResearchAgent =
  | 'orchestrator' | 'preflight'
  | 'research' | 'attack-researcher' | 'planner' | 'detection-engineer' | 'qa';

export type ResearchEventType =
  | 'agent_started' | 'agent_iteration' | 'agent_tool_call' | 'agent_narration'
  | 'agent_completed' | 'agent_failed' | 'agent_validation_failed'
  | 'preflight_started' | 'preflight_completed'
  | 'behaviour_created' | 'opportunity_created' | 'detection_generated'
  | 'qa_verdict' | 'qa_refinement_started' | 'qa_refinement_completed'
  | 'session_completed' | 'session_cancelled' | 'session_failed' | 'job_failed'
  | 'tool_call' | 'tool_cache_hit'
  | 'library_match_found' | 'attack_research_completed'
  // Observability events (PR3-followup):
  | 'job_resumed' | 'finalise_gate_checked' | 'source_behaviour_drop'
  | 'planner_degraded'
  | 'agent_response_received' | 'agent_loop_exit' | 'worker_exit'
  | 'schema_validation_completed'
  | 'agent_model_call_start' | 'agent_model_call_debug'
  | 'agent_model_call_returned' | 'agent_post_response_checkpoint';

/** MITRE ATT&CK Tactic (post-exploitation phases). NOT "kill chain phases". */
export type MitreTacticName =
  | 'reconnaissance' | 'resource-development' | 'initial-access'
  | 'execution' | 'persistence' | 'privilege-escalation'
  | 'defense-evasion' | 'credential-access' | 'discovery'
  | 'lateral-movement' | 'collection' | 'command-and-control'
  | 'exfiltration' | 'impact';

export type FeasibilityVerdict = 'covered' | 'partial' | 'uncovered';

export type ResearchQueryLanguage = (typeof QUERY_LANGUAGES)[number];

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
  /** Number of detections matching the raw input via hybrid library search.
   *  Not a coverage metric — purely "you have N nearby detections". */
  library_hits: number;
  /** Distinct MITRE technique IDs mentioned in the matching detections. NOT
   *  a coverage claim — surface in UI as "techniques mentioned", never as
   *  "covered techniques". */
  techniques_seen_in_hits: string[];
  skipped: boolean;
  ran_at: string;
}

/** Existing-detection match in the user's library — the Detection Engineer
 *  surfaces this when a strong match exists (combined_score >= 0.6 by
 *  default; THREAT_RESEARCH_LIBRARY_MATCH_THRESHOLD overrides). UI renders
 *  the leaf with a sage-green glow border. */
export interface LibraryMatch {
  existing_detection_id: string;
  name: string;
  query_language: string;
  /** Lifecycle status of the matched library detection ('Production', 'Draft',
   *  'Deprecated', ...). Only a deployed rule counts as coverage; a Draft match
   *  is advisory and does not suppress generation. Optional for backward
   *  compatibility with sessions persisted before the field existed. */
  status?: string;
  combined_score: number;
  semantic_score: number;
  keyword_score: number;
}

/** Attack Researcher's per-behaviour offensive deep dive. */
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
  /**
   * Set by finalise cross-opportunity dedup, NOT by the QA agent. QA's
   * single-pass critique always leaves this null; finalise populates it
   * when two opportunities produce semantically-duplicate detections.
   */
  duplicate_of: string | null;
  /**
   * Always one entry under single-pass QA. Field kept for forward-compat.
   */
  iteration_history: QaIteration[];
  /**
   * Always 1 under single-pass QA.
   */
  iteration_count: number;
}

export interface GeneratedDetection {
  id: string;
  name: string;
  description: string;
  query_language: ResearchQueryLanguage;
  query: string;
  mitre_technique_ids: string[];
  /** Subset of mitre_technique_ids the post-step validator couldn't find in
   *  the canonical mitre_techniques table. UI flags with a warning. Optional
   *  for backward compatibility with sessions persisted before this field. */
  unverified_mitre_ids?: string[];
  tactic: MitreTacticName;
  suggested_severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';
  suggested_detection_type: 'Detection' | 'Hunting';
  feasibility: FeasibilityVerdict;
  feasibility_notes: string;
  citations: ResearchCitation[];
  covers_behaviour_ids: string[];
  /** Filled when the QA loop completed with any verdict (pass, pass_with_concerns,
   *  fail). Null when QA is pending. Distinct from `qa_error`: qa.verdict is a
   *  detection-quality judgement made by the QA agent; `qa_error` indicates the
   *  QA pipeline itself failed and never reached a verdict. UIs MUST render these
   *  two states differently. */
  qa: QaResult | null;
  /** Non-null when the QA pipeline failed for THIS detection (timeout, model
   *  error, iteration cap, budget exhaustion). Short reason string. The user
   *  should see "QA didn't run — retryable" rather than the misleading
   *  "QA judged this insufficient" badge the old code shipped. Optional for
   *  backward compatibility with sessions persisted before this field. */
  qa_error?: string | null;
  /** Set by the finalise cross-opportunity dedup pass when this detection is a
   *  semantic duplicate of another AND has no `qa` block to annotate. Kept off
   *  `qa` deliberately: synthesising a qa block to carry the duplicate would
   *  mean inventing a verdict the QA agent never gave, and resolveRowState
   *  reads qa.verdict first — so the leaf would render as "Passed with
   *  concerns" and become save-eligible without QA ever running. When `qa` IS
   *  present the duplicate lives on `qa.duplicate_of` instead; check both.
   *  Optional for backward compatibility with previously-persisted sessions. */
  duplicate_of?: string | null;
  /** A library detection that scored above the match threshold but did NOT
   *  count as coverage, so the engineer generated a new query anyway. Lets the
   *  detail card explain why the user is looking at a fresh query when their
   *  library already holds something adjacent — previously this decision only
   *  existed in the event log, which the card cannot reach. Optional for
   *  backward compatibility. */
  library_near_match?: LibraryNearMatch | null;
  saved_detection_id: string | null;
  archived: boolean;
}

/** Why a scoring library match was not treated as coverage.
 *   - `not_deployed`      the rule isn't in a status that counts as deployed
 *                         (a Draft rule detects nothing)
 *   - `language_mismatch` the rule targets a different SIEM than this session */
export type LibraryNearMatchReason = 'not_deployed' | 'language_mismatch';

export interface LibraryNearMatch {
  existing_detection_id: string;
  name: string;
  status: string;
  query_language: string;
  combined_score: number;
  skipped_reason: LibraryNearMatchReason;
  /** The session's target query language, for rendering "yours is KQL". */
  target_language: string;
}

/** PR2 planner status, surfaced on the session tree so the UI can show
 *  a "degraded" banner when the Opportunity Planner failed and the
 *  orchestrator fell back to 1:1 behaviour→opportunity (no dedup pass). */
export type PlannerStatus = 'completed' | 'degraded';

export interface DetectionOpportunity {
  id: string;
  title: string;
  description: string;
  // ─── PR2 planner-added fields ─────────────────────────────────────────
  // All optional so pre-PR2 sessions still type-check on the frontend.
  /** Ordered observable signals this opportunity catches. */
  observable_chain?: string[];
  /** Log sources / EDR signals this opportunity needs. */
  telemetry?: string[];
  /** MITRE technique IDs this opportunity covers. */
  mitre_technique_ids?: string[];
  /** Primary MITRE tactic. */
  tactic?: MitreTacticName;
  /** Behaviour this opportunity is physically attached to in the tree. */
  primary_behaviour_id?: string;
  /** All behaviours feeding this canonical opportunity (incl. primary). */
  source_behaviour_ids?: string[];
  /** Notes on how manifestations vary across source behaviours. */
  variants?: string[];
  /** Planner's verdict on detectability. */
  detectability?: DetectabilityVerdict;
  detectability_rationale?: string;
  detection: GeneratedDetection;
}

export interface AttackBehaviour {
  id: string;
  title: string;
  narrative_description: string;
  tactic: MitreTacticName;
  mitre_technique_ids: string[];
  /** Subset of mitre_technique_ids that aren't in mitre_techniques.
   *  Optional for backward compatibility with pre-validator sessions. */
  unverified_mitre_ids?: string[];
  /** Subset of mitre_technique_ids whose canonical tactic doesn't match
   *  this behaviour's tagged tactic — the Research Agent likely
   *  mis-classified. Optional for backward compatibility. */
  tactic_inconsistent_mitre_ids?: string[];
  data_sources: string[];
  artefacts: string[];
  citations: ResearchCitation[];
  /** Set true when behaviour comes from training knowledge with no source. */
  unsourced?: boolean;
  deep_dive: AttackResearchDeepDive | null;
  library_match: LibraryMatch | null;
  /** Behaviour-level detectability verdict + supporting fields. Optional for
   *  backward compatibility — pre-Phase-3 sessions don't have these. */
  detectability?: DetectabilityVerdict | null;
  detectability_rationale?: string | null;
  artefacts_required?: string[];
  opportunities: DetectionOpportunity[];
  /** PR2: composite "{primary_behaviour_id}/{opportunity_id}" references to
   *  canonical opportunities under OTHER behaviours that include this
   *  behaviour in their source_behaviour_ids. Lets the UI render
   *  "merged into N opportunities" instead of falsely showing
   *  not_detectable for a behaviour the planner correctly deduplicated.
   *  Optional for back-compat. */
  merged_into_opportunity_ids?: string[];
}

/** Where (if anywhere) a behaviour can be detected with current visibility.
 *  Mirrors the server-side type. `engineer_failed` is a SEPARATE state
 *  meaning the engineer agent loop crashed (budget/timeout/validation) —
 *  recoverable via retry, NOT a model verdict that the behaviour is
 *  undetectable. UI must render the two differently. */
export type DetectabilityVerdict =
  | 'siem' | 'edr' | 'needs_telemetry' | 'not_detectable' | 'engineer_failed';

/** Per-Tactic accounting from the Research Agent — exactly 14 entries. */
export interface TacticSummary {
  tactic: MitreTacticName;
  observed: boolean;
  rationale: string;
}

export interface ResearchOpenQuestion {
  agent: ResearchAgent;
  question: string;
  context: string;
}

/** A pre-existing detection in the user's library tagged with an alias of
 *  the threat being researched. Surfaced as explicit-coverage signal. */
export interface ActorCoverageSeedItem {
  id: string;
  name: string;
  severity: string | null;
  mitre_technique_ids: string[];
  matching_aliases: string[];
}

export interface ThreatResearchTree {
  subject: ResearchSubject | null;
  preflight: PreflightSummary | null;
  /** Walk-every-tactic accounting from the Research Agent. Optional for
   *  backward compatibility with sessions persisted before this field. */
  tactic_summary?: TacticSummary[];
  /** Library detections tagged with this actor's aliases — populated once
   *  after Research. Optional for backward compat with pre-Phase-4 sessions. */
  actor_coverage_seed?: ActorCoverageSeedItem[];
  /** PR2 Opportunity Planner outcome.
   *    'completed' — planner ran and produced canonical opportunities.
   *    'degraded' — planner failed; orchestrator fell back to 1:1
   *                 behaviour→opportunity. UI MUST surface a banner so
   *                 the user knows the output isn't deduplicated.
   *  Optional for back-compat with pre-PR2 sessions. */
  planner_status?: PlannerStatus | null;
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
  /** Per-session budget consumption + caps. Tracked atomically by the
   *  worker via tr_consume_budget and exposed here so the UI can render
   *  "X / Y model calls" so users can attribute failures (was the leaf
   *  out of budget? Or did the model fail validation?). */
  model_calls_used: number | null;
  model_call_cap: number | null;
  tool_call_cap: number | null;
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
