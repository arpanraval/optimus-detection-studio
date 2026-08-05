import { describe, expect, it } from 'vitest'
import {
  applyEvidenceQualityGate,
  classifySourceQuality,
  evidenceIsSupported,
  namesAreCompatible,
} from '../../threat-intel-digest-v2/lib/evidence-quality'

describe('digest evidence quality gates', () => {
  it('classifies feed summaries separately from article evidence', () => {
    expect(classifySourceQuality('short RSS summary')).toBe('title_only')
    expect(classifySourceQuality('x'.repeat(600))).toBe('feed_summary')
    expect(classifySourceQuality('x'.repeat(2_000))).toBe('full_article')
  })

  it('does not accept unsupported TTP evidence or IoCs as verified facts', () => {
    const result = applyEvidenceQualityGate(
      'The actor executed powershell.exe to download the payload from evil.example.',
      [{
        id: 'ttp-1',
        mitreId: 'T1059',
        techniqueName: 'Command and Scripting Interpreter',
        tacticName: 'Execution',
        tacticId: 'TA0002',
        sourceType: 'explicit',
        confidence: 'high',
        evidence: 'The report describes credential dumping.',
        explanation: 'unsupported',
        isSubTechnique: false,
      }],
      [{
        id: 'ioc-1',
        type: 'domain',
        category: 'network',
        value: 'not-in-source.example',
        severity: 'suspicious',
      }],
      [],
    )

    expect(result.ttps[0].validationState).toBe('rejected')
    expect(result.ttps[0].evidenceSupported).toBe(false)
    expect(result.iocs[0].potentialFalsePositive).toBe(true)
    expect(result.iocs[0].evidenceSupported).toBe(false)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('recognizes defanged indicators in source evidence', () => {
    expect(evidenceIsSupported('The callback used evil[.]example and 198[.]51[.]100[.]4.', 'evil.example')).toBe(true)
  })

  it('rejects prompt-injection concepts mapped to unrelated ATT&CK names', () => {
    expect(namesAreCompatible('Indirect Prompt Injection', 'Spearphishing Attachment')).toBe(false)
    expect(namesAreCompatible('Command and Scripting Interpreter', 'Command and Scripting Interpreter')).toBe(true)
  })
})
