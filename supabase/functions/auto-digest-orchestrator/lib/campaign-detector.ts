/**
 * Auto-Digest Orchestrator — Campaign Merge Utility
 *
 * This file used to contain detectAndMergeCampaign, which clustered articles
 * by overlapping threat-actor names extracted from summary.attribution.
 * That design was abandoned for two reasons:
 *   1. The digest's summary schema has no `attribution` field, so the read
 *      always returned [] — no campaign ever formed. (Confirmed in
 *      production: 39 auto reports, 0 campaigns.)
 *   2. Even if the field had existed, "same threat actor" was the wrong
 *      axis. Real-world campaigns here mean "multiple vendors writing
 *      about the same story" — a CVE wave, a named campaign, an incident —
 *      not "same threat actor across reports". The new subject-linker.ts
 *      asks the classifier model that exact equivalence question.
 *
 * What's kept: updateCampaignMerge. The aggregation logic — deduping TTPs/
 * IoCs/rules across linked reports and rolling up coverage / feasibility
 * counters — is independent of how reports got linked. The subject-linker
 * still calls this after a link/create.
 */

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
  const coveragePercent = totalTTPs > 0 ? Math.round((coveredTTPs / totalTTPs) * 100) : 0;

  // Feasibility is deduplicated by canonical technique id after report merges.
  const feasibleSum = mergedTTPs.filter((ttp: any) => ttp.feasibility === 'feasible').length;
  const infeasibleSum = mergedTTPs.filter((ttp: any) => ttp.feasibility === 'infeasible').length;
  const unknownSum = mergedTTPs.filter((ttp: any) => !['feasible', 'infeasible'].includes(ttp.feasibility)).length;

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

function confidenceRank(c: string | undefined): number {
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
