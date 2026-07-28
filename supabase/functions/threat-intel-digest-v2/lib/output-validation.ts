import type {
  ExtractedIoC,
  ExtractedRule,
  ExtractedTTP,
  ReportClassification,
  ReportSummary,
} from './types.ts'
import { AttackType, ThreatLevel, getIoCCategory } from './types.ts'

export const MAX_MODEL_OUTPUT_CHARS = 1_000_000
export const ALLOWED_MODEL_IDS = new Set([
  'gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview',
  'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano',
  'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5',
])

const CONFIDENCES = new Set(['high', 'medium', 'low'])
const MITRE_ID = /^T\d{4}(?:\.\d{3})?$/

export function assertAllowedModel(model: string): void {
  if (!ALLOWED_MODEL_IDS.has(model)) throw new Error('Requested AI model is not on the server allowlist')
}

export async function readProviderJson(response: Response): Promise<any> {
  const text = await response.text()
  if (text.length > MAX_MODEL_OUTPUT_CHARS) throw new Error('AI response exceeded output limit')
  try { return JSON.parse(text) } catch { throw new Error('AI provider returned invalid JSON') }
}

export function validateSummary(value: any): ReportSummary {
  if (!value || typeof value !== 'object') throw new Error('Summary must be an object')
  if (typeof value.title !== 'string' || !value.title.trim()) throw new Error('Summary title is required')
  if (typeof value.executiveSummary !== 'string') throw new Error('Summary executiveSummary is required')
  if (!Array.isArray(value.keyFindings) || value.keyFindings.some((item: unknown) => typeof item !== 'string')) {
    throw new Error('Summary keyFindings must be a string array')
  }
  if (!Object.values(ThreatLevel).includes(value.threatLevel)) throw new Error('Summary threatLevel is invalid')
  return {
    ...value,
    title: value.title.slice(0, 500),
    executiveSummary: value.executiveSummary.slice(0, 50_000),
    keyFindings: value.keyFindings.slice(0, 50).map((finding: string) => finding.slice(0, 2_000)),
  } as ReportSummary
}

export function validateClassification(value: any): ReportClassification {
  if (!value || typeof value !== 'object') throw new Error('Classification must be an object')
  if (!Object.values(AttackType).includes(value.primaryType)) throw new Error('Classification primaryType is invalid')
  if (value.secondaryTypes && (!Array.isArray(value.secondaryTypes) || value.secondaryTypes.some((item: unknown) => !Object.values(AttackType).includes(item as AttackType)))) {
    throw new Error('Classification secondaryTypes is invalid')
  }
  if (!CONFIDENCES.has(value.confidence)) throw new Error('Classification confidence is invalid')
  if (typeof value.reasoning !== 'string') throw new Error('Classification reasoning is required')
  return { ...value, reasoning: value.reasoning.slice(0, 10_000) } as ReportClassification
}

export function validateTTPs(items: any[]): ExtractedTTP[] {
  if (!Array.isArray(items) || items.length > 200) throw new Error('TTP output must be a bounded array')
  return items.map((item, index) => {
    if (!item || typeof item !== 'object' || !MITRE_ID.test(String(item.mitreId || ''))) throw new Error(`TTP ${index + 1} has an invalid MITRE ID`)
    if (!CONFIDENCES.has(item.confidence)) throw new Error(`TTP ${index + 1} has invalid confidence`)
    if (!['explicit', 'contextual'].includes(item.sourceType)) throw new Error(`TTP ${index + 1} has invalid sourceType`)
    return {
      ...item,
      id: typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID(),
      mitreId: String(item.mitreId),
      techniqueName: String(item.techniqueName || item.mitreId).slice(0, 300),
      tacticName: String(item.tacticName || 'Unknown').slice(0, 200),
      tacticId: String(item.tacticId || '').slice(0, 100),
      evidence: String(item.evidence || '').slice(0, 10_000),
      explanation: String(item.explanation || '').slice(0, 10_000),
      evidenceSupported: undefined,
    } as ExtractedTTP
  })
}

function normalizeDefanged(value: string): { normalized: string; original: string } {
  const original = value.trim()
  const normalized = original
    .replace(/\[\.\]/gi, '.')
    .replace(/\(\.\)/gi, '.')
    .replace(/\[at\]/gi, '@')
    .replace(/\(at\)/gi, '@')
    .replace(/\s*:\s*\/\//, '://')
  return { normalized, original }
}

export function validateIoC(type: string, rawValue: unknown): Pick<ExtractedIoC, 'value' | 'originalValue' | 'defanged' | 'category'> {
  if (typeof rawValue !== 'string' || !rawValue.trim() || rawValue.length > 2_000) throw new Error('IoC value is invalid')
  const { normalized, original } = normalizeDefanged(rawValue)
  const lowerType = type.toLowerCase()
  const patterns: Record<string, RegExp> = {
    ipv4: /^(?:\d{1,3}\.){3}\d{1,3}$/, ipv6: /^[0-9a-f:]+$/i, domain: /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, md5: /^[0-9a-f]{32}$/i, sha1: /^[0-9a-f]{40}$/i,
    sha256: /^[0-9a-f]{64}$/i, sha512: /^[0-9a-f]{128}$/i, cve: /^CVE-\d{4}-\d{4,}$/i,
    url: /^https?:\/\/[^\s]+$/i,
  }
  const pattern = patterns[lowerType]
  if (pattern && !pattern.test(normalized)) throw new Error(`IoC ${lowerType} failed syntax validation`)
  return { value: normalized, originalValue: original, defanged: normalized !== original, category: getIoCCategory(lowerType) }
}

export function validateRuleCandidate(value: any): ExtractedRule {
  if (!value || typeof value !== 'object' || typeof value.query_content !== 'string' || !value.query_content.trim()) {
    throw new Error('Detection query candidate is invalid')
  }
  const content = value.query_content.slice(0, 100_000)
  return {
    id: crypto.randomUUID(), type: String(value.query_type || 'other').slice(0, 100),
    name: String(value.description || `${value.query_type || 'Candidate'} query`).slice(0, 300),
    content, description: String(value.context || value.description || '').slice(0, 2_000),
    provenance: ['verbatim', 'pattern_extracted', 'reconstructed', 'generated', 'external_link'].includes(value.provenance)
      ? value.provenance : 'generated',
    isValidated: false,
    validationStatus: 'candidate',
  } as ExtractedRule
}
