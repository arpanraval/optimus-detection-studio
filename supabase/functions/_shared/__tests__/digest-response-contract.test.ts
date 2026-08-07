import { describe, expect, it } from 'vitest'
import {
  buildDigestEnvelope,
  deriveReportOutcome,
} from '../../threat-intel-digest-v2/lib/response-contract'

const REPORT = { id: 'report-1' }

describe('deriveReportOutcome', () => {
  it('is complete only when nothing errored', () => {
    expect(deriveReportOutcome({
      hasSummary: true,
      hasClassification: true,
      sectionErrors: {},
    })).toBe('complete')
  })

  it('is partial when a non-critical section errored', () => {
    for (const section of ['iocs', 'rules', 'mitre', 'library', 'evidence']) {
      expect(deriveReportOutcome({
        hasSummary: true,
        hasClassification: true,
        sectionErrors: { [section]: 'something went wrong' },
      })).toBe('partial')
    }
  })

  it('is failed when a critical section errored', () => {
    for (const section of ['summary', 'classification', 'ttps']) {
      expect(deriveReportOutcome({
        hasSummary: true,
        hasClassification: true,
        sectionErrors: { [section]: 'something went wrong' },
      })).toBe('failed')
    }
  })

  it('is failed when the summary or classification is missing outright', () => {
    expect(deriveReportOutcome({
      hasSummary: false,
      hasClassification: true,
      sectionErrors: {},
    })).toBe('failed')
    expect(deriveReportOutcome({
      hasSummary: true,
      hasClassification: false,
      sectionErrors: {},
    })).toBe('failed')
  })
})

describe('buildDigestEnvelope', () => {
  // This is the A3 regression. A partial run returned success:false with no
  // error and a valid report, so every caller discarded the report and showed
  // an unexplained failure. Re-extract was unusable on exactly the reports it
  // exists for, because partial is the normal outcome for real articles.
  it('reports a partial run as successful and attaches the report', () => {
    const envelope = buildDigestEnvelope('partial', REPORT, 1234)

    expect(envelope.success).toBe(true)
    expect(envelope.outcome).toBe('partial')
    expect(envelope.report).toBe(REPORT)
    expect(envelope.error).toBeUndefined()
  })

  it('reports a complete run as successful', () => {
    const envelope = buildDigestEnvelope('complete', REPORT, 10)

    expect(envelope.success).toBe(true)
    expect(envelope.outcome).toBe('complete')
    expect(envelope.error).toBeUndefined()
  })

  it('reports a failed run as unsuccessful', () => {
    const envelope = buildDigestEnvelope('failed', REPORT, 10)

    expect(envelope.success).toBe(false)
    expect(envelope.outcome).toBe('failed')
  })

  // The caller's `result.error || 'Failed to retry section'` fallback printed a
  // reason it did not have. Whatever the envelope says failed must arrive with
  // a cause attached, so that fallback can never be reached.
  it('never reports failure without a reason', () => {
    for (const outcome of ['complete', 'partial', 'failed'] as const) {
      const envelope = buildDigestEnvelope(outcome, REPORT, 0)
      if (!envelope.success) expect(envelope.error).toBeTruthy()
    }
  })

  it('preserves the processing time it was given', () => {
    expect(buildDigestEnvelope('complete', REPORT, 27_010).processingTimeMs).toBe(27_010)
  })
})
