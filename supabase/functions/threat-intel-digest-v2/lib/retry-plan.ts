/**
 * Which stages a retry must run.
 *
 * A retry used to run exactly the stage you asked for:
 *
 *   shouldRunMitre   = !isRetry || retrySection === 'mitre'
 *   shouldRunLibrary = !isRetry || retrySection === 'library'
 *
 * But stages consume each other's output. `mitre` validates the TTPs;
 * `library` matches against the TTPs *and* the MITRE mapping. So retrying
 * `ttps` replaced the TTP set and left every verdict about it untouched --
 * the MITRE validation error still described the previous set, the library
 * matches still pointed at techniques that were no longer in the report, and
 * `libraryOverlapPercent` divided a fresh TTP count by a stale match count.
 *
 * Observed on report b44771dc: a `ttps` retry took 10 techniques to 9, and
 * "1 extracted technique(s) failed canonical ATT&CK ID/name validation"
 * survived as a verdict about the 10 that no longer existed.
 *
 * This is the same defect as A4 -- a verdict outliving the thing it describes
 * -- one level up. A4 fixed it for quality warnings, and only worked because
 * the evidence gate happens to re-run unconditionally. The gating itself was
 * never fixed. See A4 in docs/plans/2026-08-06-intel-digest-problem-inventory.md.
 *
 * So a retry now runs the requested stage *and its dependents, transitively*.
 * The rule is declared once, as data, rather than as seven independent
 * booleans that each have to be remembered when a dependency changes.
 */

export const DIGEST_STAGES = [
  'summary',
  'classification',
  'ttps',
  'iocs',
  'rules',
  'mitre',
  'library',
] as const

export type DigestStage = (typeof DIGEST_STAGES)[number]

/**
 * Stages that consume each stage's output and must therefore be recomputed
 * when it changes. Direct dependents only -- the closure is taken below.
 *
 *   mitre   reads ttps                  (performMitreMatching(ttps, ...))
 *   library reads ttps AND mitreMapping (findLibraryMatches(ttps, mitreMapping, ...))
 *
 * The evidence gate is deliberately absent: it already runs unconditionally on
 * every request, over the full current TTP / IoC / rule set, which is why it
 * was the one derived verdict that was never stale.
 */
const DIRECT_DEPENDENTS: Record<DigestStage, readonly DigestStage[]> = {
  summary: [],
  classification: [],
  ttps: ['mitre', 'library'],
  iocs: [],
  rules: [],
  mitre: ['library'],
  library: [],
}

/**
 * The stages a run must execute.
 *
 * A full digest runs everything. A retry runs the requested stage plus every
 * stage transitively downstream of it, so no verdict can survive a change to
 * the data it was computed from.
 */
export function planStages(retrySection: DigestStage | null | undefined): Set<DigestStage> {
  if (!retrySection) return new Set(DIGEST_STAGES)

  const planned = new Set<DigestStage>()
  const queue: DigestStage[] = [retrySection]

  while (queue.length > 0) {
    const stage = queue.shift()!
    if (planned.has(stage)) continue
    planned.add(stage)
    queue.push(...DIRECT_DEPENDENTS[stage])
  }

  return planned
}

/**
 * Whether the retried stage invalidates work this function cannot redo.
 *
 * Feasibility is assessed per-TTP by the auto-digest orchestrator, which has
 * the environment profile; the digest function has no feasibility stage at
 * all. When a retry replaces the TTP set, the stored feasibility counts
 * describe techniques that are gone. They cannot be recomputed here, so they
 * are cleared rather than carried -- "not computed" is true, "9 feasible" is
 * not. Absence and zero must stay distinguishable (constraint 5), so this
 * clears to null, never to 0.
 */
export function invalidatesFeasibility(plannedStages: Set<DigestStage>): boolean {
  return plannedStages.has('ttps')
}
