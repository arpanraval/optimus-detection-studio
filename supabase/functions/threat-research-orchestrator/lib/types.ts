// supabase/functions/threat-research-orchestrator/lib/types.ts
//
// Server-side mirror of src/types/threatResearch.ts. Kept in sync by hand.

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
  // Observability additions (PR3-followup):
  //   job_resumed              — emitted when a worker claims a job with
  //                              attempt_count > 1 (i.e. reaper reset it
  //                              from a prior failed/stuck attempt)
  //   finalise_gate_checked    — emitted every time the finalise gate is
  //                              queried; payload includes fired flag,
  //                              reason, detection/qa pending counts
  //   source_behaviour_drop    — emitted when handleDetection's source
  //                              behaviour resolution finds fewer
  //                              behaviours than the opportunity refers to
  //                              (planner output → tree mismatch)
  | 'job_resumed' | 'finalise_gate_checked' | 'source_behaviour_drop'
  // High-signal orchestration events worth their own dot in the UI:
  | 'planner_degraded'
  // Visibility additions (2026-05-21): make "worker died silently" impossible.
  //   agent_response_received  — emitted after every callAnthropic return.
  //                              Captures text_length, tool_uses_count,
  //                              text_preview, token usage. Pairs with
  //                              agent_iteration so we can see what came
  //                              back vs what was asked.
  //   agent_loop_exit          — emitted unconditionally at EVERY exit path
  //                              of runAgentLoop (success / cap / budget /
  //                              throw). Always paired with the existing
  //                              agent_completed / agent_failed events.
  //   worker_exit              — emitted from a finally block wrapping
  //                              runJob's entire body. exit_kind ∈
  //                              {returned, threw, unknown}. If we don't
  //                              see worker_exit, the platform killed the
  //                              isolate.
  //   schema_validation_completed — Defender XDR KQL post-engineer findings.
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
  /** Number of detections in the user's library whose hybrid (vector +
   *  keyword) match against the raw input scored above the floor. NOT a
   *  coverage measure — these are just detections that are TEXTUALLY similar
   *  to the input. Surfaced informationally so the user knows the library
   *  has *something* in this neighbourhood. */
  library_hits: number;
  /** Distinct MITRE technique IDs MENTIONED in the matching library
   *  detections' tags. Does NOT mean the user has coverage of those
   *  techniques — a low-quality or archived detection mentioning T1059 is
   *  still mentioned here. UI must label this honestly ("mentioned in
   *  matching detections", not "covered"). */
  techniques_seen_in_hits: string[];
  skipped: boolean;
  ran_at: string;
}

/** When the Detection Engineer finds an existing detection in the user's
 *  library for an opportunity (combined_score >= 0.6 by default;
 *  THREAT_RESEARCH_LIBRARY_MATCH_THRESHOLD overrides), the leaf is pointed at
 *  that rule via `saved_detection_id` and generation is skipped — regardless
 *  of the rule's status or query language. The UI renders the leaf with a
 *  sage-green glow and a link to the existing detection. */
export interface LibraryMatch {
  existing_detection_id: string;
  name: string;
  query_language: string;
  /** Lifecycle status of the matched library detection ('Production', 'Draft',
   *  'Deprecated', ...). DISPLAY ONLY — it tells the user where the rule lives
   *  and feeds the 'covered' vs 'partial' label, but it never decides whether
   *  the rule is reused. Reuse is unconditional; see Amendment 1 in
   *  docs/plans/2026-07-28-threat-research-remediation-plan.md. */
  status: string;
  /** The existing rule's query body, so a reused leaf can render the actual
   *  rule instead of an empty code block. Empty when the row has no query. */
  detection_query: string;
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
  /**
   * The id of an existing library or research detection this candidate
   * duplicates. NEVER set by the QA agent — dedup is the responsibility of
   * the Opportunity Planner (upstream conceptual dedup), the library-match
   * phase (per-opp library lookup), and the finalise cross-opportunity
   * dedup pass (semantic post-hoc check). QA leaves this null; finalise
   * populates it when a semantic duplicate is detected across opportunities.
   */
  duplicate_of: string | null;
  /**
   * Always one entry under single-pass QA. Field kept for forward-compat
   * if multi-round critique is ever reinstated for a specific workflow.
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
  /** Subset of mitre_technique_ids that aren't in mitre_techniques. UI flags. */
  unverified_mitre_ids: string[];
  tactic: MitreTacticName;
  suggested_severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';
  suggested_detection_type: 'Detection' | 'Hunting';
  feasibility: FeasibilityVerdict;
  feasibility_notes: string;
  citations: ResearchCitation[];
  covers_behaviour_ids: string[];
  /** Filled when the QA loop completed (with any verdict — pass, pass_with_concerns,
   *  fail). Null when QA is pending or didn't run. Mutually informative with qa_error:
   *  qa_error != null means the QA *pipeline* failed (timeout, validation cap,
   *  model error) — that is NOT the same as QA returning verdict:'fail'. UIs should
   *  render qa_error distinctly so the user understands "QA didn't run, retryable"
   *  vs "QA judged this detection insufficient". */
  qa: QaResult | null;
  /** Non-null when the QA pipeline failed for THIS detection. The string is a
   *  short reason like 'iteration_cap', 'model_budget_exhausted', 'anthropic_failed'.
   *  This is a pipeline state, not a detection-quality verdict. Don't conflate
   *  with qa.verdict='fail'. */
  qa_error: string | null;
  /** Set by the finalise cross-opportunity dedup pass when this detection is a
   *  semantic duplicate of another AND has no `qa` block to annotate. The
   *  duplicate signal has to live somewhere that is not `qa`, because
   *  synthesising a qa block here would mean inventing a verdict the QA agent
   *  never gave — which the UI then renders as if QA had passed the detection.
   *  When `qa` IS present, the duplicate is recorded on `qa.duplicate_of`
   *  instead. Readers should check both. */
  duplicate_of?: string | null;
  /** A library detection that scored above the match threshold but did NOT
   *  count as coverage, so generation went ahead anyway. Persisted on the leaf
   *  (rather than left in the event log) so the detail card can explain why the
   *  user is looking at a freshly-written query when their library already has
   *  something adjacent. Null/absent when there was no near-match. */
  library_near_match?: LibraryNearMatch | null;
  saved_detection_id: string | null;
  archived: boolean;
}

/** Why a scoring library match was not treated as coverage.
 *
 *  CURRENTLY UNREACHABLE. Under reuse-first (Amendment 1) every match above
 *  the threshold is reused, so no near-match is ever constructed. The type is
 *  retained because sessions persisted before that change still carry
 *  `library_near_match` on their leaves and the UI must keep rendering them. */
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

export interface DetectionOpportunity {
  id: string;
  title: string;
  description: string;
  // ─── Fields populated by the Opportunity Planner (PR2) ────────────────
  // All optional for back-compat with pre-PR2 sessions (cancelled by the
  // 20260518a hard-cutover, but kept loose in the type for safety).
  /** Ordered list of observable signals this opportunity catches. The
   *  detection-engineering equivalent of the behaviour's narrative — but
   *  scoped to ONE detection. Example: ["AF_ALG socket() syscall",
   *  "splice() with O_TMPFILE", "execve bash with euid=0"]. */
  observable_chain?: string[];
  /** Log sources / EDR signals the detection needs. Used by library
   *  search at opportunity level (instead of behaviour-text search). */
  telemetry?: string[];
  /** MITRE technique IDs this opportunity covers. */
  mitre_technique_ids?: string[];
  /** Primary MITRE tactic. */
  tactic?: MitreTacticName;
  /** The behaviour this opportunity is physically attached to in the tree.
   *  When multiple behaviours feed one canonical opportunity, primary is
   *  the lowest-numbered / most specific. */
  primary_behaviour_id?: string;
  /** Every behaviour that contributed to this canonical opportunity,
   *  including the primary. The Detection Engineer reads this to know
   *  what context to consider; finalise-time UI surfaces it. */
  source_behaviour_ids?: string[];
  /** When multiple source_behaviour_ids contribute, notes on how the
   *  manifestations vary across them. Empty when only one source. */
  variants?: string[];
  /** Planner's verdict on whether this opportunity is detectable. The
   *  Detection Engineer can refine this but typically inherits it. */
  detectability?: DetectabilityVerdict;
  detectability_rationale?: string;
  detection: GeneratedDetection;
}

/** Where (if anywhere) this behaviour can be detected with current
 *  visibility:
 *   - `siem`            log-source-detectable (Sysmon, DeviceProcessEvents,
 *                       FW logs, etc. — defender already has the data)
 *   - `edr`             only catchable at the endpoint with EDR telemetry
 *                       (in-memory state, kernel-level events, behavioural
 *                       sensors)
 *   - `needs_telemetry` detectable in principle but the data source isn't
 *                       in this customer's environment (e.g. needs DNS
 *                       request logs that aren't ingested today)
 *   - `not_detectable`  no observable signal — pure operator skill, social
 *                       engineering on the user's own clipboard, etc. The
 *                       detection report should still emit this verdict; an
 *                       analyst seeing "not detectable" is intelligence too.
 */
// `engineer_failed` is a SEPARATE state from `not_detectable`. The model
// uses `not_detectable` when it ran successfully and concluded no signal
// is available; `engineer_failed` is set when the agent loop itself
// failed (timeout, budget, validation cap) — the behaviour is recoverable
// via retry, not a real verdict. UI must render the two differently.
export type DetectabilityVerdict =
  | 'siem' | 'edr' | 'needs_telemetry' | 'not_detectable' | 'engineer_failed';

export interface AttackBehaviour {
  id: string;
  title: string;
  narrative_description: string;
  tactic: MitreTacticName;
  mitre_technique_ids: string[];
  /** Subset of mitre_technique_ids that don't exist in the canonical
   *  mitre_techniques table — model may have hallucinated them. UI surfaces
   *  with a warning badge. Empty array means all IDs validated. */
  unverified_mitre_ids: string[];
  /** Subset of mitre_technique_ids whose canonical tactics in
   *  mitre_techniques don't include this behaviour's tagged tactic — the
   *  Research Agent likely mis-classified the behaviour. UI surfaces with
   *  a "tactic mismatch" badge. Empty array means all IDs are tactic-
   *  consistent (or are unverified, in which case they appear in
   *  unverified_mitre_ids and aren't double-flagged here). */
  tactic_inconsistent_mitre_ids: string[];
  data_sources: string[];
  artefacts: string[];
  citations: ResearchCitation[];
  /** When true, the Research Agent declared this behaviour comes from
   *  training knowledge, not a specific source. Replaces the implicit
   *  "training-backed" loophole — an unsourced claim is now distinguishable
   *  from a sourced one downstream. */
  unsourced: boolean;

  /** The Attack Researcher's per-behaviour offensive deep dive. Filled by
   *  Phase 2 (one Attack Researcher invocation per behaviour). */
  deep_dive: AttackResearchDeepDive | null;

  /** When set, the user's library already covers this behaviour and the
   *  Detection Engineer did not generate a new detection. UI renders the
   *  leaf with a sage-green glow border. Mutually exclusive with
   *  `opportunities[]` populated content. */
  library_match: LibraryMatch | null;

  /** Detection Engineer's per-behaviour verdict on whether the customer
   *  can detect this with their current telemetry. Filled in Phase 3.
   *  Null until Phase 3 has run. */
  detectability: DetectabilityVerdict | null;
  /** Free-text rationale for the verdict — what's observable, what's
   *  missing, what the trade-offs are. Filled with `detectability`. */
  detectability_rationale: string | null;
  /** Concrete data sources / fields the detection assumes (e.g.
   *  "DeviceProcessEvents.ProcessCommandLine", "Sysmon EID 1 with full
   *  command-line capture", "DNS query logs with QType=TXT"). Lets an
   *  analyst quickly see whether their stack supports the detection. */
  artefacts_required: string[];

  /** Detection Engineer's generated opportunities — one per independently
   *  observable signal, no count cap. Empty when `library_match` is set,
   *  empty when `detectability === 'not_detectable'`. */
  opportunities: DetectionOpportunity[];
  /** PR2: composite "{primary_behaviour_id}/{opportunity_id}" references to
   *  canonical opportunities under OTHER behaviours that include this
   *  behaviour in their source_behaviour_ids. Without this, a behaviour that
   *  the Opportunity Planner correctly merged into another behaviour's
   *  canonical opportunity would render as not_detectable — falsely
   *  reporting coverage loss. Optional for back-compat. */
  merged_into_opportunity_ids?: string[];
}

export interface ResearchOpenQuestion {
  agent: ResearchAgent;
  question: string;
  context: string;
}

/** Per-Tactic accounting from the Research Agent. There are exactly 14 of
 *  these (one per MITRE ATT&CK Tactic). Captures whether the threat operates
 *  in that Tactic AND why — even an `observed: false` row is intelligence
 *  ("attacker doesn't establish persistence at delivery stage" is itself
 *  useful). Renders as a column / lane in the canvas so the user sees the
 *  full kill-chain walk, not just the cells with content. */
export interface TacticSummary {
  tactic: MitreTacticName;
  observed: boolean;
  rationale: string;
}

/** A pre-existing detection in the user's library tagged with an alias of
 *  the threat being researched. Surfaced as explicit-coverage signal to the
 *  Detection Engineer so it can avoid duplicating work that's already done. */
export interface ActorCoverageSeedItem {
  id: string;
  name: string;
  severity: string | null;
  mitre_technique_ids: string[];
  /** Which actor aliases on the detection's `tags` array matched. Useful
   *  for explaining "why is this here" in the UI. */
  matching_aliases: string[];
}

export type PlannerStatus = 'completed' | 'degraded';

export interface ThreatResearchTree {
  subject: ResearchSubject | null;
  preflight: PreflightSummary | null;
  /** Walk-every-Tactic accounting. Empty (legacy) or exactly 14 entries. */
  tactic_summary: TacticSummary[];
  /** Detections in the library whose tags match an alias of this threat
   *  actor/campaign. Populated once after Research, used as context by the
   *  Detection Engineer. Empty for non-actor threats (CVEs, generic concepts). */
  actor_coverage_seed?: ActorCoverageSeedItem[];
  /** Opportunity-planner outcome for this session.
   *    'completed' — planner produced canonical opportunities (normal path).
   *    'degraded' — planner failed; orchestrator fell back to 1:1
   *                 behaviour→opportunity. UI should surface a banner so the
   *                 user knows the output isn't deduplicated and may contain
   *                 the AF_ALG-style duplicates the planner exists to merge.
   *  Optional for back-compat with pre-PR2 sessions (cancelled by the
   *  20260518a hard-cutover, but kept loose in the type for safety). */
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
