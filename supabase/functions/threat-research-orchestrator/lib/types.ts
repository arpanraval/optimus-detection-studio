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
  | 'agent_completed' | 'agent_failed' | 'agent_validation_failed'
  | 'preflight_started' | 'preflight_completed'
  | 'behaviour_created' | 'opportunity_created' | 'detection_generated'
  | 'qa_verdict' | 'qa_refinement_started' | 'qa_refinement_completed'
  | 'session_completed' | 'session_cancelled' | 'session_failed' | 'job_failed'
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
  /** Subset of mitre_technique_ids that aren't in mitre_techniques. UI flags. */
  unverified_mitre_ids: string[];
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

export interface ThreatResearchTree {
  subject: ResearchSubject | null;
  preflight: PreflightSummary | null;
  /** Walk-every-Tactic accounting. Empty (legacy) or exactly 14 entries. */
  tactic_summary: TacticSummary[];
  /** Detections in the library whose tags match an alias of this threat
   *  actor/campaign. Populated once after Research, used as context by the
   *  Detection Engineer. Empty for non-actor threats (CVEs, generic concepts). */
  actor_coverage_seed?: ActorCoverageSeedItem[];
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
