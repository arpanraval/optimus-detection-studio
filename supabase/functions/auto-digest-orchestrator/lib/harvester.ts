/**
 * Auto-Digest Orchestrator — RSS/Atom Feed Harvester
 *
 * Fetches enabled auto-digest feeds for a user, parses RSS 2.0 / Atom XML,
 * filters stale entries (>72 h), and upserts new entries into
 * threat_intel_feed_entries with digest_status = 'harvested'.
 */

import {
  assertPhaseBudget,
  PhaseBudgetExceeded,
  type FeedRow,
  type JobResultSummary,
} from './types.ts';
import { isRedirectStatus, validateUrl, validateRedirect } from '../../_shared/url-validator.ts';
import { canonicalizeUrl, fetchRssOrAtom, fetchTaxii, sha256Hex, type FeedItem } from '../../_shared/feed-ingestion.ts';
import { decryptCredentials } from '../../_shared/credential-crypto.ts';
import { emit, type RunContext } from './events.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_AGENT = 'Optimus-Detection-Studio/2.0 AutoDigest';
const FETCH_TIMEOUT_MS = 15_000;
const MAX_AGE_MS = 72 * 60 * 60 * 1000; // 72 hours

function hostForEvent(rawUrl: string | null | undefined): string | null {
  try { return rawUrl ? new URL(rawUrl).hostname : null; } catch { return null; }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Harvest all enabled auto-digest feeds for a user.
 *
 * 1. Queries threat_intel_feeds (is_enabled + is_auto_digest)
 * 2. For each feed: fetch → parse → filter by age → upsert
 * 3. Updates feed metadata (last_fetched_at / last_error)
 * 4. Mutates `result` with running totals
 *
 * @returns Array of newly inserted feed-entry IDs.
 */
export async function harvestFeeds(
  ctx: RunContext,
  result: JobResultSummary,
  deadlineMs?: number,
): Promise<string[]> {
  const { supabase, userId } = ctx;
  // 1. Get user's auto-digest feeds
  const { data: feeds, error: feedsError } = await supabase
    .from('threat_intel_feeds')
    .select('id, user_id, name, feed_type, url, is_auto_digest, extraction_method, taxii_api_root, taxii_collection_id, taxii_credential_id, taxii_config, etag, last_modified, fetch_attempts, consecutive_failures, max_items_per_fetch')
    .eq('user_id', userId)
    .eq('is_enabled', true)
    .eq('is_auto_digest', true);

  if (feedsError) {
    result.errors.push(`Feed query failed: ${feedsError.message}`);
    return [];
  }

  if (!feeds || feeds.length === 0) {
    return [];
  }

  const allNewIds: string[] = [];

  // 2. Process each feed
  for (const feed of feeds as FeedRow[]) {
    try {
      assertPhaseBudget(deadlineMs, 'harvesting');
      const newRows = await processFeedDurable(supabase, userId!, feed as any);
      allNewIds.push(...newRows.map((r) => r.id));

      result.feeds_fetched += 1;
      result.articles_harvested += newRows.length;

      // Emit per-feed and per-article events for the UI transcript.
      await emit(ctx, 'feed_fetched', {
        feed_id: feed.id,
        feed_name: feed.name,
        reason: `${newRows.length} new article${newRows.length === 1 ? '' : 's'} harvested`,
        payload: { articles_found: newRows.length, feed_host: hostForEvent(feed.url) },
      });
      for (const row of newRows) {
        await emit(ctx, 'article_seen', {
          feed_id: feed.id,
          feed_name: feed.name,
          article_id: row.id,
          article_title: row.title,
          article_url: row.url ?? null,
          payload: row.published_at ? { published_at: row.published_at } : null,
        });
      }

      // Update feed metadata — success
      await supabase
        .from('threat_intel_feeds')
        .update({ last_fetched_at: new Date().toISOString(), last_error: null })
        .eq('id', feed.id);
    } catch (err: any) {
      if (err instanceof PhaseBudgetExceeded) throw err;
      const msg = `${feed.name}: ${err.message || 'Unknown error'}`;
      console.error(`[harvester] ${msg}`);
      result.errors.push(msg);

      await emit(ctx, 'feed_failed', {
        feed_id: feed.id,
        feed_name: feed.name,
        reason: err.message || 'Unknown error',
        payload: { feed_host: hostForEvent(feed.url) },
      });

      // Update feed metadata — error
      await supabase
        .from('threat_intel_feeds')
        .update({ last_error: err.message || 'Unknown error', fetch_attempts: Number((feed as any).fetch_attempts || 0) + 1, consecutive_failures: Number((feed as any).consecutive_failures || 0) + 1, next_retry_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() })
        .eq('id', feed.id);
    }
  }

  assertPhaseBudget(deadlineMs, 'harvesting');

  // Recovery loop — pick up entries stuck in 'harvested' from previous failed
  // classification runs (e.g. the orchestrator crashed after harvest but
  // before classify finished, so these entries never got their digest_status
  // advanced). Without this, an article harvested on a crashed run would be
  // permanently abandoned because its (feed_id, external_id) would dedupe in
  // future harvests. Cap at 72h so we don't keep retrying ancient garbage.
  //
  // We also fetch enough metadata to emit one `article_seen` event per
  // recovered entry, with payload.recovered = true. That's how the transcript
  // tells the user "3 new this run + 1 recovered from a previous run = 4
  // articles entering classify" — without this, the math looked broken.
  const newIdSet = new Set(allNewIds);
  const { data: stuckEntries } = await supabase
    .from('threat_intel_feed_entries')
    .select('id, title, url, feed_id, threat_intel_feeds(name)')
    .eq('user_id', userId)
    .eq('digest_status', 'harvested')
    .gte('fetched_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString())
    .limit(50);

  assertPhaseBudget(deadlineMs, 'harvesting');

  const recoveredEntries = (stuckEntries || []).filter((e: any) => !newIdSet.has(e.id));
  const recoveredIds = recoveredEntries.map((e: any) => e.id);

  for (const re of recoveredEntries) {
    const feedRel = (re as any).threat_intel_feeds || {};
    await emit(ctx, 'article_seen', {
      feed_id: re.feed_id ?? null,
      feed_name: feedRel.name ?? null,
      article_id: re.id,
      article_title: re.title ?? '(untitled)',
      article_url: re.url ?? null,
      reason: 'Recovered from a previous run that did not finish classification',
      payload: { recovered: true },
    });
  }

  result.articles_recovered = recoveredIds.length;

  return [...allNewIds, ...recoveredIds];
}

// ---------------------------------------------------------------------------
// Per-feed processing
// ---------------------------------------------------------------------------

const MAX_FEED_SIZE = 5 * 1024 * 1024; // 5 MB

interface UpsertedEntry { id: string; title: string; url: string | null; published_at: string | null }
async function fetchFeedWithSafeRedirects(url: string, redirectCount = 0): Promise<Response> {
  if (redirectCount >= 5) throw new Error('Too many feed redirects');
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'manual',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (isRedirectStatus(response.status)) {
    const location = response.headers.get('location');
    if (!location) throw new Error(`Redirect ${response.status} missing Location`);
    const target = new URL(location, url).toString();
    const redirectValidation = validateRedirect(url, target);
    if (!redirectValidation.valid) throw new Error(`Redirect blocked: ${redirectValidation.error}`);
    return fetchFeedWithSafeRedirects(redirectValidation.sanitizedUrl!, redirectCount + 1);
  }
  return response;
}

async function processFeedDurable(
  supabase: any,
  userId: string,
  feed: any,
): Promise<UpsertedEntry[]> {
  const feedOptions = {
    etag: feed.etag ?? null,
    lastModified: feed.last_modified ?? null,
  };
  let items: FeedItem[];
  let metadata: { notModified: boolean; etag: string | null; lastModified: string | null; httpStatus: number };

  if (feed.feed_type === 'taxii') {
    const config = feed.taxii_config || {};
    let credentials: Record<string, string> = {};
    if (feed.taxii_credential_id) {
      const { data: credential, error: credentialError } = await supabase
        .from('integration_credentials')
        .select('encrypted_data')
        .eq('id', feed.taxii_credential_id)
        .single();
      if (credentialError || !credential) throw new Error('TAXII credentials are unavailable');
      credentials = await decryptCredentials(credential.encrypted_data);
    }
    const result = await fetchTaxii({
      apiRoot: feed.taxii_api_root || config.api_root || feed.url,
      collectionId: feed.taxii_collection_id || config.collection_id || '',
      username: credentials.username,
      password: credentials.password,
      bearerToken: credentials.token,
      ...feedOptions,
    });
    items = result.items;
    metadata = result.metadata;
  } else {
    const result = await fetchRssOrAtom(feed.url, feedOptions);
    items = result.items;
    metadata = result.metadata;
  }

  const maxItems = Math.max(1, Math.min(200, Number(feed.max_items_per_fetch || 200)));
  const cutoff = Date.now() - MAX_AGE_MS;
  const recent = items.filter(item => {
    if (!item.publishedAt) return true;
    const timestamp = Date.parse(item.publishedAt);
    return !Number.isFinite(timestamp) || timestamp >= cutoff;
  }).slice(0, maxItems);
  const createdRows: UpsertedEntry[] = [];

  for (const item of recent) {
    const publishedTimestamp = item.publishedAt && Number.isFinite(Date.parse(item.publishedAt))
      ? new Date(item.publishedAt).toISOString()
      : null;
    const content = (item.description || '').slice(0, 100_000) || null;
    const canonicalUrl = canonicalizeUrl(item.url);
    const contentHash = await sha256Hex(
      [canonicalUrl || item.externalId, item.title, content || ''].join('\n'),
    );
    const { data: ingested, error: ingestError } = await supabase.rpc('ingest_threat_intel_feed_entry', {
      p_user_id: userId,
      p_feed_id: feed.id,
      p_external_id: item.externalId.slice(0, 1000),
      p_title: item.title.slice(0, 1000),
      p_content: content,
      p_url: item.url,
      p_published_at: publishedTimestamp,
      p_canonical_url: canonicalUrl,
      p_content_hash: contentHash,
    });
    if (ingestError) throw new Error(`Feed entry persistence failed: ${ingestError.message}`);
    const row = Array.isArray(ingested) ? ingested[0] : ingested;
    if (row?.created && row.entry_id) {
      createdRows.push({
        id: row.entry_id,
        title: item.title,
        url: item.url,
        published_at: publishedTimestamp,
      });
    }
  }

  const now = new Date().toISOString();
  await supabase.from('threat_intel_feeds').update({
    last_fetched_at: now,
    last_error: null,
    etag: metadata.etag,
    last_modified: metadata.lastModified,
    fetch_attempts: Number(feed.fetch_attempts || 0) + 1,
    consecutive_failures: 0,
    last_http_status: metadata.httpStatus,
    last_discovered_count: items.length,
    last_duplicate_count: Math.max(0, recent.length - createdRows.length),
    last_accepted_count: createdRows.length,
    next_retry_at: null,
  }).eq('id', feed.id);

  return createdRows;
}


async function processFeedLegacy(
  supabase: any,
  userId: string,
  feed: FeedRow,
): Promise<UpsertedEntry[]> {
  const feedValidation = validateUrl(feed.url);
  if (!feedValidation.valid) throw new Error(`URL validation failed: ${feedValidation.error}`);
  const safeFeedUrl = feedValidation.sanitizedUrl!;
  // Validate feed URL (SSRF protection)
  try {
    const parsed = new URL(feed.url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Only http/https allowed');
    }
    const hostname = parsed.hostname.toLowerCase();
    const blocked = ['localhost', '127.0.0.1', '169.254.169.254', '[::1]'];
    if (blocked.includes(hostname)) throw new Error('Internal/private URL blocked');
    if (hostname.startsWith('10.') || hostname.startsWith('172.16.') || hostname.startsWith('192.168.')) {
      throw new Error('Internal/private URL blocked');
    }
  } catch (err: any) {
    throw new Error(`URL validation failed: ${err.message}`);
  }

  // Fetch XML
  const response = await fetchFeedWithSafeRedirects(safeFeedUrl);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  // Check response size before reading body
  const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_FEED_SIZE) {
    throw new Error(`Response too large (${contentLength} bytes)`);
  }

  const xml = await response.text();
  if (xml.length > MAX_FEED_SIZE) {
    throw new Error(`Content too large (${xml.length} chars)`);
  }
  const items = parseRSS(xml);

  // Filter entries older than 72 hours
  const cutoff = Date.now() - MAX_AGE_MS;
  const recent = items.filter((item) => {
    if (!item.pubDate) return true; // keep entries without a date
    const ts = new Date(item.pubDate).getTime();
    return !isNaN(ts) && ts >= cutoff;
  });

  if (recent.length === 0) return [];

  // Build rows for upsert
  const rows = recent
    .map((item) => {
      const externalId = item.guid || item.link;
      if (!externalId) return null;
      return {
        feed_id: feed.id,
        user_id: userId,
        external_id: externalId,
        title: item.title || 'Untitled',
        content: item.description || null,
        url: item.link || null,
        published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        digest_status: 'harvested',
      };
    })
    .filter(Boolean);

  if (rows.length === 0) return [];

  // Upsert — ignore duplicates on (feed_id, external_id)
  const { data: upserted, error: upsertError } = await supabase
    .from('threat_intel_feed_entries')
    .upsert(rows, { onConflict: 'feed_id,external_id', ignoreDuplicates: true })
    .select('id, title, url, published_at');

  if (upsertError) {
    throw new Error(`Upsert failed: ${upsertError.message}`);
  }

  return (upserted || []) as UpsertedEntry[];
}

// ---------------------------------------------------------------------------
// RSS / Atom Parser
// ---------------------------------------------------------------------------

interface RSSItem {
  title: string;
  link: string;
  guid: string;
  description: string;
  pubDate: string;
}

function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = [];

  // Try RSS 2.0 format first (<item> elements)
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    items.push({
      title: extractTag(match[1], 'title'),
      link: extractTag(match[1], 'link'),
      guid: extractTag(match[1], 'guid') || extractTag(match[1], 'link'),
      description: extractTag(match[1], 'description'),
      pubDate: extractTag(match[1], 'pubDate'),
    });
  }

  // Atom fallback (<entry> elements)
  if (items.length === 0) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) !== null) {
      const linkMatch = /<link[^>]*href=["']([^"']+)["']/i.exec(match[1]);
      items.push({
        title: extractTag(match[1], 'title'),
        link: linkMatch?.[1] || '',
        guid: extractTag(match[1], 'id') || linkMatch?.[1] || '',
        description: extractTag(match[1], 'summary') || extractTag(match[1], 'content'),
        pubDate: extractTag(match[1], 'published') || extractTag(match[1], 'updated'),
      });
    }
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  // CDATA content
  const cdataRegex = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`,
    'i',
  );
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  // Plain text content
  const plainRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const plainMatch = plainRegex.exec(xml);
  return (plainMatch?.[1] || '').trim();
}
