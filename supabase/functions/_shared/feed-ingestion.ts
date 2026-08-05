/** Shared, bounded feed ingestion primitives for RSS/Atom and TAXII 2.1. */

import { XMLParser } from 'npm:fast-xml-parser@5.2.5'
import { isRedirectStatus, validateRedirect, validateUrl } from './url-validator.ts'

export const MAX_FEED_BODY_BYTES = 5 * 1024 * 1024
export const MAX_TAXII_PAGES = 10
export const MAX_ITEMS_PER_FEED = 200

export interface FeedItem {
  externalId: string
  title: string
  description: string | null
  url: string | null
  publishedAt: string | null
  rawObject?: Record<string, unknown>
}

export interface FeedResponseMetadata {
  notModified: boolean
  etag: string | null
  lastModified: string | null
  httpStatus: number
}

export interface TaxiiOptions {
  apiRoot: string
  collectionId: string
  username?: string
  password?: string
  bearerToken?: string
  etag?: string | null
  lastModified?: string | null
}

const USER_AGENT = 'Optimus-Detection-Studio/3.0 FeedIngestion'

function textValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    return textValue(object['#text'] ?? object.text ?? '')
  }
  return ''
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value]
}

function itemLink(value: unknown): string | null {
  for (const candidate of arrayValue(value)) {
    if (typeof candidate === 'string') return candidate.trim() || null
    if (candidate && typeof candidate === 'object') {
      const object = candidate as Record<string, unknown>
      const href = textValue(object['@_href'] ?? object.href)
      const rel = textValue(object['@_rel'] ?? object.rel)
      if (!rel || rel === 'alternate') return href || textValue(object['#text']) || null
    }
  }
  return null
}

export function canonicalizeUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null
  const validation = validateUrl(rawUrl)
  if (!validation.valid || !validation.sanitizedUrl) return null
  const url = new URL(validation.sanitizedUrl)
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = ''
  }
  const removable = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'])
  for (const key of [...url.searchParams.keys()]) {
    if (removable.has(key.toLowerCase())) url.searchParams.delete(key)
  }
  return url.toString()
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function readBoundedBody(response: Response): Promise<string> {
  const advertisedLength = Number(response.headers.get('content-length') || 0)
  if (advertisedLength > MAX_FEED_BODY_BYTES) throw new Error('Feed response exceeds size limit')
  if (!response.body) return ''

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_FEED_BODY_BYTES) throw new Error('Feed response exceeds decompressed size limit')
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

async function fetchWithSafeRedirects(
  rawUrl: string,
  headers: Record<string, string>,
  redirectCount = 0,
): Promise<Response> {
  if (redirectCount >= 5) throw new Error('Too many feed redirects')
  const validation = validateUrl(rawUrl)
  if (!validation.valid || !validation.sanitizedUrl) throw new Error(`Feed URL blocked: ${validation.error}`)

  const response = await fetch(validation.sanitizedUrl, {
    headers: { 'User-Agent': USER_AGENT, ...headers },
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  })
  // 304 is a successful conditional-fetch outcome, not a redirect. Only the
  // Location-bearing redirect statuses should enter the redirect validator.
  if (!isRedirectStatus(response.status)) return response

  const location = response.headers.get('location')
  if (!location) throw new Error(`Redirect ${response.status} missing Location`)
  const target = new URL(location, validation.sanitizedUrl).toString()
  const redirectValidation = validateRedirect(validation.sanitizedUrl, target)
  if (!redirectValidation.valid || !redirectValidation.sanitizedUrl) {
    throw new Error(`Redirect blocked: ${redirectValidation.error}`)
  }
  return fetchWithSafeRedirects(redirectValidation.sanitizedUrl, headers, redirectCount + 1)
}

export function parseRssOrAtom(xml: string): FeedItem[] {
  if (xml.length > MAX_FEED_BODY_BYTES) throw new Error('Feed XML exceeds size limit')
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: true,
    processEntities: true,
  })
  const document = parser.parse(xml) as Record<string, any>
  const rssItems = arrayValue(document.rss?.channel?.item ?? document['rdf:RDF']?.item)
  const atomItems = arrayValue(document.feed?.entry)
  const sourceItems = rssItems.length > 0 ? rssItems : atomItems

  return sourceItems.slice(0, MAX_ITEMS_PER_FEED).map((raw: any, index): FeedItem | null => {
    const isAtom = atomItems.length > 0 && rssItems.length === 0
    const title = textValue(raw.title) || `Untitled feed item ${index + 1}`
    const url = itemLink(raw.link)
    const externalId = textValue(raw.guid ?? raw.id) || url
    const publishedAt = textValue(raw.pubDate ?? raw.published ?? raw.updated) || null
    if (!externalId) return null
    return {
      externalId,
      title,
      description: textValue(raw.description ?? raw.summary ?? raw.content) || null,
      url,
      publishedAt,
      rawObject: isAtom ? undefined : undefined,
    }
  }).filter((item): item is FeedItem => item !== null)
}

export async function fetchRssOrAtom(
  url: string,
  options: { etag?: string | null; lastModified?: string | null } = {},
): Promise<{ items: FeedItem[]; metadata: FeedResponseMetadata }> {
  const headers: Record<string, string> = { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/plain' }
  if (options.etag) headers['If-None-Match'] = options.etag
  if (options.lastModified) headers['If-Modified-Since'] = options.lastModified
  const response = await fetchWithSafeRedirects(url, headers)
  const metadata: FeedResponseMetadata = {
    notModified: response.status === 304,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
    httpStatus: response.status,
  }
  if (metadata.notModified) return { items: [], metadata }
  if (!response.ok) throw new Error(`Feed HTTP ${response.status}`)
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  if (contentType && !/(xml|rss|atom|text\/plain)/.test(contentType)) {
    throw new Error('Feed response content type is not XML')
  }
  return { items: parseRssOrAtom(await readBoundedBody(response)), metadata }
}

export async function fetchTaxii(
  options: TaxiiOptions,
): Promise<{ items: FeedItem[]; metadata: FeedResponseMetadata }> {
  const base = options.apiRoot.replace(/\/$/, '')
  const initialUrl = `${base}/collections/${encodeURIComponent(options.collectionId)}/objects/`
  const headers: Record<string, string> = { Accept: 'application/taxii+json;version=2.1, application/json' }
  if (options.bearerToken) headers.Authorization = `Bearer ${options.bearerToken}`
  else if (options.username && options.password) headers.Authorization = `Basic ${btoa(`${options.username}:${options.password}`)}`
  if (options.etag) headers['If-None-Match'] = options.etag
  if (options.lastModified) headers['If-Modified-Since'] = options.lastModified

  const items: FeedItem[] = []
  let nextUrl: string | null = initialUrl
  let metadata: FeedResponseMetadata = { notModified: false, etag: null, lastModified: null, httpStatus: 200 }
  for (let page = 0; nextUrl && page < MAX_TAXII_PAGES && items.length < MAX_ITEMS_PER_FEED; page += 1) {
    const response = await fetchWithSafeRedirects(nextUrl, headers)
    metadata = {
      notModified: response.status === 304,
      etag: response.headers.get('etag') ?? metadata.etag,
      lastModified: response.headers.get('last-modified') ?? metadata.lastModified,
      httpStatus: response.status,
    }
    if (metadata.notModified) return { items: [], metadata }
    if (!response.ok) throw new Error(`TAXII HTTP ${response.status}`)
    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    if (contentType && !contentType.includes('json')) throw new Error('TAXII response content type is not JSON')
    const body = JSON.parse(await readBoundedBody(response)) as Record<string, any>
    if (!Array.isArray(body.objects)) throw new Error('TAXII response has no objects array')
    for (const object of body.objects) {
      if (!object || typeof object.id !== 'string' || !/^[a-z0-9-]+--[0-9a-f-]{36}$/i.test(object.id)) continue
      items.push({
        externalId: object.id,
        title: String(object.name || object.type || object.id).slice(0, 500),
        description: object.description ? JSON.stringify(object.description).slice(0, 100_000) : JSON.stringify(object).slice(0, 100_000),
        url: null,
        publishedAt: object.created || object.modified || null,
        rawObject: object,
      })
      if (items.length >= MAX_ITEMS_PER_FEED) break
    }
    const next = typeof body.next === 'string' ? body.next : typeof body.next_page === 'string' ? body.next_page : null
    if (!next) break
    const nextValidation = validateRedirect(nextUrl, new URL(next, nextUrl).toString())
    if (!nextValidation.valid || !nextValidation.sanitizedUrl) throw new Error(`TAXII pagination URL blocked: ${nextValidation.error}`)
    nextUrl = nextValidation.sanitizedUrl
  }
  return { items, metadata }
}
