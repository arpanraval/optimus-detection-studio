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

/**
 * Maximum number of redirects to follow
 */
const MAX_REDIRECTS = 5

/**
 * Fetch timeout in milliseconds
 */
const FETCH_TIMEOUT = 30000

/**
 * Fetches content from a URL using Jina Reader with fallback to direct fetch.
 * Jina Reader handles JavaScript-rendered content better than direct fetch.
 *
 * Includes SSRF protection to block requests to internal/private networks.
 */
export async function fetchContent(url: string): Promise<FetchResult> {
  // Validate URL before any fetch operation (SSRF protection)
  const urlValidation = validateUrl(url)
  if (!urlValidation.valid) {
    throw new Error(`URL validation failed: ${urlValidation.error}`)
  }

  const safeUrl = urlValidation.sanitizedUrl!
  console.log(`URL validated: ${safeUrl}`)

  // Try Jina Reader first - it handles JS rendering
  // Note: Jina Reader is a trusted external service, we validate the input URL
  const jinaUrl = `https://r.jina.ai/${safeUrl}`
  console.log(`Fetching via Jina Reader: ${jinaUrl}`)

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
      console.log(`Jina Reader response: ${markdown.length} chars`)

      if (markdown && markdown.length > 1000) {
        console.log(`Jina Reader success: ${markdown.length} chars`)

        // Extract title from markdown (first # heading)
        const titleMatch = markdown.match(/^#\s+(.+)$/m)

        return {
          content: markdown,
          title: titleMatch?.[1]?.trim(),
          metadata: {}
        }
      }
    }
    console.log('Jina Reader returned insufficient content, falling back to direct fetch')
  } catch (e) {
    console.log('Jina Reader failed, falling back to direct fetch:', e)
  }

  // Fallback to direct fetch with manual redirect handling for SSRF protection
  return await fetchWithSafeRedirects(safeUrl)
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

    console.log(`Following redirect ${redirectCount + 1}: ${absoluteRedirectUrl}`)
    return await fetchWithSafeRedirects(redirectValidation.sanitizedUrl!, redirectCount + 1)
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
  }

  console.log(`Direct fetch success: ${url}`)
  const html = await response.text()
  console.log(`HTML length: ${html.length} chars`)

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
