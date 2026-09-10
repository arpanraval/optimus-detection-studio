/**
 * The quality-warning lifecycle.
 *
 * A warning must not outlive the condition that produced it. That sounds
 * obvious; the digest did the opposite. A retry seeded `qualityWarnings` from
 * the previous run and then merged the fresh warnings into that inherited set,
 * so the list could only ever grow. Nothing removed anything, ever.
 *
 * Two consequences, both observed in live data:
 *
 *   1. `sectionErrors.evidence` was set whenever the list was non-empty and was
 *      deleted nowhere, so once a report was `partial` it was `partial`
 *      permanently. Combined with A3, Re-extract could never report success on
 *      a partial report -- the only kind of report anyone presses it on.
 *
 *   2. The banner asserted failures that had already been fixed. After a
 *      successful `iocs` retry on report b44771dc, three of five stored
 *      warnings described indicators that no longer existed in the report.
 *
 * The missing idea is ownership: every warning belongs to the stage that
 * produced it. A stage that re-runs replaces its own warnings; a stage that was
 * skipped keeps them. There are two producers:
 *
 *   evidence gate -- re-runs on every request, over the full current TTP / IoC
 *                    / rule set, so its fresh output is already the complete
 *                    truth. It is never inherited.
 *
 *   mitre stage   -- runs only when it is the retried section, so its warning
 *                    must survive a retry of anything else.
 *
 * The MITRE warning is read back out of `sectionErrors` rather than carried in
 * a variable of its own, because `sectionErrors` already has exactly the
 * lifecycle `qualityWarnings` lacked: each stage sets its key on failure and
 * deletes it on success, and an entry belonging to a stage that did not run is
 * inherited untouched. Deriving from it means there is no second place for the
 * two to disagree -- which is the drift this pipeline keeps being bitten by.
 *
 * It also fixes a miscount at the same site. The MITRE message used to be
 * pushed into `qualityWarnings`, which made the list non-empty, which set
 * `sectionErrors.evidence`. A single MITRE fault was reported as two failed
 * sections: "Sections that failed: mitre, evidence". `evidence` now tracks the
 * evidence gate and nothing else.
 *
 * See A4 in docs/plans/2026-08-06-intel-digest-problem-inventory.md.
 *
 * This is pure and lives here rather than inline in the request handler for the
 * same reason `response-contract.ts` does: as three scattered statements inside
 * a 600-line `serve` callback it was untestable, and stayed wrong.
 */

/**
 * Section errors that are also surfaced as quality warnings, because their text
 * carries detail the section name alone does not -- "3 extracted technique(s)
 * failed canonical ATT&CK ID/name validation" says more than "mitre".
 */
const WARNING_BEARING_SECTIONS = ['mitre'] as const

export const EVIDENCE_SECTION_ERROR =
  'One or more extracted facts require source-evidence review'

export interface QualityWarningInput {
  /** Section errors as they stand after every stage that ran this request. */
  sectionErrors: Record<string, string>
  /** Fresh output of the evidence gate. Complete for the current report. */
  evidenceWarnings: string[]
}

export interface QualityWarningResult {
  qualityWarnings: string[]
  /** `evidence` set or removed. Returned rather than mutated so the caller
   *  cannot apply one half and forget the other -- the missing half is the
   *  bug this module exists to fix. */
  sectionErrors: Record<string, string>
}

export function reconcileQualityWarnings({
  sectionErrors,
  evidenceWarnings,
}: QualityWarningInput): QualityWarningResult {
  const carried = WARNING_BEARING_SECTIONS
    .map((section) => sectionErrors[section])
    .filter((message): message is string => Boolean(message))

  const nextSectionErrors = { ...sectionErrors }
  if (evidenceWarnings.length > 0) {
    nextSectionErrors.evidence = EVIDENCE_SECTION_ERROR
  } else {
    delete nextSectionErrors.evidence
  }

  return {
    qualityWarnings: [...new Set([...carried, ...evidenceWarnings])],
    sectionErrors: nextSectionErrors,
  }
}
