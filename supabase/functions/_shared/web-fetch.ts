// supabase/functions/_shared/web-fetch.ts
//
// Plain-fetch page-content retriever, companion to web-search.ts. A search
// result snippet is often too short to extract the technical detail an
// agent actually needs (a full command line, a registry key, an IOC list);
// web_fetch reads one specific URL in full. No headless browser — a
// straight GET plus a best-effort HTML-to-text strip. Mirrors web-search.ts's
// shape (cache, AbortSignal timeout, graceful degradation on failure).

export interface WebFetchResult {
  url: string;
  title?: string;
  text?: string;
  error?: string;
}

const WEB_FETCH_TIMEOUT_MS = 20_000;
// Leaves headroom under agent-loop.ts's TOOL_RESULT_MAX_CHARS (12000), which
// truncates the whole JSON-serialized tool result, not just this field.
const MAX_FETCH_CHARS = 8_000;

async function sha1(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-1', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function htmlToText(html: string): { title?: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : undefined;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return { title, text };
}

export interface WebFetchOpts {
  url: string;
  /** Optional in-process cache, keyed by sha1(url). */
  cache?: Map<string, WebFetchResult>;
  /** Override the default 20s timeout. Callers doing a best-effort,
   *  fail-open check (e.g. the citation-check validator) want a shorter
   *  budget than an agent's deliberate web_fetch tool call. */
  timeoutMs?: number;
}

export async function webFetch(opts: WebFetchOpts): Promise<WebFetchResult> {
  const { url, cache, timeoutMs = WEB_FETCH_TIMEOUT_MS } = opts;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { url, error: 'Invalid URL.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { url, error: 'Only http/https URLs are supported.' };
  }

  const cacheKey = await sha1(url);
  if (cache?.has(cacheKey)) return cache.get(cacheKey)!;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OptimusDetectionStudio/1.0; +threat-research)' },
      // Same rationale as web-search.ts: AbortSignal.timeout is Rust-runtime
      // enforced, so it still fires if the Deno isolate hibernates on a
      // stalled connection, unlike a JS-level setTimeout.
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { url, error: `Fetch failed: HTTP ${response.status}` };
    }
    const contentType = response.headers.get('content-type') ?? '';
    const raw = await response.text();
    const { title, text } = contentType.includes('html') || !contentType
      ? htmlToText(raw)
      : { title: undefined, text: raw.replace(/\s+/g, ' ').trim() };

    const result: WebFetchResult = { url, title, text: text.slice(0, MAX_FETCH_CHARS) };
    if (cache) cache.set(cacheKey, result);
    return result;
  } catch (e) {
    const name = (e as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { url, error: 'Fetch timed out.' };
    }
    return { url, error: `Fetch failed: ${(e as Error).message.slice(0, 200)}` };
  }
}
