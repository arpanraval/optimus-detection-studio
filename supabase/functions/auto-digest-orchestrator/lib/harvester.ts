/**
 * Auto-Digest Orchestrator — RSS/Atom Feed Harvester
 *
 * Fetches enabled auto-digest feeds for a user, parses RSS 2.0 / Atom XML,
 * filters stale entries (>72 h), and upserts new entries into
 * threat_intel_feed_entries with digest_status = 'harvested'.
 */

import type { FeedRow, JobResultSummary } from './types.ts';
import { emit, type RunContext } from './events.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_AGENT = 'Optimus-Detection-Studio/2.0 AutoDigest';
const FETCH_TIMEOUT_MS = 15_000;
const MAX_AGE_MS = 72 * 60 * 60 * 1000; // 72 hours

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
): Promise<string[]> {
  const { supabase, userId } = ctx;
  // 1. Get user's auto-digest feeds
  const { data: feeds, error: feedsError } = await supabase
    .from('threat_intel_feeds')
    .select('id, user_id, name, feed_type, url, is_auto_digest, extraction_method')
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
      const newRows = await processFeed(supabase, userId!, feed);
      allNewIds.push(...newRows.map((r) => r.id));

      result.feeds_fetched += 1;
      result.articles_harvested += newRows.length;

      // Emit per-feed and per-article events for the UI transcript.
      await emit(ctx, 'feed_fetched', {
        feed_id: feed.id,
        feed_name: feed.name,
        reason: `${newRows.length} new article${newRows.length === 1 ? '' : 's'} harvested`,
        payload: { articles_found: newRows.length, feed_url: feed.url },
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
      const msg = `${feed.name}: ${err.message || 'Unknown error'}`;
      console.error(`[harvester] ${msg}`);
      result.errors.push(msg);

      await emit(ctx, 'feed_failed', {
        feed_id: feed.id,
        feed_name: feed.name,
        reason: err.message || 'Unknown error',
        payload: { feed_url: feed.url },
      });

      // Update feed metadata — error
      await supabase
        .from('threat_intel_feeds')
        .update({ last_error: err.message || 'Unknown error' })
        .eq('id', feed.id);
    }
  }

  // Also pick up entries stuck in 'harvested' from previous failed classification runs
  const { data: stuckEntries } = await supabase
    .from('threat_intel_feed_entries')
    .select('id')
    .eq('user_id', userId)
    .eq('digest_status', 'harvested')
    .gte('fetched_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString())
    .limit(50);

  const stuckIds = (stuckEntries || []).map((e: any) => e.id);
  const allEntryIds = [...new Set([...allNewIds, ...stuckIds])];

  result.articles_harvested = allEntryIds.length;
  return allEntryIds;
}

// ---------------------------------------------------------------------------
// Per-feed processing
// ---------------------------------------------------------------------------

const MAX_FEED_SIZE = 5 * 1024 * 1024; // 5 MB

interface UpsertedEntry { id: string; title: string; url: string | null; published_at: string | null }

async function processFeed(
  supabase: any,
  userId: string,
  feed: FeedRow,
): Promise<UpsertedEntry[]> {
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
  const response = await fetch(feed.url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

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
