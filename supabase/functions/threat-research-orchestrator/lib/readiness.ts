// supabase/functions/threat-research-orchestrator/lib/readiness.ts
//
// What state is a detection actually in, and is it safe to ship?
//
// THE PROBLEM THIS SOLVES
//
// The finalise gate counted a detection as usable only if it was a library
// match or carried a pass / pass_with_concerns verdict. Anything whose QA call
// errored was discarded — including detections with a real, working query that
// had already been generated and paid for.
//
// Session bc5804b3: 1.17M tokens, 10 queries generated, six QA errors, ONE
// delivered. An earlier session reported
// "11 detections (0 library / 0 pass / 0 pass+concerns / 0 fail / 6 qa_error)
//  — SESSION FAILED: no usable detections"
// while holding eleven queries it had just written.
//
// But the naive fix — "a query is a query, count them all" — recreates the
// dishonesty from the other side. Session 793cafab reported success on five
// library matches while credit exhaustion killed the actual work.
//
// So preservation and readiness are separated. Nothing generated is thrown
// away, and nothing unreviewed is called production-ready. Four independent
// axes, derived HERE, server-side, once:
//
//   artifact   what exists            generated | library_reused | generation_failed
//   review     what QA concluded      unreviewed | revised_unverified | pass |
//                                     pass_with_concerns | fail
//   readiness  what a user may do     draft | needs_review | production_candidate
//   (session execution status is decided by the finalise gate)
//
// Deriving readiness in one place is the point. resolveRowState in
// ResearchList and the branches in DetectionLeafCard already disagree about
// what a leaf means; adding fields without a single source of truth would give
// that drift three more places to hide.

export type ArtifactState = 'generated' | 'library_reused' | 'generation_failed';

export type ReviewState =
  | 'unreviewed'          // QA never reached a verdict — pipeline error, not a judgement
  | 'revised_unverified'  // engineer revised after a fail; the revision was never re-critiqued
  | 'pass'
  | 'pass_with_concerns'
  | 'fail';

export type ReadinessState =
  | 'draft'                 // not shippable: no query, or QA judged it wrong
  | 'needs_review'          // real query, but no trustworthy verdict — a human must look
  | 'production_candidate'; // query plus a verdict that stands behind it

/** The subset of a generated detection this derivation depends on. Kept
 *  structural rather than importing GeneratedDetection so the module stays
 *  free of the type twins and can be unit tested in isolation. */
export interface DetectionLike {
  query?: string | null;
  saved_detection_id?: string | null;
  reused_from_library?: boolean | null;
  qa_error?: string | null;
  qa?: { verdict?: string | null } | null;
  /** Set when the engineer revised after a fail verdict. */
  revised_after_fail?: boolean | null;
}

export interface DetectionStates {
  artifact: ArtifactState;
  review: ReviewState;
  readiness: ReadinessState;
}

function hasQuery(det: DetectionLike): boolean {
  return typeof det.query === 'string' && det.query.trim().length > 0;
}

export function deriveArtifactState(det: DetectionLike): ArtifactState {
  if (det.reused_from_library || det.saved_detection_id) return 'library_reused';
  // engineer_failed is the one qa_error that means "no artifact was produced",
  // as opposed to "an artifact exists but QA could not judge it".
  if (det.qa_error === 'engineer_failed' || !hasQuery(det)) return 'generation_failed';
  return 'generated';
}

export function deriveReviewState(det: DetectionLike): ReviewState {
  const verdict = det.qa?.verdict;
  // A revision that shipped without re-critique is NOT covered by the verdict
  // that triggered it. Persisting the stale 'fail' meant a repaired detection
  // read as broken and was then excluded from the usable count — punished
  // twice for having been fixed.
  if (det.revised_after_fail) return 'revised_unverified';
  if (verdict === 'pass' || verdict === 'pass_with_concerns' || verdict === 'fail') {
    return verdict;
  }
  // qa_error, or no QA at all. Either way no judgement was reached.
  return 'unreviewed';
}

export function deriveReadiness(artifact: ArtifactState, review: ReviewState): ReadinessState {
  if (artifact === 'generation_failed') return 'draft';

  // A reused library rule is the user's own existing content. This pipeline
  // did not write it and does not re-judge it; its own lifecycle status
  // governs. Treating it as needing review would tell users to re-approve
  // rules they already run.
  if (artifact === 'library_reused') return 'production_candidate';

  switch (review) {
    case 'pass':
    case 'pass_with_concerns':
      // pass_with_concerns is explicitly shippable — concerns are surfaced for
      // a human, not a veto. It is also, empirically, the verdict essentially
      // every generated detection receives, so excluding it would leave the
      // product unable to ever produce a candidate.
      return 'production_candidate';
    case 'fail':
      return 'draft';
    case 'revised_unverified':
    case 'unreviewed':
      // The query exists and is kept. What is missing is a trustworthy
      // judgement, and that is a human's call, not something to assume either
      // way.
      return 'needs_review';
  }
}

export function deriveDetectionStates(det: DetectionLike): DetectionStates {
  const artifact = deriveArtifactState(det);
  const review = deriveReviewState(det);
  return { artifact, review, readiness: deriveReadiness(artifact, review) };
}

export interface SessionYield {
  total: number;
  productionCandidates: number;
  needsReview: number;
  drafts: number;
  /** Anything the pipeline produced and did not throw away: candidates plus
   *  the ones awaiting a human. This is what "did the session achieve
   *  anything" should mean. */
  preserved: number;
}

export function summariseYield(detections: readonly DetectionLike[]): SessionYield {
  let productionCandidates = 0;
  let needsReview = 0;
  let drafts = 0;
  for (const det of detections) {
    switch (deriveDetectionStates(det).readiness) {
      case 'production_candidate': productionCandidates++; break;
      case 'needs_review':         needsReview++;          break;
      case 'draft':                drafts++;               break;
    }
  }
  return {
    total: detections.length,
    productionCandidates,
    needsReview,
    drafts,
    preserved: productionCandidates + needsReview,
  };
}

/** Session execution status.
 *
 *  `partial` is the state the pipeline could not previously express, and its
 *  absence is why runs lied in both directions: a session with ten usable
 *  queries and six QA errors was reported as a total failure, and one whose
 *  real work died on credit exhaustion was reported as a success because five
 *  library look-ups survived.
 *
 *  A session is only `completed` when everything it produced is ready to act
 *  on. If it preserved work that still needs a human, it is `partial` — and it
 *  says so, rather than picking whichever adjacent story is more flattering. */
export type SessionExecutionStatus = 'completed' | 'partial' | 'failed';

export function deriveSessionStatus(y: SessionYield): SessionExecutionStatus {
  if (y.preserved === 0) return 'failed';
  if (y.needsReview > 0 || y.drafts > 0) return 'partial';
  return 'completed';
}
