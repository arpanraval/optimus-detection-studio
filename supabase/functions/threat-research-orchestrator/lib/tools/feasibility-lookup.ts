// supabase/functions/threat-research-orchestrator/lib/tools/feasibility-lookup.ts
//
// For a given MITRE technique, return whether the user's environment can
// generate the data this technique requires. Reads from the existing
// `mitre_technique_data_sources` table (FK to `mitre_objects.stix_id`) and
// `environment_profiles.{log_sources,edr_tools,custom_log_sources}`.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export const feasibilityLookupToolDeclaration = {
  functionDeclarations: [{
    name: 'feasibility_lookup',
    description: `For a given MITRE technique, return whether the user's environment can actually generate the data this technique requires.
Returns 'covered' (all needed data sources present), 'partial' (some present), or 'uncovered' (none).
Use this BEFORE writing a detection: if the data sources aren't present, the query will be unimplementable.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        technique_id: { type: 'STRING', description: 'MITRE technique ID, e.g. "T1003.001"' },
      },
      required: ['technique_id'],
    },
  }],
};

export type FeasibilityVerdict = 'covered' | 'partial' | 'uncovered';

export interface FeasibilityResult {
  technique_id: string;
  verdict: FeasibilityVerdict;
  required_data_sources: string[];
  user_present: string[];
  user_missing: string[];
  notes: string;
}

export async function handleFeasibilityLookup(
  supabase: SupabaseClient,
  userId: string,
  params: { technique_id: string },
): Promise<FeasibilityResult> {
  const techniqueId = params.technique_id.trim();
  if (!techniqueId) {
    return {
      technique_id: techniqueId,
      verdict: 'uncovered',
      required_data_sources: [],
      user_present: [],
      user_missing: [],
      notes: 'Empty technique_id.',
    };
  }

  // 1. Resolve technique mitre_id → stix_id (the data-sources table keys on stix_id).
  const { data: techRow } = await supabase
    .from('mitre_objects')
    .select('stix_id')
    .eq('mitre_id', techniqueId)
    .eq('type', 'attack-pattern')
    .maybeSingle();
  if (!techRow?.stix_id) {
    return {
      technique_id: techniqueId,
      verdict: 'uncovered',
      required_data_sources: [],
      user_present: [],
      user_missing: [],
      notes: `Technique ${techniqueId} not found in the MITRE corpus.`,
    };
  }

  // 2. Look up required data sources for this technique.
  const { data: dataSources } = await supabase
    .from('mitre_technique_data_sources')
    .select('data_source')
    .eq('technique_stix_id', techRow.stix_id);
  const requiredList: string[] = (dataSources ?? []).map((r: any) => r.data_source);

  // 3. User's available data sources.
  const { data: profile } = await supabase
    .from('environment_profiles')
    .select('log_sources, edr_tools, custom_log_sources')
    .eq('user_id', userId)
    .maybeSingle();
  const userSources = new Set<string>([
    ...((profile?.log_sources as string[] | null) ?? []),
    ...((profile?.edr_tools as string[] | null) ?? []),
    ...((profile?.custom_log_sources as string[] | null) ?? []),
  ]);

  // 4. Compare.
  const present = requiredList.filter(s => userSources.has(s));
  const missing = requiredList.filter(s => !userSources.has(s));
  const verdict: FeasibilityVerdict =
    requiredList.length === 0 ? 'uncovered' :
    missing.length === 0       ? 'covered' :
    present.length > 0         ? 'partial' :
                                 'uncovered';

  const notes =
    requiredList.length === 0
      ? `MITRE has no data sources mapped for ${techniqueId}; cannot judge feasibility.`
      : missing.length === 0
        ? 'All required data sources are present in the environment profile.'
        : `Missing: ${missing.join(', ')}.`;

  return {
    technique_id: techniqueId,
    verdict,
    required_data_sources: requiredList,
    user_present: present,
    user_missing: missing,
    notes,
  };
}
