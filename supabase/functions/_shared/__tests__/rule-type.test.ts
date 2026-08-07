import { describe, expect, it } from 'vitest'
import {
  QUERY_LANGUAGES,
  classifyRuleType,
  isDeployableRule,
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

describe('squashRuleType', () => {
  it('collapses any run of separators to one underscore', () => {
    expect(squashRuleType('ES|QL')).toBe('es_ql')
    expect(squashRuleType('pseudo-detection analytic')).toBe('pseudo_detection_analytic')
    expect(squashRuleType('  KQL  ')).toBe('kql')
  })
})
