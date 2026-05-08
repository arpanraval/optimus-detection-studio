/**
 * Auto-Digest Orchestrator — Campaign Detector
 *
 * After a report is digested, checks if 3+ auto-digested reports share the
 * same threat actor within a 48-hour window. If threshold is met, creates or
 * updates a campaign with merged intelligence (TTPs, IoCs, rules).
 */

import type { JobResultSummary } from './types.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CAMPAIGN_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours
/** Minimum number of reports referencing the same actor within
 *  CAMPAIGN_WINDOW_MS to form (or join) a campaign. Override per-deployment
 *  via AUTO_DIGEST_CAMPAIGN_THRESHOLD; clamped to [2, 10]. Default lowered
 *  from 3 → 2 because curated feeds at the default max_articles_per_day=3
 *  rarely produce 3 same-actor reports in 48h, leaving the campaign
 *  surface effectively dead in low-volume installations. 2 is the smallest
 *  count that's meaningfully a "pattern" rather than a single report. */
const CAMPAIGN_THRESHOLD: number = (() => {
  const raw = (typeof Deno !== 'undefined' ? Deno.env.get('AUTO_DIGEST_CAMPAIGN_THRESHOLD') : undefined) ?? '';
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(2, Math.min(10, parsed));
})();
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'this', 'that',
  'these', 'those', 'it', 'its', 'new', 'not', 'no', 'as', 'up',
  'out', 'if', 'about', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'under', 'over', 'report', 'analysis',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect whether a newly digested report should be grouped into a campaign.
 *
 * Logic:
 * 1. Extract threat actors from the report's summary.attribution
 * 2. Find other recent auto-digested reports (48h) with overlapping actors
 * 3. If 3+ reports match, create or update a campaign
 */
export async function detectAndMergeCampaign(
  supabase: any,
  reportId: string,
  userId: string,
  result: JobResultSummary,
): Promise<void> {
  // 1. Fetch the newly digested report
  const { data: report, error: reportErr } = await supabase
    .from('threat_intel_reports')
    .select(
      'id, name, summary, classification, ttps, iocs, rules, source_feed_name, source_article_url, created_at, campaign_id',
    )
    .eq('id', reportId)
    .single();

  if (reportErr || !report) {
    console.error(`[campaign-detector] Failed to fetch report ${reportId}:`, reportErr?.message);
    return;
  }

  // 2. Extract threat actors
  const actors = extractThreatActors(report);
  if (actors.length === 0) return; // can't match without actors

  // 3. If report already belongs to a campaign, just refresh the merge
  if (report.campaign_id) {
    await updateCampaignMerge(supabase, report.campaign_id);
    result.campaigns_updated += 1;
    return;
  }

  // 4. Find recent auto-digested reports in the 48h window (same user, source='auto')
  const cutoff = new Date(Date.now() - CAMPAIGN_WINDOW_MS).toISOString();

  const { data: recentReports, error: recentErr } = await supabase
    .from('threat_intel_reports')
    .select(
      'id, name, summary, classification, ttps, iocs, rules, source_feed_name, source_article_url, created_at, campaign_id',
    )
    .eq('user_id', userId)
    .eq('source', 'auto')
    .gte('created_at', cutoff)
    .neq('id', reportId);

  if (recentErr) {
    console.error('[campaign-detector] Recent reports query failed:', recentErr.message);
    return;
  }

  // 5. Match by overlapping threat actor names (case-insensitive)
  const actorsLower = actors.map((a) => a.toLowerCase());
  const matchingReports = (recentReports || []).filter((r: any) => {
    const rActors = extractThreatActors(r);
    return rActors.some((ra) => actorsLower.includes(ra.toLowerCase()));
  });

  // Include the current report in the count
  const totalMatching = matchingReports.length + 1;
  if (totalMatching < CAMPAIGN_THRESHOLD) return;

  // 6. Check if any matching report already has a campaign_id
  const existingCampaignReport = matchingReports.find((r: any) => r.campaign_id);

  if (existingCampaignReport) {
    // Add current report to the existing campaign
    const campaignId = existingCampaignReport.campaign_id;

    await supabase
      .from('threat_intel_reports')
      .update({ campaign_id: campaignId })
      .eq('id', reportId);

    await supabase.from('auto_digest_campaign_articles').upsert(
      {
        campaign_id: campaignId,
        report_id: reportId,
        source_feed_name: report.source_feed_name || null,
        article_url: report.source_article_url || null,
        ttp_count: Array.isArray(report.ttps) ? report.ttps.length : 0,
        ioc_count: Array.isArray(report.iocs) ? report.iocs.length : 0,
        rule_count: Array.isArray(report.rules) ? report.rules.length : 0,
      },
      { onConflict: 'campaign_id,report_id' },
    );

    await updateCampaignMerge(supabase, campaignId);
    result.campaigns_updated += 1;
    return;
  }

  // 7. Create a new campaign
  // Sanitize actor name from AI/untrusted content
  const safePrimaryActor = (actors[0] || 'Unknown')
    .replace(/[^\w\s\-\.]/g, '')
    .slice(0, 100);
  const monthYear = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const campaignName = `${safePrimaryActor} Campaign (${monthYear})`;

  const allActors = new Set<string>(actorsLower);
  for (const r of matchingReports) {
    for (const a of extractThreatActors(r)) {
      allActors.add(a.toLowerCase());
    }
  }

  const keywords = extractKeywords(report);
  const severity = report.classification?.severity || report.summary?.severity || 'medium';
  const attackType = report.classification?.attack_type || report.summary?.attack_type || null;

  const { data: campaign, error: campaignErr } = await supabase
    .from('auto_digest_campaigns')
    .insert({
      user_id: userId,
      name: campaignName,
      threat_actors: Array.from(allActors),
      campaign_keywords: keywords,
      attack_type: attackType,
      severity,
    })
    .select('id')
    .single();

  if (campaignErr || !campaign) {
    console.error('[campaign-detector] Failed to create campaign:', campaignErr?.message);
    return;
  }

  const campaignId = campaign.id;

  // 8. Link all matching reports + current report to the campaign
  const allReports = [...matchingReports, report];
  const articleRows = allReports.map((r: any) => ({
    campaign_id: campaignId,
    report_id: r.id,
    source_feed_name: r.source_feed_name || null,
    article_url: r.source_article_url || null,
    ttp_count: Array.isArray(r.ttps) ? r.ttps.length : 0,
    ioc_count: Array.isArray(r.iocs) ? r.iocs.length : 0,
    rule_count: Array.isArray(r.rules) ? r.rules.length : 0,
  }));

  await supabase
    .from('auto_digest_campaign_articles')
    .upsert(articleRows, { onConflict: 'campaign_id,report_id' });

  // Update campaign_id on all linked reports
  const reportIds = allReports.map((r: any) => r.id);
  await supabase
    .from('threat_intel_reports')
    .update({ campaign_id: campaignId })
    .in('id', reportIds);

  // 9. Compute merged intelligence
  await updateCampaignMerge(supabase, campaignId);
  result.campaigns_created += 1;
}

// ---------------------------------------------------------------------------
// Campaign Merge — aggregate TTPs, IoCs, and rules across all linked reports
// ---------------------------------------------------------------------------

/**
 * Re-compute merged intelligence for a campaign from all its linked reports.
 */
export async function updateCampaignMerge(
  supabase: any,
  campaignId: string,
): Promise<void> {
  // Fetch all article links for this campaign
  const { data: articles, error: artErr } = await supabase
    .from('auto_digest_campaign_articles')
    .select('report_id, source_feed_name')
    .eq('campaign_id', campaignId);

  if (artErr || !articles || articles.length === 0) return;

  const reportIds = articles.map((a: any) => a.report_id);

  // Build source lookup: report_id → source_name
  const sourceByReport: Record<string, string> = {};
  for (const a of articles) {
    if (a.source_feed_name) sourceByReport[a.report_id] = a.source_feed_name;
  }

  // Fetch all linked reports
  const { data: reports, error: rptErr } = await supabase
    .from('threat_intel_reports')
    .select('id, ttps, iocs, rules')
    .in('id', reportIds);

  if (rptErr || !reports) return;

  // --- Merge TTPs ---
  const ttpMap = new Map<string, any>();
  for (const rpt of reports) {
    const ttps = Array.isArray(rpt.ttps) ? rpt.ttps : [];
    for (const ttp of ttps) {
      const key = ttp.mitreId || ttp.technique_id || ttp.id;
      if (!key) continue;

      const existing = ttpMap.get(key);
      if (existing) {
        // Keep highest confidence
        if (confidenceRank(ttp.confidence) > confidenceRank(existing.confidence)) {
          existing.confidence = ttp.confidence;
        }
        // Track sources
        const source = sourceByReport[rpt.id] || rpt.id;
        if (!existing.sources.includes(source)) {
          existing.sources.push(source);
        }
      } else {
        ttpMap.set(key, {
          ...ttp,
          sources: [sourceByReport[rpt.id] || rpt.id],
        });
      }
    }
  }
  const mergedTTPs = Array.from(ttpMap.values());

  // --- Merge IoCs ---
  const iocMap = new Map<string, any>();
  for (const rpt of reports) {
    const iocs = Array.isArray(rpt.iocs) ? rpt.iocs : [];
    for (const ioc of iocs) {
      const key = `${(ioc.type || '').toLowerCase()}:${(ioc.value || '').toLowerCase()}`;
      const existing = iocMap.get(key);
      if (existing) {
        const source = sourceByReport[rpt.id] || rpt.id;
        if (!existing.sources.includes(source)) {
          existing.sources.push(source);
        }
      } else {
        iocMap.set(key, {
          ...ioc,
          sources: [sourceByReport[rpt.id] || rpt.id],
        });
      }
    }
  }
  const mergedIoCs = Array.from(iocMap.values());

  // --- Merge Rules ---
  const ruleMap = new Map<string, any>();
  for (const rpt of reports) {
    const rules = Array.isArray(rpt.rules) ? rpt.rules : [];
    for (const rule of rules) {
      // Dedup by first 200 chars of content
      const content = rule.content || rule.query || '';
      const key = content.substring(0, 200);
      if (key && !ruleMap.has(key)) {
        ruleMap.set(key, {
          ...rule,
          source: sourceByReport[rpt.id] || rpt.id,
        });
      }
    }
  }
  const mergedRules = Array.from(ruleMap.values());

  // --- Coverage ---
  const totalTTPs = mergedTTPs.length;
  const coveredTTPs = mergedTTPs.filter(
    (t) => t.hasExistingDetection === true || t.covered === true,
  ).length;
  const uncoveredTTPs = totalTTPs - coveredTTPs;
  const coveragePercent = totalTTPs > 0 ? Math.round((coveredTTPs / totalTTPs) * 100) : 0;

  // --- Update campaign ---
  // Aggregate the per-report feasible/infeasible/unknown counts. The
  // previous version hardcoded uncovered_ttps into feasible_gap_count and
  // 0 into infeasible — meaning every campaign showed "100% feasible"
  // regardless of underlying data. We now read the real per-report
  // numbers and sum them, which mirrors the per-report UI.
  const { data: feasRows } = await supabase
    .from('threat_intel_reports')
    .select('feasible_gap_count, infeasible_gap_count, unknown_gap_count')
    .in('id', reportIds);
  let feasibleSum = 0;
  let infeasibleSum = 0;
  let unknownSum = 0;
  for (const r of (feasRows || []) as Array<{
    feasible_gap_count?: number | null;
    infeasible_gap_count?: number | null;
    unknown_gap_count?: number | null;
  }>) {
    feasibleSum   += r.feasible_gap_count   ?? 0;
    infeasibleSum += r.infeasible_gap_count ?? 0;
    unknownSum    += r.unknown_gap_count    ?? 0;
  }

  await supabase
    .from('auto_digest_campaigns')
    .update({
      merged_ttps: mergedTTPs,
      merged_iocs: mergedIoCs,
      merged_rules: mergedRules,
      coverage_percent: coveragePercent,
      total_ttp_count: totalTTPs,
      covered_ttp_count: coveredTTPs,
      feasible_gap_count: feasibleSum,
      infeasible_gap_count: infeasibleSum,
      unknown_gap_count: unknownSum,
      article_count: articles.length,
      last_updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract threat actor names from a report's summary.attribution field.
 */
export function extractThreatActors(report: any): string[] {
  const summary = report.summary;
  if (!summary) return [];

  // summary.attribution can be a string or array
  const attr = summary.attribution;
  if (!attr) return [];

  if (Array.isArray(attr)) {
    return attr.filter((a: any) => typeof a === 'string' && a.length > 0);
  }

  if (typeof attr === 'string' && attr.length > 0) {
    return [attr];
  }

  return [];
}

/**
 * Extract significant keywords from the report title (skip stop words).
 */
export function extractKeywords(report: any): string[] {
  const title = report.name || report.report_title || '';
  if (!title) return [];

  const words = title
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((w: string) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));

  return words.slice(0, 5);
}

/**
 * Rank confidence levels for comparison.
 */
export function confidenceRank(c: string | undefined): number {
  switch ((c || '').toLowerCase()) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}
