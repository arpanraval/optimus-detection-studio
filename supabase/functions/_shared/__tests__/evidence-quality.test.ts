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

  /**
   * D4. The extraction prompt tells the model to refang indicators, so the
   * stored value is live while the article is defanged. The gate knew `[.]`
   * but not `hxxp`, so it reported the model's correct output as absent and
   * flagged the attacker's real payload URL as a possible fabrication, while a
   * placeholder domain from a diagram passed.
   *
   * The source strings below are verbatim from the Unit 42 article behind
   * report b44771dc, which is where this was found.
   */
  describe('defanged indicator recognition', () => {
    const gate = (source: string, value: string, type = 'url') =>
      applyEvidenceQualityGate(
        source,
        [],
        [{ id: 'ioc-1', type, category: 'network', value, severity: 'suspicious' }],
        [],
      ).iocs[0]

    it('finds a refanged URL in a defanged article', () => {
      const ioc = gate(
        'the binary retrieved from hxxp[:]//178.16.54[.]109/st.exe) associated with Phorpiex',
        'http://178.16.54.109/st.exe',
      )

      expect(ioc.evidenceSupported).toBe(true)
      expect(ioc.potentialFalsePositive).toBeFalsy()
    })

    it('handles scheme variants it has no specific knowledge of', () => {
      expect(gate('contact hxxps[:]//a.test/b now', 'https://a.test/b').evidenceSupported).toBe(true)
      expect(gate('contact fxp[:]//a.test/b now', 'ftp://a.test/b').evidenceSupported).toBe(true)
    })

    it('handles the spelled-out and at-sign forms', () => {
      expect(gate('reach example[dot]com today', 'example.com', 'domain').evidenceSupported).toBe(true)
      expect(gate('mail user[@]example.com today', 'user@example.com', 'email').evidenceSupported).toBe(true)
    })

    // Ignoring the scheme must not turn the check into a rubber stamp: an
    // indicator whose host and path are absent is still absent.
    it('still rejects an indicator that is genuinely not in the source', () => {
      const ioc = gate(
        'the binary retrieved from hxxp[:]//178.16.54[.]109/st.exe',
        'http://different-host.example/evil.exe',
      )

      expect(ioc.evidenceSupported).toBe(false)
      expect(ioc.potentialFalsePositive).toBe(true)
    })

    // The fabrications on that same report -- Mozi is a different botnet, and
    // the user agent came from model priors. Both must keep failing.
    it('still rejects fabricated indicators', () => {
      expect(gate('Phorpiex retrieved st.exe from the host', 'mozi.m', 'file_name').evidenceSupported).toBe(false)
      expect(gate(
        'Phorpiex retrieved st.exe from the host',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0',
        'user_agent',
      ).evidenceSupported).toBe(false)
    })
  })

  it('rejects prompt-injection concepts mapped to unrelated ATT&CK names', () => {
    expect(namesAreCompatible('Indirect Prompt Injection', 'Spearphishing Attachment')).toBe(false)
    expect(namesAreCompatible('Command and Scripting Interpreter', 'Command and Scripting Interpreter')).toBe(true)
  })
})
