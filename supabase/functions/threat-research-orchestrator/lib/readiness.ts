// supabase/functions/threat-research-orchestrator/lib/readiness.ts
//
// What state is a detection in, and can the user act on it?
//
// THE MODEL
//
// The engineer's query IS the deliverable. Nothing machine-reviews it before the
// user sees it, and that is deliberate.
//
// A QA agent used to sit here. Session 7382a9c2 is why it doesn't: it returned
// pass_with_concerns on all seven detections while fabricating schema facts --
// asserting that DeviceProcessEvents.FolderPath excludes the filename (it does
// not) and that doubled quotes terminate a KQL verbatim string early (they escape
// it). Acting on either would have broken a working rule. It also produced real
// findings in the same breath, which is the actual problem: a reviewer that
// invents defects as confidently as it finds them cannot be told apart from one
// that only finds them, so every concern has to be re-checked by hand and the
// review buys nothing.
//
// The telemetry-feasibility gate went with it. It compared the planner's
// free-text telemetry prose against environment_profiles labels by word overlap,
// so whether a detection shipped turned on whether its phrasing happened to
// contain "sysmon". It blocked three of the same seven -- two of which described
// their own requirement as optional.
//
// What survives is deterministic and narrow: the Defender schema check in
// handleDetection, which runs only where a schema actually exists in the
// database. Its findings are surfaced on the detection (feasibility_notes) for a
// human to weigh; they do not gate. Where there is no schema for a product, the
// model's output is taken as given rather than guessed at.
//
// So one question decides everything here: did the engineer produce a query?
//
//   artifact   what exists          generated | library_reused | generation_failed
//   readiness  what a user may do   draft | production_candidate
//   (session execution status is decided by the finalise gate)
//
// Deriving this in one place is still the point. resolveRowState in ResearchList
// and the branches in DetectionLeafCard have disagreed before about what a leaf
// means; a single source of truth is what keeps them from drifting again.

export type ArtifactState = 'generated' | 'library_reused' | 'generation_failed';

export type ReadinessState =
  | 'draft'                 // nothing to act on: the engineer produced no query
  | 'production_candidate'; // a query exists; the user decides whether to keep it

/** The subset of a generated detection this derivation depends on. Kept
 *  structural rather than importing GeneratedDetection so the module stays
 *  free of the type twins and can be unit tested in isolation. */
export interface DetectionLike {
  query?: string | null;
  saved_detection_id?: string | null;
  reused_from_library?: boolean | null;
  /** Historical field. Sessions that predate the QA removal carry pipeline
   *  error strings here. Only 'engineer_failed' still means anything: it is
   *  written by the current pipeline when generation itself produced nothing. */
  qa_error?: string | null;
}

export interface DetectionStates {
  artifact: ArtifactState;
  readiness: ReadinessState;
}

function hasQuery(det: DetectionLike): boolean {
  return typeof det.query === 'string' && det.query.trim().length > 0;
}

export function deriveArtifactState(det: DetectionLike): ArtifactState {
  if (det.reused_from_library || det.saved_detection_id) return 'library_reused';
  // engineer_failed is the one qa_error that means "no artifact was produced",
  // as opposed to a historical judgement about one that was.
  if (det.qa_error === 'engineer_failed' || !hasQuery(det)) return 'generation_failed';
  return 'generated';
}

export function deriveReadiness(artifact: ArtifactState): ReadinessState {
  // The only thing that makes a detection unusable is not having one. A query
  // the user might reject is still a query the user gets to look at, and
  // deciding that for them is what the removed QA layer was doing wrong.
  if (artifact === 'generation_failed') return 'draft';
  return 'production_candidate';
}

export function deriveDetectionStates(det: DetectionLike): DetectionStates {
  const artifact = deriveArtifactState(det);
  return { artifact, readiness: deriveReadiness(artifact) };
}

export interface SessionYield {
  total: number;
  productionCandidates: number;
  drafts: number;
  /** Anything the pipeline produced and did not throw away. This is what "did
   *  the session achieve anything" should mean. */
  preserved: number;
}

export function summariseYield(detections: readonly DetectionLike[]): SessionYield {
  let productionCandidates = 0;
  let drafts = 0;
  for (const det of detections) {
    switch (deriveDetectionStates(det).readiness) {
      case 'production_candidate': productionCandidates++; break;
      case 'draft':                drafts++;               break;
    }
  }
  return {
    total: detections.length,
    productionCandidates,
    drafts,
    preserved: productionCandidates,
  };
}

/** Session execution status.
 *
 *  `partial` exists because a run can half-succeed, and saying so beats picking
 *  whichever adjacent story is more flattering. Two real failures came from not
 *  having it: a session holding ten usable queries reported total failure
 *  because their QA calls errored, and one whose real work died on credit
 *  exhaustion reported success because five library look-ups survived.
 *
 *  A session is `completed` when every opportunity yielded a query. If some
 *  opportunities produced nothing, it is `partial` -- there is real output, and
 *  there is also work that did not happen. */
export type SessionExecutionStatus = 'completed' | 'partial' | 'failed';

export function deriveSessionStatus(y: SessionYield): SessionExecutionStatus {
  if (y.preserved === 0) return 'failed';
  if (y.drafts > 0) return 'partial';
  return 'completed';
}
