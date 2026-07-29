// src/types/threatResearch.ts
import { QUERY_LANGUAGES } from '../constants';

/** `partial` means the session preserved real work but some of it still needs
 *  a human verdict — the state the pipeline could not express before, which is
 *  why it reported ten usable queries as a total failure (bc5804b3) and a
 *  credit-exhausted run as a success (793cafab). Treat it as a success with
 *  outstanding review, not as an error. */
export type ResearchStatus =
  | 'pending' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';

export type ResearchInputClassification =
  | 'cve' | 'group' | 'campaign' | 'technique' | 'concept';

export type ResearchAgent =
  | 'orchestrator' | 'preflight'
  // 'dossier' is retained only for events written during the short-lived
  // 2026-07-29 merged-agent rollout.
  // New sessions emit research + attack-researcher.
  | 'dossier' | 'research' | 'attack-researcher'
  | 'planner' | 'detection-engineer' | 'qa';

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

/** Existing-detection match in the user's library. Reuse requires both the
 *  configured similarity score and MITRE overlap with the opportunity. */
export interface LibraryMatch {
  existing_detection_id: string;
  name: string;
  query_language: string;
  /** Lifecycle status of the matched library detection ('Production', 'Draft',
   *  'Deprecated', ...). Display only — it tells the user where the rule lives,
   *  it does not decide whether the rule is reused. Optional for backward
   *  compatibility with sessions persisted before the field existed. */
  status?: string;
  /** The existing rule's query body, so a reused leaf renders the actual rule.
   *  Optional for back-compat with sessions persisted before the field. */
  detection_query?: string;
  /** Technique ids on the existing rule. Optional for sessions created
   *  before the technique-overlap reuse gate. */
  mitre_technique_ids?: string[];
  combined_score: number;
  semantic_score: number;
  keyword_score: number;
}

/** Per-behaviour offensive deep dive, produced by the Attack Researcher phase. */
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

/** One candidate query for a detection.
 *
 *  Detections used to hold a single mutable `query`. When QA returned `fail`
 *  the engineer's revision REPLACED it, with no second critique and only a
 *  fenced-block parser between the model and the shipped artefact. A wrong
 *  fail therefore destroyed the better detector, irreversibly.
 *
 *  The realistic case is not exotic. A broad, useful primitive --
 *
 *    DeviceProcessEvents | where FileName =~ "mshta.exe"
 *    | where ProcessCommandLine has_any ("http://", "https://")
 *
 *  -- can be "improved" into remote-MSHTA AND explorer parent AND PowerShell
 *  child AND network event. Higher fidelity, and it now detects exactly one
 *  ClickFix chain while missing generic remote MSHTA abuse. The original was
 *  the better detection primitive and there was no way back to it.
 *
 *  Both are kept now, and the analyst chooses. Automatic QA revision is a
 *  PROPOSAL, never a destructive overwrite. */
export interface DetectionCandidateVersion {
  /** 1-based. Version 1 is always the engineer's initial generation. */
  version: number;
  query: string;
  source: 'generated' | 'qa_revision';
  created_at: string;
  /** The verdict that prompted this version. Null on version 1, which
   *  predates any critique. */
  prompted_by_verdict?: QaVerdict | null;
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
  /** True when QA returned `fail` and the engineer applied its suggested
   *  changes. The `qa` block still holds the ORIGINAL failing verdict -- that
   *  is the last judgement anything actually made, and inventing a passing one
   *  would be fabrication -- but it no longer describes the query that
   *  shipped. This flag marks that gap so the detection derives as
   *  `revised_unverified` / `needs_review` rather than being read as broken
   *  and then excluded from the session's usable count: punished twice for
   *  having been repaired. */
  revised_after_fail?: boolean | null;
  /** Every candidate query produced for this detection, oldest first. A
   *  revision APPENDS; it never overwrites. Optional so the 31 sessions
   *  persisted before versioning still load. */
  candidate_versions?: DetectionCandidateVersion[];
  /** Which version `query` currently mirrors. Readers that only understand
   *  `query` keep working unchanged; readers that understand versions can
   *  offer the analyst the alternative. */
  active_version?: number;
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
  /** True when `saved_detection_id` was set by the reuse-first short-circuit
   *  (Amendment 1) pointing this leaf at an existing library rule, rather
   *  than by the user saving a freshly-generated detection this session.
   *  Optional for back-compat with sessions persisted before this field
   *  existed. */
  reused_from_library?: boolean;
  archived: boolean;
  /** Findings from the deterministic (non-LLM) validators run after
   *  generation: telemetry-feasibility, sigma-syntax, citation-check, mitre.
   *  Keyed by validator name, value is a human-readable finding string.
   *  Absent or empty means all validators ran clean (or didn't apply).
   *  Advisory only — never blocks a detection from shipping. */
  validator_findings?: Record<string, string>;
}

/** Why a scoring library match was not treated as coverage.
 *   - `not_deployed`      the rule isn't in a status that counts as deployed
 *                         (a Draft rule detects nothing)
 *   - `language_mismatch` the rule targets a different SIEM than this session */
/** Why a library hit did not replace generating a new detection. All four
 *  are shown to the user, because "there is a rule for this but it is a Draft"
 *  and "there is a rule for this but it is written in SPL" are different
 *  problems with different fixes. */
export type LibraryNearMatchReason =
  | 'not_deployed'
  | 'language_mismatch'
  | 'no_query_body'
  | 'technique_mismatch';

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
