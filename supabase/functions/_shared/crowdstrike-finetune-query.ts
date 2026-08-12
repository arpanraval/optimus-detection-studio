import { validateUrl } from './url-validator.ts'
import {
  isCrowdStrikeQueryRepository,
  type CrowdStrikeQueryRepository,
} from './crowdstrike-preflight.ts'

declare const Deno: { env: { get(key: string): string | undefined } }

export interface CrowdStrikeFinetuneQueryResult {
  events: Record<string, unknown>[]
  jobId: string
}

function queryJobsUrl(baseUrl: string, repository: CrowdStrikeQueryRepository, jobId?: string): string {
  const root = `${baseUrl.replace(/\/+$/u, '')}/humio/api/v1/repositories/${encodeURIComponent(repository)}/queryjobs`
  return jobId ? `${root}/${encodeURIComponent(jobId)}` : root
}

async function checkedFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const validation = validateUrl(url)
  if (!validation.valid || !validation.sanitizedUrl) {
    throw new Error(`CrowdStrike URL rejected: ${validation.error ?? 'invalid URL'}`)
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(validation.sanitizedUrl, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function encryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('INTEGRATION_ENCRYPTION_KEY')
  if (!keyHex || !/^[a-fA-F0-9]{64}$/u.test(keyHex)) {
    throw new Error('INTEGRATION_ENCRYPTION_KEY is missing or invalid.')
  }
  const bytes = new Uint8Array(keyHex.match(/.{2}/gu)?.map((byte) => Number.parseInt(byte, 16)) ?? [])
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt'])
}

export async function decryptCrowdStrikeCredentials(encryptedBase64: string): Promise<Record<string, string>> {
  const combined = Uint8Array.from(atob(encryptedBase64), (character) => character.charCodeAt(0))
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: combined.slice(0, 12) },
    await encryptionKey(),
    combined.slice(12),
  )
  return JSON.parse(new TextDecoder().decode(decrypted)) as Record<string, string>
}

export async function getCrowdStrikeToken(
  baseUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const response = await checkedFetch(`${baseUrl.replace(/\/+$/u, '')}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }).toString(),
  }, 30_000)
  const text = await response.text()
  if (!response.ok) throw new Error(`CrowdStrike authentication failed (${response.status}): ${text.slice(0, 240)}`)
  const data = JSON.parse(text) as { access_token?: string }
  if (!data.access_token) throw new Error('CrowdStrike did not return an access token.')
  return data.access_token
}

export function validateBoundedCrowdStrikeCql(query: string): string | null {
  const normalized = query.trim().replace(/;+$/gu, '').trim()
  if (!normalized) return 'The CQL query is empty.'
  if (normalized.length > 50_000) return 'The CQL query exceeds the 50,000 character limit.'
  if (!/\|\s*(count|groupBy|top|head|tail|table|timeChart)\s*\(/iu.test(normalized)) {
    return 'The CQL query must use a bounded count, groupBy, top, head, tail, table, or timeChart operation.'
  }
  return null
}

export async function runCrowdStrikeFinetuneQuery(args: {
  baseUrl: string
  repository: string
  token: string
  query: string
  windowDays: number
  timeoutMs?: number
}): Promise<CrowdStrikeFinetuneQueryResult> {
  if (!isCrowdStrikeQueryRepository(args.repository)) throw new Error('Invalid CrowdStrike repository.')
  const timeoutMs = args.timeoutMs ?? 60_000
  const start = await checkedFetch(queryJobsUrl(args.baseUrl, args.repository), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      queryString: args.query,
      start: `${Math.min(Math.max(Math.round(args.windowDays), 1), 90)}d`,
      end: 'now',
      useIngestTime: false,
    }),
  }, 30_000)
  const startText = await start.text()
  if (!start.ok) throw new Error(`CrowdStrike query failed (${start.status}): ${startText.slice(0, 300)}`)
  const started = JSON.parse(startText) as { id?: string }
  if (!started.id) throw new Error('CrowdStrike did not return a query job ID.')

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const response = await checkedFetch(queryJobsUrl(args.baseUrl, args.repository, started.id), {
      method: 'GET',
      headers: { Authorization: `Bearer ${args.token}`, Accept: 'application/json' },
    }, 30_000)
    const text = await response.text()
    if (!response.ok) throw new Error(`CrowdStrike query polling failed (${response.status}): ${text.slice(0, 300)}`)
    const job = JSON.parse(text) as {
      done?: boolean
      cancelled?: boolean
      events?: Record<string, unknown>[]
      errors?: Array<{ message?: string }>
    }
    if (job.cancelled) throw new Error('CrowdStrike cancelled the query job.')
    if (job.errors?.length) throw new Error(job.errors[0]?.message || 'CrowdStrike query failed.')
    if (job.done) return { events: Array.isArray(job.events) ? job.events : [], jobId: started.id }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }

  await checkedFetch(queryJobsUrl(args.baseUrl, args.repository, started.id), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${args.token}`, Accept: 'application/json' },
  }, 15_000).catch(() => undefined)
  throw new Error('CrowdStrike query exceeded the 60 second fine-tuning limit.')
}
