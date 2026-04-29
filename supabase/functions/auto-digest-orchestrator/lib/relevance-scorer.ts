/**
 * Auto-Digest Orchestrator — Environment-Aware Relevance Scorer
 *
 * Scores classified entries against the user's environment profile
 * (industry, platforms, SIEMs) to determine priority, then selects
 * the top N articles for digest generation.
 */

import type { ClassificationResult, EnvironmentProfileRow } from './types.ts';
import { emit, type RunContext } from './events.ts';

// ---------------------------------------------------------------------------
// Public API — Scoring
// ---------------------------------------------------------------------------

/**
 * Score a single classification against the user's environment profile.
 *
 * Scoring rules:
 *  +3  targets user's industry/sector
 *  +2  targets user's platforms
 *  +1  generic (no specific industry/platform mentioned)
 *  +1  mentions user's SIEM vendor in keywords
 *  -1  targets different industry exclusively
 *  -2  targets platforms user doesn't have
 *
 * No env profile → score 3, tag 'no_environment_profile'
 */
export function scoreRelevance(
  classification: ClassificationResult,
  envProfile: EnvironmentProfileRow | null,
): { score: number; tags: string[] } {
  if (!envProfile) {
    return { score: 3, tags: ['no_environment_profile'] };
  }

  let score = 0;
  const tags: string[] = [];

  // Build lowercase lists for fuzzy matching
  const userIndustries = [
    envProfile.industry,
    ...(envProfile.sectors || []),
  ]
    .filter(Boolean)
    .map((s) => (s as string).toLowerCase());

  const userPlatforms = [
    ...envProfile.siem_platforms,
    ...envProfile.edr_tools,
    ...Object.keys(envProfile.cloud_platforms || {}),
  ].map((s) => s.toLowerCase());

  const articleIndustries = (classification.targeted_industries || []).map((s) =>
    s.toLowerCase(),
  );
  const articlePlatforms = (classification.targeted_platforms || []).map((s) =>
    s.toLowerCase(),
  );
  const articleKeywords = (classification.campaign_keywords || []).map((s) =>
    s.toLowerCase(),
  );

  // --- Industry scoring ---
  if (articleIndustries.length === 0) {
    // Generic article — no specific industry
    score += 1;
    tags.push('generic_industry');
  } else {
    const industryMatch = articleIndustries.some((ai) =>
      userIndustries.some((ui) => ai.includes(ui) || ui.includes(ai)),
    );
    if (industryMatch) {
      score += 3;
      tags.push('industry_match');
    } else {
      score -= 1;
      tags.push('industry_mismatch');
    }
  }

  // --- Platform scoring ---
  if (articlePlatforms.length === 0) {
    // Generic article — no specific platform
    score += 1;
    tags.push('generic_platform');
  } else {
    const platformMatch = articlePlatforms.some((ap) =>
      userPlatforms.some((up) => ap.includes(up) || up.includes(ap)),
    );
    if (platformMatch) {
      score += 2;
      tags.push('platform_match');
    } else {
      score -= 2;
      tags.push('platform_mismatch');
    }
  }

  // --- SIEM keyword bonus ---
  const siemPlatforms = envProfile.siem_platforms.map((s) => s.toLowerCase());
  const siemMention = articleKeywords.some((kw) =>
    siemPlatforms.some((sp) => kw.includes(sp) || sp.includes(kw)),
  );
  if (siemMention) {
    score += 1;
    tags.push('siem_keyword_match');
  }

  return { score, tags };
}

// ---------------------------------------------------------------------------
// Public API — Ranking & Selection
// ---------------------------------------------------------------------------

/**
 * Rank classified entries by relevance and freshness, then select the top N
 * for digest generation.
 *
 * 1. Fetches classified entries from Supabase
 * 2. Scores each against the environment profile
 * 3. Sorts by score (desc), then published_at freshness (desc)
 * 4. Selects top `maxArticles`
 * 5. Updates selected entries: relevance_score + digest_status = 'queued'
 *
 * Entries not selected remain 'classified' for the next run.
 *
 * @returns Array of selected entry IDs.
 */
export async function rankAndSelect(
  ctx: RunContext,
  classifiedIds: string[],
  maxArticles: number,
  envProfile: EnvironmentProfileRow | null,
): Promise<string[]> {
  const { supabase } = ctx;
  if (classifiedIds.length === 0) return [];

  // 1. Fetch classified entries (with title/url so we can emit informative drop events)
  const { data: entries, error: fetchError } = await supabase
    .from('threat_intel_feed_entries')
    .select('id, title, url, feed_id, threat_intel_feeds(name), classification, published_at')
    .in('id', classifiedIds)
    .eq('digest_status', 'classified');

  if (fetchError) {
    console.error(`[relevance-scorer] Fetch failed: ${fetchError.message}`);
    return [];
  }

  if (!entries || entries.length === 0) return [];

  // 2. Score each entry
  const scored = entries.map((entry: any) => {
    const classification = entry.classification as ClassificationResult;
    const { score, tags } = scoreRelevance(classification, envProfile);
    const feedRel = entry.threat_intel_feeds as any;
    return {
      id: entry.id as string,
      title: entry.title as string,
      url: (entry.url as string | null) ?? null,
      feed_id: (entry.feed_id as string | null) ?? null,
      feed_name: (feedRel?.name as string | null) ?? null,
      score,
      tags,
      published_at: entry.published_at as string | null,
    };
  });

  // 3. Sort: score desc, then freshness desc
  scored.sort((a: any, b: any) => {
    if (b.score !== a.score) return b.score - a.score;
    // Freshness: more recent first; null dates sort last
    const aTime = a.published_at ? new Date(a.published_at).getTime() : 0;
    const bTime = b.published_at ? new Date(b.published_at).getTime() : 0;
    return bTime - aTime;
  });

  // 4. Take top N
  const selected = scored.slice(0, maxArticles);
  const overflow = scored.slice(maxArticles);
  const selectedIds = selected.map((s: any) => s.id);

  // 5. Update selected entries
  for (const item of selected) {
    await supabase
      .from('threat_intel_feed_entries')
      .update({
        relevance_score: item.score,
        digest_status: 'queued',
      })
      .eq('id', item.id);
  }

  // 6. Emit transparency events: which articles got dropped because they
  //    didn't make the top-N cut for the user's daily limit. They stay in
  //    digest_status='classified' so a future run can pick them up.
  for (const item of overflow) {
    await emit(ctx, 'article_skipped_daily_limit', {
      feed_id: item.feed_id,
      feed_name: item.feed_name,
      article_id: item.id,
      article_title: item.title,
      article_url: item.url,
      reason: `Beyond daily cap of ${maxArticles}; ranked ${overflow.indexOf(item) + maxArticles + 1} (score ${item.score})`,
      payload: { score: item.score, tags: item.tags, daily_max: maxArticles },
    });
  }

  return selectedIds;
}
