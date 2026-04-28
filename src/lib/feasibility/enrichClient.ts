import { supabase } from '../supabaseClient';

interface TTPLite {
  mitreId?: string;
  hasExistingDetection?: boolean;
}

interface EnvProfileLite {
  log_sources?: string[] | null;
  edr_tools?: string[] | null;
}

export interface FeasibilityResult {
  feasible: number;
  infeasible: number;
  computed: boolean;
  reason?: 'no_profile' | 'no_uncovered' | 'no_mitre_ids' | 'no_stix_mapping' | 'computed';
}

/**
 * Mirror of supabase/functions/auto-digest-orchestrator/lib/feasibility-enricher.ts
 * for the manual-report path. Runs entirely under user RLS.
 */
export async function enrichFeasibilityForReport(
  reportId: string,
  userId: string,
  ttps: TTPLite[],
): Promise<FeasibilityResult> {
  const { data: profileRow } = await supabase
    .from('environment_profiles')
    .select('log_sources, edr_tools')
    .eq('user_id', userId)
    .maybeSingle();

  if (!profileRow) {
    return { feasible: 0, infeasible: 0, computed: false, reason: 'no_profile' };
  }

  const profile = profileRow as EnvProfileLite;
  const uncovered = ttps.filter(t => t.hasExistingDetection !== true);
  if (uncovered.length === 0) {
    await supabase
      .from('threat_intel_reports')
      .update({ feasible_gap_count: 0, infeasible_gap_count: 0 })
      .eq('id', reportId);
    return { feasible: 0, infeasible: 0, computed: true, reason: 'no_uncovered' };
  }

  const mitreIds = uncovered.map(t => t.mitreId).filter((x): x is string => !!x);
  if (mitreIds.length === 0) {
    return { feasible: 0, infeasible: 0, computed: false, reason: 'no_mitre_ids' };
  }

  const { data: mitreObjects } = await supabase
    .from('mitre_objects')
    .select('stix_id, mitre_id')
    .eq('type', 'attack-pattern')
    .in('mitre_id', mitreIds);

  const stixByMitreId: Record<string, string> = {};
  for (const obj of mitreObjects ?? []) {
    if (obj.mitre_id && obj.stix_id) stixByMitreId[obj.mitre_id] = obj.stix_id;
  }

  const stixIds = Object.values(stixByMitreId);
  if (stixIds.length === 0) {
    await supabase
      .from('threat_intel_reports')
      .update({ feasible_gap_count: uncovered.length, infeasible_gap_count: 0 })
      .eq('id', reportId);
    return { feasible: uncovered.length, infeasible: 0, computed: true, reason: 'no_stix_mapping' };
  }

  const { data: dsRows } = await supabase
    .from('mitre_technique_data_sources')
    .select('technique_stix_id, data_source')
    .in('technique_stix_id', stixIds);

  const requiredSources: Record<string, string[]> = {};
  for (const row of dsRows ?? []) {
    if (!requiredSources[row.technique_stix_id]) requiredSources[row.technique_stix_id] = [];
    requiredSources[row.technique_stix_id].push(String(row.data_source).toLowerCase());
  }

  const available = new Set<string>();
  for (const s of profile.log_sources ?? []) available.add(s.toLowerCase());
  for (const t of profile.edr_tools ?? []) available.add(t.toLowerCase());
  const availableArr = Array.from(available);

  let feasible = 0;
  let infeasible = 0;
  for (const ttp of uncovered) {
    const stix = ttp.mitreId ? stixByMitreId[ttp.mitreId] : undefined;
    const required = stix ? requiredSources[stix] : undefined;
    if (!required || required.length === 0) {
      feasible += 1;
      continue;
    }
    const hasMatch = required.some(req =>
      availableArr.some(avail => avail.includes(req) || req.includes(avail)),
    );
    if (hasMatch) feasible += 1;
    else infeasible += 1;
  }

  await supabase
    .from('threat_intel_reports')
    .update({ feasible_gap_count: feasible, infeasible_gap_count: infeasible })
    .eq('id', reportId);

  return { feasible, infeasible, computed: true, reason: 'computed' };
}
