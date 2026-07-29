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
