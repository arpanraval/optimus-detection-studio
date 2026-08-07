/**
 * The digest response envelope.
 *
 * Two different questions are being answered here and they must not be
 * collapsed into one:
 *
 *   outcome  -- how complete is this report?      complete | partial | failed
 *   success  -- did the run produce a report the caller can use?
 *
 * They were collapsed. `success` was `outcome === 'complete'`, so a `partial`
 * run returned `success: false`, `error: undefined`, and a perfectly good
 * report. Every caller that branched on `success` threw the report away and
 * then had no message to show, because `error` is only set for a real failure.
 * The Re-extract button re-fetched the article, re-ran extraction for 27
 * seconds, built a valid report, and rendered "Retry Failed".
 *
 * A partial report is a successful run that has something to warn about. It is
 * the normal outcome for real-world threat intel -- most articles produce at
 * least one section warning -- so treating it as failure broke the button for
 * exactly the reports anyone would press it on.
 *
 * See A3 in docs/plans/2026-08-06-intel-digest-problem-inventory.md. This is
 * the same defect shape as A1: `!== 'complete'` used to mean "bad".
 *
 * These functions are pure and live here rather than inline in the request
 * handler so the contract is covered by tests. Both halves used to be single
 * expressions buried in a 600-line `serve` callback, which is how the envelope
 * stayed wrong without any test noticing.
 */

export type ReportOutcome = 'complete' | 'partial' | 'failed'

/**
 * Sections whose failure means there is no usable report. Everything else
 * degrades the report without invalidating it.
 */
export const CRITICAL_SECTIONS = ['summary', 'classification', 'ttps'] as const

export interface ReportOutcomeInput {
  hasSummary: boolean
  hasClassification: boolean
  sectionErrors: Record<string, string>
}

export function deriveReportOutcome({
  hasSummary,
  hasClassification,
  sectionErrors,
}: ReportOutcomeInput): ReportOutcome {
  const criticalFailed =
    !hasSummary ||
    !hasClassification ||
    CRITICAL_SECTIONS.some((section) => Boolean(sectionErrors[section]))

  if (criticalFailed) return 'failed'
  return Object.keys(sectionErrors).length > 0 ? 'partial' : 'complete'
}

export interface DigestEnvelope<TReport> {
  success: boolean
  outcome: ReportOutcome
  error?: string
  report: TReport
  processingTimeMs: number
}

/**
 * `success` means "a usable report is attached", NOT "nothing went wrong".
 * Callers that need the completeness verdict must read `outcome`; callers that
 * only need to know whether they can persist and render the report read
 * `success`. When `success` is false, `error` is always populated -- there is
 * no state where a caller is told it failed and given no reason.
 */
export function buildDigestEnvelope<TReport>(
  outcome: ReportOutcome,
  report: TReport,
  processingTimeMs: number,
): DigestEnvelope<TReport> {
  const usable = outcome !== 'failed'
  return {
    success: usable,
    outcome,
    error: usable ? undefined : 'Required extraction stages failed',
    report,
    processingTimeMs,
  }
}
