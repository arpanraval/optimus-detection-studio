/**
 * Content Fetcher Module
 *
 * Handles fetching content from URLs and parsing HTML to extract text.
 * Uses Jina Reader for JavaScript-rendered content with direct fetch fallback.
 * Includes SSRF protection via URL validation.
 *
 */

import type { FetchResult } from './types.ts'
import { validateUrl, validateRedirect } from '../../_shared/url-validator.ts'
import { classifySourceQuality } from './evidence-quality.ts'

/**
 * Maximum number of redirects to follow
 */
const MAX_REDIRECTS = 5

/**
 * Fetch timeout in milliseconds
 */
const MAX_RESPONSE_CHARS = 5_000_000;
const FETCH_TIMEOUT = 30000
const SENSITIVE_QUERY_KEY = /^(?:api[_-]?key|token|secret|password|passwd|credential|auth|signature|sig|access[_-]?token)$/i

async function contentHash(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function addContentMetadata(result: FetchResult, fetchedUrl: string): Promise<FetchResult> {
  const sourceContent = result.content || ''
  return {
    ...result,
    metadata: {
      ...(result.metadata || {}),
      sourceQuality: classifySourceQuality(sourceContent),
      sourceContentLength: sourceContent.length,
      sourceContentHash: await contentHash(sourceContent),
      fetchedUrl,
    },
  }
}

function hasSensitiveQueryParameters(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    return [...parsed.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEY.test(key))
  } catch {
    return true
  }
}

function redactSensitiveQueryParameters(rawUrl: string): string {
  const parsed = new URL(rawUrl)
  for (const key of [...parsed.searchParams.keys()]) {
    if (SENSITIVE_QUERY_KEY.test(key)) parsed.searchParams.delete(key)
  }
  return parsed.toString()
}

/**
 * Fetches content from a URL using Jina Reader with fallback to direct fetch.
 * Jina Reader handles JavaScript-rendered content better than direct fetch.
 *
 * Includes SSRF protection to block requests to internal/private networks.
 */
export async function fetchContent(url: string, options: { extractionMethod?: string } = {}): Promise<FetchResult> {
  // Validate URL before any fetch operation (SSRF protection)
  const urlValidation = validateUrl(url)
  if (!urlValidation.valid) {
    throw new Error(`URL validation failed: ${urlValidation.error}`)
  }

  const safeUrl = urlValidation.sanitizedUrl!
  console.log('URL validated for article fetch')

  const requestedJina = options.extractionMethod === 'jina_reader';
  const useJina = requestedJina && !hasSensitiveQueryParameters(safeUrl);
  if (requestedJina && !useJina) {
    console.warn('Jina Reader disabled for a URL containing sensitive query parameters')
  }
  if (useJina) {
  // Try Jina Reader first - it handles JS rendering
  // Note: Jina Reader is a trusted external service, we validate the input URL
  const jinaUrl = 'https://r.jina.ai/' + redactSensitiveQueryParameters(safeUrl)
  console.log('Fetching article via opted-in Jina Reader')

  try {
    const jinaResponse = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'markdown',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })

    if (jinaResponse.ok) {
      const markdown = await jinaResponse.text()
      if (markdown.length > MAX_RESPONSE_CHARS) throw new Error('Jina response exceeds decompressed size limit')
      console.log(`Jina Reader response: ${markdown.length} chars`)

      if (markdown && markdown.length > 1000) {
        console.log(`Jina Reader success: ${markdown.length} chars`)

        // Extract title from markdown (first # heading)
        const titleMatch = markdown.match(/^#\s+(.+)$/m)

        return await addContentMetadata({
          content: markdown,
          title: titleMatch?.[1]?.trim(),
          metadata: {}
        }, safeUrl)
      }
    }
    console.log('Jina Reader returned insufficient content, falling back to direct fetch')
  } catch (_e) {
    console.warn('Jina Reader failed, falling back to direct fetch')
  }

  }
  // Fallback to direct fetch with manual redirect handling for SSRF protection
  return await addContentMetadata(await fetchWithSafeRedirects(safeUrl), safeUrl)
}

/**
 * Fetch URL with manual redirect handling to validate each redirect target.
 * Prevents SSRF via redirect-based attacks.
 */
async function fetchWithSafeRedirects(url: string, redirectCount: number = 0): Promise<FetchResult> {
  if (redirectCount >= MAX_REDIRECTS) {
    throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`)
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
    redirect: 'manual', // Don't auto-follow redirects - we validate each one
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })

  // Handle redirects with validation
  if (response.status >= 300 && response.status < 400) {
    const redirectUrl = response.headers.get('Location')
    if (!redirectUrl) {
      throw new Error(`Redirect response (${response.status}) missing Location header`)
    }

    // Resolve relative URLs
    const absoluteRedirectUrl = new URL(redirectUrl, url).toString()

    // Validate redirect target for SSRF protection
    const redirectValidation = validateRedirect(url, absoluteRedirectUrl)
    if (!redirectValidation.valid) {
      throw new Error(`Redirect blocked: ${redirectValidation.error}`)
    }

    console.log(`Following redirect ${redirectCount + 1}`)
    return await fetchWithSafeRedirects(redirectValidation.sanitizedUrl!, redirectCount + 1)
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
  }

  const advertisedLength = Number(response.headers.get('content-length') || 0)
  if (advertisedLength > MAX_RESPONSE_CHARS) throw new Error('Response exceeds declared size limit')
  console.log('Direct fetch succeeded')
  const html = await response.text()
  console.log(`HTML length: ${html.length} chars`)
  if (html.length > MAX_RESPONSE_CHARS) throw new Error('Response exceeds decompressed size limit')

  return parseHTML(html)
}

/**
 * Parses HTML content to extract text, metadata, and preserve code blocks.
 */
export function parseHTML(html: string): FetchResult {
  // Extract metadata
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i) ||
                     html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)
  const title = titleMatch?.[1]?.trim()

  const authorMatch = html.match(/<meta[^>]*name="author"[^>]*content="([^"]+)"/i)
  const author = authorMatch?.[1]?.trim()

  const publishDateMatch = html.match(/<meta[^>]*property="article:published_time"[^>]*content="([^"]+)"/i)
  const publishDate = publishDateMatch?.[1]?.trim()

  // Extract code blocks - preserve line breaks and comments
  const codeBlocks: string[] = []
  let processedHtml = html.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => {
    // Convert line break elements to actual newlines BEFORE stripping tags
    const cleanCode = code
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')  // Now strip remaining tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .trim()

    if (cleanCode.length > 30) {
      codeBlocks.push(cleanCode)
      return `\n\`\`\`\n${cleanCode}\n\`\`\`\n`
    }
    return cleanCode
  })

  // Remove non-content elements
  processedHtml = processedHtml
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')

  // Get main content
  const articleMatch = processedHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  const mainMatch = processedHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
  const bodyMatch = processedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  let contentHtml = articleMatch?.[1] || mainMatch?.[1] || bodyMatch?.[1] || processedHtml

  // Convert to text
  let content = contentHtml
    // Fold hyperlink targets into the text BEFORE tags are stripped.
    //
    // Vendor writeups routinely publish their detection rules as bare anchor
    // text pointing at a rule file -- the Elastic CHAINDROP article listed ten
    // rules as links to .toml files in elastic/detection-rules and
    // elastic/protections-artifacts. Stripping the tag kept the rule NAME and
    // discarded the href, which is the only part that identifies the rule and
    // the only part rule-extractor's GitHub sweep can match on. The result was
    // a report that recorded 3 inline queries and none of the 10 references,
    // leaving the fetch-rule-inline UI with nothing to offer.
    //
    // Emitted as "text ( url )" so both the extractor's URL regex and the model
    // reading the prose see the same thing. Non-http hrefs (relative paths,
    // in-page anchors, mailto:) carry no rule identity and are dropped.
    //
    // The space before the closing paren is load-bearing. rule-extractor
    // matches URLs with [^\s<>"']+, which treats ")" as part of the URL -- so
    // "(url)" yields a trailing paren on every captured link and every
    // subsequent fetch 404s. Whitespace is what terminates that match.
    .replace(
      /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_match: string, href: string, inner: string) => {
        const text = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        const url = href.trim()
        if (!/^https?:\/\//i.test(url)) return ` ${text} `
        if (!text || text === url) return ` ${url} `
        return ` ${text} ( ${url} ) `
      },
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()

  return {
    content,
    title,
    metadata: { author, publishDate }
  }
}
