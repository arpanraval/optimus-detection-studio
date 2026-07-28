/**
 * Fetch Feeds - Edge Function
 *
 * Fetches RSS/Atom and TAXII 2.1 threat intelligence feeds.
 * Parses entries and upserts them into threat_intel_feed_entries.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, handleCorsPreflight, corsJsonResponse, corsErrorResponse } from '../_shared/cors.ts'
import { canonicalizeUrl, fetchRssOrAtom, fetchTaxii, sha256Hex, type FeedItem } from '../_shared/feed-ingestion.ts'
import { decryptCredentials } from '../_shared/credential-crypto.ts'

serve(async (req: Request) => {
async function ingestFeedUnified(supabase: any, feed: any, userId: string): Promise<number> {
  let items: FeedItem[];
  let metadata: { notModified: boolean; etag: string | null; lastModified: string | null; httpStatus: number };
  if (feed.feed_type === 'taxii') {
    const config = feed.taxii_config || {};
    let credentials: Record<string, string> = {};
    if (feed.taxii_credential_id) {
      const { data: credential, error } = await supabase.from('integration_credentials')
        .select('encrypted_data').eq('id', feed.taxii_credential_id).single();
      if (error || !credential) throw new Error('TAXII credentials are unavailable');
      credentials = await decryptCredentials(credential.encrypted_data);
    }
    const result = await fetchTaxii({
      apiRoot: feed.taxii_api_root || config.api_root || feed.url,
      collectionId: feed.taxii_collection_id || config.collection_id || '',
      username: credentials.username, password: credentials.password, bearerToken: credentials.token,
      etag: feed.etag, lastModified: feed.last_modified,
    });
    items = result.items; metadata = result.metadata;
  } else {
    const result = await fetchRssOrAtom(feed.url, { etag: feed.etag, lastModified: feed.last_modified });
    items = result.items; metadata = result.metadata;
  }
  const maxItems = Math.max(1, Math.min(200, Number(feed.max_items_per_fetch || 200)));
  let created = 0;
  for (const item of items.slice(0, maxItems)) {
    const publishedAt = item.publishedAt && Number.isFinite(Date.parse(item.publishedAt))
      ? new Date(item.publishedAt).toISOString() : null;
    const content = (item.description || '').slice(0, 100_000) || null;
    const canonicalUrl = canonicalizeUrl(item.url);
    const contentHash = await sha256Hex([canonicalUrl || item.externalId, item.title, content || ''].join('\n'));
    const { data, error } = await supabase.rpc('ingest_threat_intel_feed_entry', {
      p_user_id: userId, p_feed_id: feed.id, p_external_id: item.externalId.slice(0, 1000),
      p_title: item.title.slice(0, 1000), p_content: content, p_url: item.url,
      p_published_at: publishedAt, p_canonical_url: canonicalUrl, p_content_hash: contentHash,
    });
    if (error) throw new Error(`Feed entry persistence failed: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.created) created += 1;
  }
  await supabase.from('threat_intel_feeds').update({
    last_fetched_at: new Date().toISOString(), last_error: null, etag: metadata.etag,
    last_modified: metadata.lastModified, fetch_attempts: Number(feed.fetch_attempts || 0) + 1,
    consecutive_failures: 0, last_http_status: metadata.httpStatus,
    last_discovered_count: items.length, last_duplicate_count: Math.max(0, items.length - created),
    last_accepted_count: created, next_retry_at: null,
  }).eq('id', feed.id);
  return created;
}

  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return corsErrorResponse('Missing authorization', req, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return corsErrorResponse('Invalid token', req, 401);

    const body = await req.json();
    const { feed_id, all } = body;

    // Get feeds to process
    let feedsQuery = supabase
      .from('threat_intel_feeds')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_enabled', true);
    if (feed_id) feedsQuery = feedsQuery.eq('id', feed_id);

    const { data: feeds, error: feedsError } = await feedsQuery;
    if (feedsError) return corsErrorResponse(feedsError.message, req, 500);

    let totalNew = 0;
    const errors: string[] = [];

    for (const feed of (feeds || [])) {
      try {
        let newEntries = 0;

        newEntries = await ingestFeedUnified(supabase, feed, user.id);
        totalNew += newEntries;
      } catch (err: any) {
        const errMsg = err.message || 'Unknown error';
        console.error(`Feed ${feed.name} error:`, errMsg);
        errors.push(`${feed.name}: fetch failed`);
        await supabase.from('threat_intel_feeds').update({
          last_error: errMsg,
        }).eq('id', feed.id);
      }
    }

    return corsJsonResponse({ new_entries_count: totalNew, errors }, req);
  } catch (err: any) {
    return corsErrorResponse('Internal error', req, 500);
  }
});

// =============================================================================
// RSS/Atom and TAXII parsing is provided by _shared/feed-ingestion.ts.

/* Legacy parser block retained only as commented compatibility history.
  return items;
}

function extractTag(xml: string, tag: string): string {
  // Try CDATA first
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i');
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  // Plain text content
  const plainRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const plainMatch = plainRegex.exec(xml);
  return (plainMatch?.[1] || '').trim();
}

function calculateStaleness(dateStr?: string | null): number {
  if (!dateStr) return 0.5;
  const days = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  // Linear decay over 90 days: 1.0 (today) -> 0.0 (90+ days old)
  return Math.max(0, Math.min(1, 1 - (days / 90)));
}
*/
