import { describe, expect, it } from 'vitest'
import {
  QUERY_LANGUAGES,
  classifyRuleType,
  isDeployableRule,
  classifyRule,
  hasQueryShape,
  squashRuleType,
} from '../rule-type'

/** Every distinct rule type in the live corpus, with its row count. */
const CORPUS: [string, number][] = [
  ['kql', 148], ['github_reference', 57], ['yara', 24], ['clamav', 17], ['snort', 16],
  ['sigma', 15], ['powershell', 9], ['suricata', 9],
  ['Palo Alto Networks Threat Prevention Signature ID', 8], ['Regex', 8],
  ['Wiz Cloud Event Query', 5], ['command line', 5], ['log analysis', 5], ['xql', 5],
  ['shell', 4], ['snort sid', 4], ['google secops', 3], ['spl', 3], ['ldap filter', 3],
  ['eql', 3], ['logic description', 3], ['javascript', 3], ['log search', 3], ['ES|QL', 3],
  ['PHP', 2], ['bash', 2], ['clamav signature', 2], ['cloud armor security policy', 2],
  ['curl', 2], ['EQL', 2], ['google secops rule name', 2], ['Log Analysis Logic', 2],
  ['other', 2], ['pseudo-detection analytic', 2], ['shell script', 2], ['Other', 1],
  ['LogScale', 1], ['auditd', 1], ['log logic', 1], ['aws iam policy', 1],
  ['ldap filter pattern', 1], ['KQL', 1], ['YARA', 1], ['hunting artifact', 1],
  ['Gremlin', 1], ['graphql/curl', 1], ['snort2 sid', 1], ['snort3 sid', 1], ['es|ql', 1],
  ['endpoint security api event logic', 1], ['typescript', 1], ['viptela cli', 1],
  ['Web Log Analysis', 1], ['cortex xdr alert logic', 1], ['wmi query', 1], ['wmic', 1],
  ['wql', 1], ['bash script', 1], ['mdi external id', 1],
  ['microsoft defender detections', 1], ['yaml', 1],
]

describe('classifyRuleType', () => {
  it('resolves case and separator variants mechanically', () => {
    for (const variant of ['KQL', 'kql', 'Kql']) {
      expect(classifyRuleType(variant)).toMatchObject({ kind: 'query', language: 'kql' })
    }
    expect(classifyRuleType('ES|QL').language).toBe('esql')
    expect(classifyRuleType('es|ql').language).toBe('esql')
    expect(classifyRuleType('google secops').language).toBe('google_secops')
    expect(classifyRuleType('clamav signature').language).toBe('clamav')
  })

  it('marks deployable query languages as queries', () => {
    for (const language of QUERY_LANGUAGES) {
      expect(classifyRuleType(language)).toEqual({ kind: 'query', language, recognized: true })
    }
  })

  // The heart of E3: these were indistinguishable from Sigma rules.
  it('separates references from query languages', () => {
    for (const type of [
      'github_reference',
      'Palo Alto Networks Threat Prevention Signature ID',
      'mdi external id',
      'snort sid',
      'google secops rule name',
    ]) {
      expect(classifyRuleType(type).kind).toBe('reference')
      expect(isDeployableRule(type)).toBe(false)
    }
  })

  // Classified as reference on explicit instruction: a script quoted from an
  // article is real material but is not a deployable detection query.
  it('treats quoted code and scripts as reference material', () => {
    for (const type of ['powershell', 'bash', 'shell script', 'PHP', 'javascript', 'typescript', 'curl', 'graphql/curl']) {
      expect(classifyRuleType(type).kind).toBe('reference')
    }
  })

  it('separates prose from anything machine-readable', () => {
    for (const type of ['log analysis', 'logic description', 'hunting artifact', 'pseudo-detection analytic']) {
      expect(classifyRuleType(type).kind).toBe('description')
      expect(isDeployableRule(type)).toBe(false)
    }
  })

  // An unknown type must NOT collapse to 'other'. Coercing it would destroy
  // the only record of a vocabulary gap -- the D3 lesson applied here.
  it('preserves an unrecognised type and flags it', () => {
    const result = classifyRuleType('Vendor Hunting Language v2')
    expect(result.recognized).toBe(false)
    expect(result.language).toBe('vendor hunting language v2')
    // Erring toward usable rather than hidden.
    expect(result.kind).toBe('query')
  })

  it('handles empty and missing input', () => {
    for (const input of ['', null, undefined]) {
      expect(classifyRuleType(input).recognized).toBe(false)
    }
  })
})

describe('against the live corpus', () => {
  it('recognises every stored type except the explicit unknown sentinel', () => {
    const unrecognised = CORPUS
      .filter(([type]) => !classifyRuleType(type).recognized)
      .map(([type]) => type)

    // 'other' is what the extractor itself writes when the model gave no type.
    // Reporting it as unrecognised is correct -- we genuinely do not know.
    expect(unrecognised.sort()).toEqual(['Other', 'other'])
  })

  it('classifies roughly a third of stored rules as not deployable', () => {
    const total = CORPUS.reduce((sum, [, n]) => sum + n, 0)
    const notDeployable = CORPUS
      .filter(([type]) => !isDeployableRule(type))
      .reduce((sum, [, n]) => sum + n, 0)

    expect(total).toBe(411)
    // Pinned so a vocabulary change that silently reclassifies a large block
    // of rules shows up as a failure rather than a surprise.
    expect(notDeployable).toBe(147)
  })
})

/**
 * E2. classifyRuleType decides from the declared type alone, which cannot
 * catch a rule whose type tells the truth and whose content does not. Every
 * content string below is verbatim from the corpus, where all of them were
 * marked deployable because their declared language is real.
 */
describe('classifyRule (type AND content)', () => {
  it('demotes an identifier wearing a language label', () => {
    const cases: [string, string][] = [
      ['snort', '66788'],                                  // a SID
      ['snort', 'Snort 2 SIDs: 66409, 66410, 66408'],      // a list of SIDs
      ['clamav', 'Win.Trojan.CloudZRAT-10059935-0'],       // a signature name
      ['clamav', 'Ps1.Trojan.Agent-10060317-0'],
      ['yara', 'MAL_RANSOM_INC_Aug24'],                    // a rule name
      ['sigma', '404: Not Found'],                         // a failed fetch
    ]
    for (const [type, content] of cases) {
      const result = classifyRule(type, content)
      expect(result.kind).toBe('reference')
      expect(result.demotedByContent).toBe(true)
      // The row is relabelled, never dropped: the identifier is the point.
      expect(result.language).toBe(classifyRuleType(type).language)
    }
  })

  it('leaves a genuine rule alone', () => {
    const snort = 'alert tcp any any -> any 80 (msg:"test"; sid:1;)'
    expect(classifyRule('snort', snort)).toMatchObject({ kind: 'query', demotedByContent: false })

    const sigma = 'title: X\nlogsource:\n  product: windows\ndetection:\n  sel:\n    EventID: 1\n  condition: sel'
    expect(classifyRule('sigma', sigma)).toMatchObject({ kind: 'query', demotedByContent: false })

    const yara = 'rule Foo {\n strings:\n  $a = "x"\n condition:\n  $a\n}'
    expect(classifyRule('yara', yara)).toMatchObject({ kind: 'query', demotedByContent: false })

    const kql = 'DeviceProcessEvents | where FileName == "x.exe"'
    expect(classifyRule('kql', kql)).toMatchObject({ kind: 'query', demotedByContent: false })

    const clamav = 'Win.Trojan.Foo-1-0:1:*:6a0068'
    expect(classifyRule('clamav', clamav)).toMatchObject({ kind: 'query', demotedByContent: false })
  })

  // Both found by dry-running the backfill against the corpus. An earlier
  // draft of the shape tests demoted these real, deployable rules.
  it('keeps a Sentinel analytics rule that carries query: rather than detection:', () => {
    const sentinel = [
      'id: a3a09840-1022-4267-b9e1-d6c9799ed38a',
      'name: Account MFA Modifications',
      'requiredDataConnectors:',
      '  - connectorId: AzureActiveDirectory',
      'query: |',
      '  AuditLogs | where OperationName has "MFA"',
    ].join('\n')
    expect(classifyRule('sigma', sentinel)).toMatchObject({ kind: 'query', demotedByContent: false })
  })

  it('keeps a Wiz query, which is URL-encoded and has no whitespace', () => {
    const wiz = "filters~(~(eventType~'Action*20performed')~range~(relative~86400000))"
    expect(wiz).not.toMatch(/\s/)
    expect(classifyRule('wiz_cloud_event_query', wiz)).toMatchObject({ kind: 'query', demotedByContent: false })
  })

  // But a Sigma header with no detection logic at all is still a reference:
  // the article quoted the metadata, not the rule.
  it('demotes a Sigma rule that is metadata only', () => {
    const header = 'title: Veeam Credential Dumping via PostgreSQL psql\nid: 410f5c82-1fec-42d0-9552-7d9d885517b2\ndescription: Detects the extraction of credentials.'
    expect(classifyRule('sigma', header)).toMatchObject({ kind: 'reference', demotedByContent: true })
  })

  it('does not re-promote something already known not to be a query', () => {
    // A GitHub URL is a single token, but it was never a query to begin with.
    const result = classifyRule('github_reference', 'https://github.com/o/r/blob/main/x.yaml')
    expect(result.kind).toBe('reference')
    expect(result.demotedByContent).toBe(false)
  })

  it('treats empty content as not a query', () => {
    expect(classifyRule('kql', '').kind).toBe('reference')
    expect(classifyRule('kql', null).kind).toBe('reference')
  })
})

describe('hasQueryShape', () => {
  // The general rule for languages with no specific grammar: a query has more
  // than one token. A bare identifier is a name, not something you can run.
  it('rejects a single bare token in any language', () => {
    for (const language of ['kql', 'spl', 'eql', 'xql']) {
      expect(hasQueryShape(language, 'SomeIdentifier-123')).toBe(false)
      expect(hasQueryShape(language, 'x | where y == 1')).toBe(true)
    }
  })

  it('requires the token each grammar mandates', () => {
    expect(hasQueryShape('sigma', 'title: X\nlogsource: y')).toBe(false)
    expect(hasQueryShape('sigma', 'detection:\n  condition: sel')).toBe(true)
    expect(hasQueryShape('yara', 'rule Foo { strings: $a = "x" }')).toBe(false)
    expect(hasQueryShape('yara', 'rule Foo { condition: true }')).toBe(true)
    expect(hasQueryShape('snort', 'Snort 3 SIDs: 301492, 66408')).toBe(false)
    expect(hasQueryShape('snort', 'alert tcp any any -> any any (sid:1;)')).toBe(true)
  })
})

describe('squashRuleType', () => {
  it('collapses any run of separators to one underscore', () => {
    expect(squashRuleType('ES|QL')).toBe('es_ql')
    expect(squashRuleType('pseudo-detection analytic')).toBe('pseudo_detection_analytic')
    expect(squashRuleType('  KQL  ')).toBe('kql')
  })
})
