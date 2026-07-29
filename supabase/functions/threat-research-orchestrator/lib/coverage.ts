// supabase/functions/threat-research-orchestrator/lib/coverage.ts
//
// When does an existing library detection count as COVERAGE?
//
// Two independent signals determine whether a reused detection represents
// deployed, runnable coverage in the session environment:
//
//   1. STATUS  — the rule has to actually be deployed. A Draft or Deprecated
//                rule detects nothing, so treating it as coverage hands the
//                user a claim the system cannot substantiate.
//   2. LANGUAGE — the rule has to be runnable in the SIEM this session targets.
//
// The library search itself is deliberately NOT filtered (handleLibrarySearch
// passes no p_status to hybrid_search_detections): we want near-matches in any
// status to stay visible so the engineer can reference them and the UI can
// explain itself. The gating happens here, after the fact.
//
// This matters more than it used to. The OR-tokenized tsquery (migration
// 20260521150000) plus the match threshold dropping 0.75 -> 0.6 (20260520120000)
// made weak matches considerably easier to hit, so an un-gated match could
// silently suppress generation on the strength of a half-finished Draft.
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
  };
  /** Short human-readable cause when generation proceeds anyway. */
  skippedReason: string | null;
}

/** Decide what a library hit means for one opportunity.
 *
 *  A rule may replace generation only when ALL of these hold: it overlaps on
 *  MITRE technique, it has a runnable query body, it is written in the
 *  language this session targets, and its lifecycle status says it is actually
 *  deployed.
 *
 *  History matters here, in both directions.
 *
 *  A Production-AND-language gate existed once and was reverted (Amendment 1,
 *  2026-07-28) because on a real run it excluded all 185 mshta rules in an
 *  11,820-rule library -- no rule was simultaneously Production and KQL -- so
 *  nothing was ever reused. The reversal went too far the other way: ANY
 *  MITRE-overlapping hit above a 0.6 similarity threshold now suppresses
 *  generation, so 048fdd12 spent 165K tokens to return six existing rules and
 *  793cafab returned five, and the user asked for detections and received a
 *  search result.
 *
 *  What was actually wrong with the first attempt was not the conditions but
 *  the consequence: failing them made a match VANISH. Here, failing them only
 *  costs the short-circuit. The match is still surfaced as related coverage
 *  and the gap is still filled. Nothing is lost, so the conditions can be
 *  strict without being destructive.
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
}): ReuseAdjudication {
  const { match, targetLanguage, opportunityMitreIds } = input;

  if (!match) {
    return {
      suppressGeneration: false,
      showAsRelatedCoverage: false,
      reasons: {
        mitreOverlap: false,
        runnableQuery: false,
        compatibleLanguage: false,
        deployedStatus: false,
      },
      skippedReason: null,
    };
  }

  const reasons = {
    mitreOverlap: hasMitreOverlap(opportunityMitreIds, match.mitre_technique_ids),
    // A rule with no query body cannot detect anything, whatever its status
    // says. Reusing one would hand the user a title and call it coverage.
    runnableQuery: typeof match.detection_query === 'string' && match.detection_query.trim().length > 0,
    compatibleLanguage: isLanguageRunnable(match, targetLanguage),
    deployedStatus: isDeployedCoverage(match),
  };

  const suppressGeneration =
    reasons.mitreOverlap &&
    reasons.runnableQuery &&
    reasons.compatibleLanguage &&
    reasons.deployedStatus;

  // Ordered by how actionable the answer is to a detection engineer: a
  // technique mismatch means the rule is simply not about this, whereas a
  // status or language mismatch means it IS the right rule in the wrong state.
  let skippedReason: string | null = null;
  if (!suppressGeneration) {
    if (!reasons.mitreOverlap) skippedReason = 'technique_mismatch';
    else if (!reasons.runnableQuery) skippedReason = 'no_query_body';
    else if (!reasons.compatibleLanguage) skippedReason = 'language_mismatch';
    else skippedReason = 'not_deployed';
  }

  return {
    suppressGeneration,
    // A technique mismatch is not related coverage, it is a bad search hit.
    // Showing it would train the user to ignore the panel.
    showAsRelatedCoverage: !suppressGeneration && reasons.mitreOverlap,
    reasons,
    skippedReason,
  };
}
