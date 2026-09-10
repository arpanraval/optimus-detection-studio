import { describe, expect, it } from 'vitest'
import {
  EVIDENCE_SECTION_ERROR,
  reconcileQualityWarnings,
} from '../../threat-intel-digest-v2/lib/quality-warnings'

const MITRE_WARNING = '1 extracted technique(s) failed canonical ATT&CK ID/name validation'

describe('reconcileQualityWarnings', () => {
  it('reports no warnings and no evidence error on a clean run', () => {
    const result = reconcileQualityWarnings({
      sectionErrors: {},
      evidenceWarnings: [],
    })

    expect(result.qualityWarnings).toEqual([])
    expect(result.sectionErrors.evidence).toBeUndefined()
  })

  // A4. The evidence gate re-runs over the whole report every time, so its
  // output is the complete truth for the current contents. Merging it into the
  // previous run's list is what left report b44771dc asserting three warnings
  // about indicators a successful retry had already removed.
  it('replaces the previous run\'s evidence warnings rather than accumulating them', () => {
    const afterFirstRun = reconcileQualityWarnings({
      sectionErrors: {},
      evidenceWarnings: [
        'IoC url was not found in source evidence.',
        'IoC user_agent was not found in source evidence.',
        'IoC file_name was not found in source evidence.',
      ],
    })
    expect(afterFirstRun.qualityWarnings).toHaveLength(3)

    // The retry dropped the fabricated indicators; only one still fails.
    const afterRetry = reconcileQualityWarnings({
      sectionErrors: afterFirstRun.sectionErrors,
      evidenceWarnings: ['IoC url was not found in source evidence.'],
    })

    expect(afterRetry.qualityWarnings).toEqual([
      'IoC url was not found in source evidence.',
    ])
  })

  // The whole point: `partial` has to be escapable, or Re-extract can never
  // succeed on the only reports anyone would press it on.
  it('clears the evidence error when a retry resolves every warning', () => {
    const partial = reconcileQualityWarnings({
      sectionErrors: {},
      evidenceWarnings: ['IoC url was not found in source evidence.'],
    })
    expect(partial.sectionErrors.evidence).toBe(EVIDENCE_SECTION_ERROR)

    const clean = reconcileQualityWarnings({
      sectionErrors: partial.sectionErrors,
      evidenceWarnings: [],
    })

    expect(clean.sectionErrors.evidence).toBeUndefined()
    expect(clean.qualityWarnings).toEqual([])
  })

  it('sets the evidence error when the gate raises anything', () => {
    const result = reconcileQualityWarnings({
      sectionErrors: {},
      evidenceWarnings: ['IoC url was not found in source evidence.'],
    })

    expect(result.sectionErrors.evidence).toBe(EVIDENCE_SECTION_ERROR)
  })

  // The MITRE stage does not re-run unless it is the retried section, so its
  // warning has to survive a retry of anything else -- otherwise fixing A4
  // would silently drop a warning that is still true.
  it('carries the MITRE warning through a retry that did not re-run MITRE', () => {
    const result = reconcileQualityWarnings({
      sectionErrors: { mitre: MITRE_WARNING },
      evidenceWarnings: [],
    })

    expect(result.qualityWarnings).toEqual([MITRE_WARNING])
  })

  it('drops the MITRE warning once the MITRE stage re-runs clean', () => {
    // A clean MITRE stage deletes its own key before reconciliation.
    const result = reconcileQualityWarnings({
      sectionErrors: {},
      evidenceWarnings: [],
    })

    expect(result.qualityWarnings).toEqual([])
  })

  // One fault, one failed section. The MITRE message used to be pushed into
  // qualityWarnings, which made the list non-empty, which set the evidence
  // error -- so the banner read "Sections that failed: mitre, evidence".
  it('does not report a MITRE fault as an evidence failure', () => {
    const result = reconcileQualityWarnings({
      sectionErrors: { mitre: MITRE_WARNING },
      evidenceWarnings: [],
    })

    expect(result.sectionErrors.evidence).toBeUndefined()
    expect(Object.keys(result.sectionErrors)).toEqual(['mitre'])
  })

  it('reports both when MITRE and the evidence gate each fail', () => {
    const result = reconcileQualityWarnings({
      sectionErrors: { mitre: MITRE_WARNING },
      evidenceWarnings: ['IoC url was not found in source evidence.'],
    })

    expect(result.qualityWarnings).toEqual([
      MITRE_WARNING,
      'IoC url was not found in source evidence.',
    ])
    expect(result.sectionErrors.evidence).toBe(EVIDENCE_SECTION_ERROR)
    expect(result.sectionErrors.mitre).toBe(MITRE_WARNING)
  })

  it('leaves errors belonging to other stages untouched', () => {
    const result = reconcileQualityWarnings({
      sectionErrors: { iocs: 'Retry returned no results. Keeping existing data.' },
      evidenceWarnings: [],
    })

    expect(result.sectionErrors.iocs).toBe('Retry returned no results. Keeping existing data.')
    // ...but they are not warnings; only warning-bearing sections are surfaced.
    expect(result.qualityWarnings).toEqual([])
  })

  it('does not mutate the section errors it was given', () => {
    const sectionErrors = { evidence: EVIDENCE_SECTION_ERROR }

    reconcileQualityWarnings({ sectionErrors, evidenceWarnings: [] })

    expect(sectionErrors.evidence).toBe(EVIDENCE_SECTION_ERROR)
  })

  it('de-duplicates a warning raised by both producers', () => {
    const result = reconcileQualityWarnings({
      sectionErrors: { mitre: MITRE_WARNING },
      evidenceWarnings: [MITRE_WARNING],
    })

    expect(result.qualityWarnings).toEqual([MITRE_WARNING])
  })
})
