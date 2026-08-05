// supabase/functions/threat-research-orchestrator/lib/coverage.ts
//
// When does an existing library detection replace writing a new one?
//
// Two questions, kept apart on purpose:
//
//   1. IS THIS RULE ABOUT THIS OPPORTUNITY?  — decided by adjudicateReuse, and
//      the only thing that may suppress generation. MITRE overlap, a real query
//      body, a runnable language, observable containment.
//   2. WHAT IS THE USER GETTING?  — described by isDeployedCoverage. A reused
//      Draft is still reuse; it is just not deployed coverage, and the leaf says
//      so via feasibility 'partial' rather than 'covered'.
//
// Status answers (2), not (1). Making it answer (1) is a mistake this file has
// made twice: against an imported library that is 4,576 KQL rules with exactly
// one marked Production, `Production AND KQL` is unsatisfiable, and reuse simply
// never fires for Microsoft-shop customers. See adjudicateReuse for the numbers.
//
// The library search itself is deliberately NOT filtered (handleLibrarySearch
// passes no p_status to hybrid_search_detections): we want near-matches in any
// status to stay visible so the engineer can reference them and the UI can
// explain itself. The adjudication happens here, after the fact.
//
// Precision still matters. The OR-tokenized tsquery (migration 20260521150000)
// plus the match threshold dropping 0.75 -> 0.6 (20260520120000) made weak
// matches easier to hit, which is why observable containment — not status —
// is what now stops a loosely-related rule from suppressing real work.
//
// Kept in its own module — with no Deno or esm.sh imports — so it is unit
// testable. detection-engineer.ts pulls in the Supabase client transitively and
// cannot be loaded by vitest.

/** Library statuses that count as real coverage. A Set so adding e.g.
 *  'Testing' later is a one-line change. */
export const COVERAGE_STATUSES: ReadonlySet<string> = new Set(['Production']);

/** True when a library match is deployed and therefore counts as coverage.
 *
 *  Case-insensitive: `status` is effectively free text and imported libraries
 *  have been seen using 'production'. An empty or unrecognised status is NOT
 *  coverage — fail open to generating a detection rather than claim coverage
 *  we cannot prove. */
export function isDeployedCoverage(match: { status?: string | null } | null | undefined): boolean {
  const status = match?.status;
  if (!status) return false;
  const needle = status.toLowerCase();
  for (const s of COVERAGE_STATUSES) {
    if (s.toLowerCase() === needle) return true;
  }
  return false;
}

/** True when a library match is runnable in the session's target SIEM.
 *
 *  Two deliberate escape hatches, both preserved from the original inline
 *  implementation in handleDetection:
 *    - an unknown match language returns false (fall through to generation
 *      rather than veto on low confidence)
 *    - an unresolved session language accepts the match (better than failing
 *      closed when we don't know what the user runs) */
export function isLanguageRunnable(
  match: { query_language?: string | null } | null | undefined,
  targetLanguage: string | null | undefined,
): boolean {
  if (!match) return false;
  if (!match.query_language) return false;
  if (!targetLanguage) return true;
  return match.query_language.toLowerCase() === targetLanguage.toLowerCase();
}

/** A library hit may short-circuit generation only when it covers at least
 *  one technique claimed by the canonical opportunity. Semantic similarity
 *  alone is not coverage: the live T1218.015 verification otherwise reused
 *  T1497, T1574.001, and T1190/T1059.004 rules with scores above 0.86.
 *
 *  When an opportunity has no MITRE ids (legacy/fallback data), preserve the
 *  historical score-only behaviour. When the opportunity is mapped but the
 *  library rule is not, fail open to generation rather than claiming
 *  unprovable coverage. */
export function hasMitreOverlap(
  opportunityIds: readonly string[] | null | undefined,
  libraryIds: readonly string[] | null | undefined,
): boolean {
  if (!opportunityIds?.length) return true;
  if (!libraryIds?.length) return false;
  const normalizedLibraryIds = new Set(libraryIds.map(id => id.trim().toUpperCase()).filter(Boolean));
  return opportunityIds.some(id => normalizedLibraryIds.has(id.trim().toUpperCase()));
}

/** Why a library match did or did not replace generating a new detection. */
import {
  extractQueryObservables,
  observablesFromOpportunity,
  compareObservables,
  type ObservableOverlap,
} from "./observables.ts";

export interface ReuseAdjudication {
  /** Skip generation entirely and point the leaf at the existing rule. */
  suppressGeneration: boolean;
  /** Show the match as context while still writing a new detection. */
  showAsRelatedCoverage: boolean;
  /** Every condition, so the UI and the event trail can say WHICH one failed
   *  instead of leaving the user to guess why a rule they can see was or was
   *  not reused. */
  reasons: {
    mitreOverlap: boolean;
    runnableQuery: boolean;
    compatibleLanguage: boolean;
    deployedStatus: boolean;
    /** The rule constrains everything this opportunity is looking for.
     *  MITRE overlap cannot establish this: six distinct T1218.005 surfaces --
     *  remote URL, inline protocol handler, renamed binary, ClickFix lineage,
     *  RunMRU evidence, local HTA plus egress -- all share the technique, so
     *  one partial rule could suppress five real opportunities. Nor can a
     *  shared table: every endpoint rule reads DeviceProcessEvents. This is a
     *  containment test -- see observables.ts. */
    observableOverlap: boolean;
  };
  /** Short human-readable cause when generation proceeds anyway. */
  skippedReason: string | null;
  /** WHY the observable condition landed where it did. `missingAnchors` is the
   *  actionable part: it names the identifiers the opportunity asked for that
   *  the rule says nothing about, so 'different_observables' can be explained
   *  instead of asserted. */
  observableDetail: ObservableOverlap;
}

/** Decide what a library hit means for one opportunity.
 *
 *  A rule may replace generation only when ALL of these hold: it overlaps on
 *  MITRE technique, it has a runnable query body, it is written in the
 *  language this session targets, and it constrains what the opportunity is
 *  actually looking for.
 *
 *  Lifecycle status is deliberately NOT one of those conditions, and that is a
 *  reversal. It was one, twice, and both times it made reuse unreachable for
 *  Microsoft-shop customers. The library is 4,576 KQL detections of which
 *  exactly ONE carries status 'Production' -- 2,763 are Development and 1,805
 *  are Draft. For T1218.005 specifically: 12 SPL Production, 10 EQL Production,
 *  7 Sigma Testing, 1 KQL Development. A Defender session therefore could not
 *  satisfy `Production AND KQL` for any technique, so session 7382a9c2 wrote
 *  seven fresh rules next to 31 existing ones and skipped every match with
 *  reason 'language_mismatch' or 'not_deployed'.
 *
 *  That is not a tuning problem. An imported corpus arrives un-triaged by
 *  definition; requiring it to be marked Production before it can be reused
 *  asks the user to do the curation the reuse is supposed to save them. Status
 *  is still COMPUTED and still reported -- handleDetection uses it to mark a
 *  reused leaf `covered` vs `partial`, which is the honest place for it: it
 *  describes what the user is getting, rather than deciding whether they get
 *  anything.
 *
 *  What remains is a set of conditions about whether the rule is ABOUT this
 *  opportunity: MITRE overlap, a non-empty query body, a language the session
 *  can run, and observable containment. Those four now carry the weight that
 *  status was wrongly asked to share.
 *
 *  The other half of the history still applies. An earlier revision let ANY
 *  MITRE-overlapping hit above 0.6 similarity suppress generation, so 048fdd12
 *  spent 165K tokens to return six existing rules and 793cafab returned five --
 *  the user asked for detections and received a search result. What was wrong
 *  there was not the conditions but the consequence: failing them made a match
 *  VANISH. Here, failing them only costs the short-circuit. The match is still
 *  surfaced as related coverage and the gap is still filled.
 *
 *  Honest caveat: these gates sit on a noisy base signal. The search is an
 *  OR-tokenized tsquery (20260521150000) with the threshold dropped 0.75 ->
 *  0.6 (20260520120000). Four conditions on a weak score reduce false
 *  suppression; they do not make the match itself trustworthy. Improving match
 *  quality is a separate piece of work, not something this function can fake.
 */
export function adjudicateReuse(input: {
  opportunityMitreIds: readonly string[] | null | undefined;
  match: {
    status?: string | null;
    query_language?: string | null;
    detection_query?: string | null;
    mitre_technique_ids?: string[] | null;
  } | null | undefined;
  targetLanguage: string | null | undefined;
  /** The opportunity's declared detection surface. Optional so existing
   *  callers keep compiling; absent means the observable condition cannot be
   *  satisfied, which declines the short-circuit rather than granting it. */
  opportunityObservableChain?: readonly string[] | null;
  opportunityTelemetry?: readonly string[] | null;
}): ReuseAdjudication {
  const {
    match, targetLanguage, opportunityMitreIds,
    opportunityObservableChain, opportunityTelemetry,
  } = input;

  if (!match) {
    return {
      suppressGeneration: false,
      showAsRelatedCoverage: false,
      reasons: {
        mitreOverlap: false,
        runnableQuery: false,
        compatibleLanguage: false,
        deployedStatus: false,
        observableOverlap: false,
      },
      skippedReason: null,
      observableDetail: {
        sharedTables: [], matchedAnchors: [], missingAnchors: [],
        missingStrongAnchors: [], unmatchedRulePredicates: [], overlaps: false,
      },
    };
  }

  const observableDetail = compareObservables(
    extractQueryObservables(match.detection_query, match.query_language),
    observablesFromOpportunity(opportunityObservableChain, opportunityTelemetry),
  );

  const reasons = {
    mitreOverlap: hasMitreOverlap(opportunityMitreIds, match.mitre_technique_ids),
    // A rule with no query body cannot detect anything, whatever its status
    // says. Reusing one would hand the user a title and call it coverage.
    runnableQuery: typeof match.detection_query === 'string' && match.detection_query.trim().length > 0,
    compatibleLanguage: isLanguageRunnable(match, targetLanguage),
    deployedStatus: isDeployedCoverage(match),
    observableOverlap: observableDetail.overlaps,
  };

  // deployedStatus is computed and reported but deliberately absent here — see
  // the note above on why lifecycle status cannot be a reuse precondition
  // against an imported, un-triaged library.
  const suppressGeneration =
    reasons.mitreOverlap &&
    reasons.runnableQuery &&
    reasons.compatibleLanguage &&
    reasons.observableOverlap;

  // Ordered by how actionable the answer is to a detection engineer: a
  // technique mismatch means the rule is simply not about this, whereas a
  // status or language mismatch means it IS the right rule in the wrong state.
  let skippedReason: string | null = null;
  if (!suppressGeneration) {
    if (!reasons.mitreOverlap) skippedReason = 'technique_mismatch';
    else if (!reasons.runnableQuery) skippedReason = 'no_query_body';
    else if (!reasons.compatibleLanguage) skippedReason = 'language_mismatch';
    // Last, because it is the most specific answer: the rule IS about this
    // technique, IS deployed and IS runnable here -- it simply does not
    // constrain what this opportunity is looking for. observableDetail
    // .missingAnchors says which part.
    else skippedReason = 'different_observables';
  }

  return {
    suppressGeneration,
    // A technique mismatch is not related coverage, it is a bad search hit.
    // Showing it would train the user to ignore the panel.
    showAsRelatedCoverage: !suppressGeneration && reasons.mitreOverlap,
    reasons,
    skippedReason,
    observableDetail,
  };
}
