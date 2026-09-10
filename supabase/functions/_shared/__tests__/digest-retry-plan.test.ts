import { describe, expect, it } from 'vitest'
import {
  DIGEST_STAGES,
  invalidatesFeasibility,
  planStages,
} from '../../threat-intel-digest-v2/lib/retry-plan'

describe('planStages', () => {
  it('runs every stage when this is not a retry', () => {
    expect(planStages(null)).toEqual(new Set(DIGEST_STAGES))
    expect(planStages(undefined)).toEqual(new Set(DIGEST_STAGES))
  })

  // The defect. A `ttps` retry replaced the TTP set and left MITRE's verdict
  // and the library's matches describing the previous one. Observed on report
  // b44771dc: 10 techniques became 9, and "1 extracted technique(s) failed
  // canonical ATT&CK validation" survived as a claim about the vanished 10.
  it('re-runs MITRE and library when the TTPs are re-extracted', () => {
    const planned = planStages('ttps')

    expect(planned.has('ttps')).toBe(true)
    expect(planned.has('mitre')).toBe(true)
    expect(planned.has('library')).toBe(true)
  })

  // library reads the MITRE mapping, so it is downstream of mitre as well.
  it('re-runs library when MITRE is re-run', () => {
    const planned = planStages('mitre')

    expect(planned.has('mitre')).toBe(true)
    expect(planned.has('library')).toBe(true)
  })

  it('does not re-run stages that are merely adjacent', () => {
    const planned = planStages('ttps')

    expect(planned.has('summary')).toBe(false)
    expect(planned.has('classification')).toBe(false)
    expect(planned.has('iocs')).toBe(false)
    expect(planned.has('rules')).toBe(false)
  })

  // Widening the retry costs time and AI spend. Stages with no dependents must
  // stay exactly as cheap as they were.
  it('runs only itself for stages nothing depends on', () => {
    for (const stage of ['summary', 'classification', 'iocs', 'rules', 'library'] as const) {
      expect(planStages(stage)).toEqual(new Set([stage]))
    }
  })

  it('always includes the stage that was asked for', () => {
    for (const stage of DIGEST_STAGES) {
      expect(planStages(stage).has(stage)).toBe(true)
    }
  })

  it('never plans a stage that is not a real stage', () => {
    for (const stage of DIGEST_STAGES) {
      for (const planned of planStages(stage)) {
        expect(DIGEST_STAGES).toContain(planned)
      }
    }
  })
})

describe('invalidatesFeasibility', () => {
  // Feasibility is per-TTP and computed elsewhere. If this run re-extracted
  // the TTPs, the stored counts describe techniques that are gone -- and the
  // digest cannot recompute them, so they must be cleared rather than carried.
  it('invalidates when the TTPs were re-extracted', () => {
    expect(invalidatesFeasibility(planStages('ttps'))).toBe(true)
  })

  it('leaves feasibility alone when the TTP set cannot have changed', () => {
    for (const stage of ['summary', 'classification', 'iocs', 'rules', 'mitre', 'library'] as const) {
      expect(invalidatesFeasibility(planStages(stage))).toBe(false)
    }
  })

  it('invalidates on a full run, where every stage including ttps runs', () => {
    expect(invalidatesFeasibility(planStages(null))).toBe(true)
  })
})
