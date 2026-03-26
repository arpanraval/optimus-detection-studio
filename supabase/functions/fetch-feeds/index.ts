/**
 * Fetch Feeds - Edge Function
 *
 * Fetches RSS/Atom and TAXII 2.1 threat intelligence feeds.
 * Parses entries and upserts them into threat_intel_feed_entries.
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders, handleCorsPreflight, corsJsonResponse, corsErrorResponse } from '../_shared/cors.ts'

serve(async (req: Request) => {
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

        if (feed.feed_type === 'rss') {
          // Fetch and parse RSS/Atom
          const response = await fetch(feed.url, {
            headers: { 'User-Agent': 'Optimus-Detection-Studio/1.0' },
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const xml = await response.text();
          const items = parseRSS(xml);

          for (const item of items) {
            const externalId = item.guid || item.link;
            if (!externalId) continue;

            const { error: insertError } = await supabase
              .from('threat_intel_feed_entries')
              .upsert({
                feed_id: feed.id,
                user_id: user.id,
                external_id: externalId,
                title: item.title || 'Untitled',
                content: item.description,
                url: item.link,
                published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
                staleness_score: calculateStaleness(item.pubDate),
              }, { onConflict: 'feed_id,external_id', ignoreDuplicates: true });

            if (!insertError) newEntries++;
          }
        } else if (feed.feed_type === 'taxii') {
          // Basic TAXII 2.1 support
          const config = feed.taxii_config || {};
          const apiRoot = config.api_root || feed.url;
          const collectionId = config.collection_id;

          if (collectionId) {
            const taxiiUrl = `${apiRoot.replace(/\/$/, '')}/collections/${collectionId}/objects/`;
            const headers: Record<string, string> = {
              'Accept': 'application/taxii+json;version=2.1',
            };
            if (config.username && config.password) {
              headers['Authorization'] = 'Basic ' + btoa(`${config.username}:${config.password}`);
            }

            const response = await fetch(taxiiUrl, { headers });
            if (!response.ok) {
              throw new Error(`TAXII HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();

            for (const obj of (data.objects || [])) {
              const { error: insertError } = await supabase
                .from('threat_intel_feed_entries')
                .upsert({
                  feed_id: feed.id,
                  user_id: user.id,
                  external_id: obj.id,
                  title: obj.name || obj.type || obj.id,
                  content: obj.description || JSON.stringify(obj),
                  published_at: obj.created || obj.modified || null,
                  staleness_score: calculateStaleness(obj.created || obj.modified),
                }, { onConflict: 'feed_id,external_id', ignoreDuplicates: true });

              if (!insertError) newEntries++;
            }
          }
        }

        // Update feed last_fetched_at
        await supabase.from('threat_intel_feeds').update({
          last_fetched_at: new Date().toISOString(),
          last_error: null,
        }).eq('id', feed.id);

        totalNew += newEntries;
      } catch (err: any) {
        const errMsg = err.message || 'Unknown error';
        errors.push(`${feed.name}: ${errMsg}`);
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
// RSS/ATOM PARSER
// =============================================================================

interface RSSItem {
  title: string;
  link: string;
  guid: string;
  description: string;
  pubDate: string;
}

function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = [];

  // Try RSS 2.0 format
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

  // Try Atom format if no RSS items found
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
