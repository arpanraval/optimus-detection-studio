/**
 * Auto-Digest Orchestrator — Feasibility Enricher
 *
 * After a report is digested, checks each uncovered TTP against the user's
 * environment profile to determine if they have the log sources needed
 * to build a detection for it.
 */

import type { EnvironmentProfileRow } from './types.ts';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enrich a digested report with feasibility data based on the user's
 * environment profile (log sources, EDR tools).
 *
 * For each uncovered TTP, looks up the required MITRE data sources and
 * checks if the user's environment can provide them. Updates the report
 * with feasible_gap_count and infeasible_gap_count.
 */
export async function enrichFeasibility(
  supabase: any,
  reportId: string,
  userId: string,
  envProfile: EnvironmentProfileRow | null,
): Promise<void> {
  // 1. If no environment profile, we can't assess feasibility
  if (!envProfile) return;

  // 2. Fetch report's TTPs
  const { data: report, error: rptErr } = await supabase
    .from('threat_intel_reports')
    .select('ttps')
    .eq('id', reportId)
    .single();

  if (rptErr || !report) {
    console.error(`[feasibility-enricher] Failed to fetch report ${reportId}:`, rptErr?.message);
    return;
  }

  const ttps: any[] = Array.isArray(report.ttps) ? report.ttps : [];

  // 3. Filter to uncovered TTPs only
  const uncoveredTTPs = ttps.filter(
    (t) => t.hasExistingDetection === false || t.covered === false,
  );

  if (uncoveredTTPs.length === 0) {
    await supabase
      .from('threat_intel_reports')
      .update({ feasible_gap_count: 0, infeasible_gap_count: 0 })
      .eq('id', reportId);
    return;
  }

  // 4. Extract MITRE IDs from uncovered TTPs
  const mitreIds = uncoveredTTPs
    .map((t) => t.mitreId || t.technique_id)
    .filter(Boolean) as string[];

  if (mitreIds.length === 0) {
    await supabase
      .from('threat_intel_reports')
      .update({ feasible_gap_count: 0, infeasible_gap_count: 0 })
      .eq('id', reportId);
    return;
  }

  // 5. Look up STIX IDs from mitre_objects (type='attack-pattern')
  const { data: mitreObjects, error: moErr } = await supabase
    .from('mitre_objects')
    .select('stix_id, mitre_id')
    .eq('type', 'attack-pattern')
    .in('mitre_id', mitreIds);

  if (moErr) {
    console.error('[feasibility-enricher] mitre_objects query failed:', moErr.message);
    return;
  }

  // Build mitre_id → stix_id mapping
  const stixByMitreId: Record<string, string> = {};
  for (const obj of mitreObjects || []) {
    if (obj.mitre_id && obj.stix_id) {
      stixByMitreId[obj.mitre_id] = obj.stix_id;
    }
  }

  const stixIds = Object.values(stixByMitreId);
  if (stixIds.length === 0) {
    // No STIX mappings found — assume all feasible (unknown requirements)
    await supabase
      .from('threat_intel_reports')
      .update({
        feasible_gap_count: uncoveredTTPs.length,
        infeasible_gap_count: 0,
      })
      .eq('id', reportId);
    return;
  }

  // 6. Query required data sources per technique
  const { data: dsRows, error: dsErr } = await supabase
    .from('mitre_technique_data_sources')
    .select('technique_stix_id, data_source')
    .in('technique_stix_id', stixIds);

  if (dsErr) {
    console.error('[feasibility-enricher] data sources query failed:', dsErr.message);
    return;
  }

  // Build stix_id → required data sources
  const requiredSources: Record<string, string[]> = {};
  for (const row of dsRows || []) {
    if (!requiredSources[row.technique_stix_id]) {
      requiredSources[row.technique_stix_id] = [];
    }
    requiredSources[row.technique_stix_id].push(row.data_source.toLowerCase());
  }

  // 7. Build user's available sources set (lowercase for fuzzy matching)
  const availableSources = new Set<string>();
  for (const src of envProfile.log_sources || []) {
    availableSources.add(src.toLowerCase());
  }
  for (const tool of envProfile.edr_tools || []) {
    availableSources.add(tool.toLowerCase());
  }

  const availableArray = Array.from(availableSources);

  // 8. Assess feasibility per uncovered TTP
  let feasibleCount = 0;
  let infeasibleCount = 0;

  for (const ttp of uncoveredTTPs) {
    const mitreId = ttp.mitreId || ttp.technique_id;
    if (!mitreId) {
      // Unknown technique — assume feasible
      feasibleCount += 1;
      continue;
    }

    const stixId = stixByMitreId[mitreId];
    if (!stixId) {
      // No STIX mapping — assume feasible
      feasibleCount += 1;
      continue;
    }

    const required = requiredSources[stixId];
    if (!required || required.length === 0) {
      // No known requirements — assume feasible
      feasibleCount += 1;
      continue;
    }

    // Check if user has ANY matching data source (fuzzy: includes)
    const hasMatch = required.some((req) =>
      availableArray.some((avail) => avail.includes(req) || req.includes(avail)),
    );

    if (hasMatch) {
      feasibleCount += 1;
    } else {
      infeasibleCount += 1;
    }
  }

  // 9. Update report with feasibility counts
  await supabase
    .from('threat_intel_reports')
    .update({
      feasible_gap_count: feasibleCount,
      infeasible_gap_count: infeasibleCount,
    })
    .eq('id', reportId);
}
