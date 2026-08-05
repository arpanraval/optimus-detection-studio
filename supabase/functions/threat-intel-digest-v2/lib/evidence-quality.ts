import type { ExtractedIoC, ExtractedRule, ExtractedTTP } from './types.ts'

export type SourceQuality = 'full_article' | 'partial_article' | 'feed_summary' | 'title_only' | 'unavailable' | 'legacy_unverified'

export interface EvidenceQualityResult {
  sourceQuality: SourceQuality
  sourceContentLength: number
  warnings: string[]
  ttps: ExtractedTTP[]
  iocs: ExtractedIoC[]
  rules: ExtractedRule[]
}

const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'using', 'into', 'their', 'there'])

export function classifySourceQuality(content: string | null | undefined): SourceQuality {
  const length = (content || '').trim().length
  if (length === 0) return 'unavailable'
  if (length < 180) return 'title_only'
  if (length < 800) return 'feed_summary'
  if (length < 1_500) return 'partial_article'
  return 'full_article'
}

export function normalizeEvidenceText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\[\.\]|\(\.\)/g, '.')
    .replace(/\[at\]|\(at\)/g, '@')
    .replace(/[^a-z0-9@.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function meaningfulTokens(value: string): string[] {
  return normalizeEvidenceText(value)
    .split(' ')
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
}

export function evidenceIsSupported(source: string, evidence: string | null | undefined): boolean {
  const normalizedSource = normalizeEvidenceText(source)
  const normalizedEvidence = normalizeEvidenceText(evidence || '')
  if (!normalizedEvidence || normalizedEvidence.length < 12) return false
  if (normalizedSource.includes(normalizedEvidence)) return true
  const evidenceTokens = new Set(meaningfulTokens(normalizedEvidence))
  const sourceTokens = new Set(meaningfulTokens(normalizedSource))
  if (evidenceTokens.size < 3) return false
  const overlap = [...evidenceTokens].filter((token) => sourceTokens.has(token)).length / evidenceTokens.size
  return overlap >= 0.45
}

function indicatorAppearsInSource(source: string, value: string): boolean {
  const normalizedSource = normalizeEvidenceText(source)
  const normalizedValue = normalizeEvidenceText(value)
  return Boolean(normalizedValue) && normalizedSource.includes(normalizedValue)
}

export function namesAreCompatible(aiName: string | undefined, canonicalName: string | undefined): boolean {
  const aiTokens = new Set(meaningfulTokens(aiName || ''))
  const canonicalTokens = new Set(meaningfulTokens(canonicalName || ''))
  if (aiTokens.size === 0 || canonicalTokens.size === 0) return false
  const overlap = [...aiTokens].filter((token) => canonicalTokens.has(token)).length
  return overlap >= Math.max(1, Math.ceil(Math.min(aiTokens.size, canonicalTokens.size) * 0.5))
}

export function applyEvidenceQualityGate(content: string, ttps: ExtractedTTP[], iocs: ExtractedIoC[], rules: ExtractedRule[]): EvidenceQualityResult {
  const sourceQuality = classifySourceQuality(content)
  const sourceContentLength = content.trim().length
  const warnings: string[] = []
  if (sourceQuality !== 'full_article') warnings.push(`Source evidence is ${sourceQuality} (${sourceContentLength} characters); extracted facts require analyst verification.`)

  const gatedTtps = ttps.map((ttp) => {
    const supported = evidenceIsSupported(content, ttp.evidence)
    if (!supported) {
      warnings.push(`TTP ${ttp.mitreId} has no source-supported evidence.`)
      return { ...ttp, provenance: 'rejected' as const, validationState: 'rejected' as const, evidenceSupported: false }
    }
    return { ...ttp, evidenceSupported: true }
  })

  const gatedIocs = iocs.map((ioc) => {
    const supported = indicatorAppearsInSource(content, ioc.originalValue || ioc.value)
    if (!supported) {
      warnings.push(`IoC ${ioc.type} was not found in source evidence.`)
      return { ...ioc, potentialFalsePositive: true, falsePositiveReason: ioc.falsePositiveReason || 'Indicator was not found in the fetched source; verify before use.', evidenceSupported: false }
    }
    return { ...ioc, evidenceSupported: true }
  })

  const gatedRules = rules.map((rule) => ({
    ...rule,
    provenance: rule.provenance || 'generated',
    isValidated: false,
    validationStatus: rule.validationStatus || 'candidate',
    evidenceSupported: evidenceIsSupported(content, rule.content),
  }))
  if (gatedRules.some((rule) => !rule.evidenceSupported)) warnings.push('One or more candidate queries are not directly supported by source text and remain unvalidated.')
  return { sourceQuality, sourceContentLength, warnings, ttps: gatedTtps, iocs: gatedIocs, rules: gatedRules }
}

export function actorHasAttributionEvidence(content: string, actor: string): boolean {
  const escaped = actor.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!escaped) return false
  const actorFirst = new RegExp(`(?:${escaped}).{0,180}(?:attribut|linked|responsib|operat|conduct|campaign|actor|group)`, 'i')
  const signalFirst = new RegExp(`(?:attribut|linked|responsib|operat|conduct|campaign|actor|group).{0,180}(?:${escaped})`, 'i')
  return actorFirst.test(content) || signalFirst.test(content)
}
