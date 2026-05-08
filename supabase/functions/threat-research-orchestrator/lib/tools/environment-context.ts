// supabase/functions/threat-research-orchestrator/lib/tools/environment-context.ts
//
// Returns the user's actual SIEM/EDR/log-source environment, as captured on
// /settings/environment. Used by the Detection Engineer (and QA) to assess
// whether a draft detection can run in the user's specific stack — separate
// from first-principles reasoning about what artefacts a behaviour leaves.
//
// This replaces the dead `feasibility_lookup` (which compared MITRE catalog
// labels to env labels via exact set membership — labels never align, source
// table empty). The new tool just returns the env; the agent reasons.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export const environmentContextToolDeclaration = {
  functionDeclarations: [{
    name: 'environment_context',
    description: `Returns the user's actual SIEM/EDR/log-source environment as configured on /settings/environment.

Call this AFTER you have drafted a detection candidate. Use it to:
  - Verify whether the log sources/artefacts your detection requires are
    actually present in the user's environment.
  - Set the detection's \`feasibility\` and \`detectability\` fields:
      'covered'         — required telemetry is present
      'partial'         — some required telemetry present, some missing
      'needs_telemetry' — user could detect this with additional log sources
      'not_detectable'  — environment cannot support this detection

Do NOT use this to decide HOW to detect a behaviour. Reason about the
artefacts the behaviour leaves on a defender's systems first (auth logs,
process events, network traffic, registry, file IO, IDP audit, etc.) — the
environment only tells you whether the user can run the resulting query.

Returns the user's environment shape:
  { siem_platforms, edr_tools, log_sources, custom_log_sources,
    cloud_platforms, industry, crown_jewels }`,
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  }],
};

export interface EnvironmentContextResult {
  siem_platforms: string[];
  edr_tools: string[];
  log_sources: string[];
  custom_log_sources: string[];
  cloud_platforms: Record<string, unknown> | string[];
  industry: string | null;
  crown_jewels: string[];
}

const EMPTY: EnvironmentContextResult = {
  siem_platforms: [],
  edr_tools: [],
  log_sources: [],
  custom_log_sources: [],
  cloud_platforms: [],
  industry: null,
  crown_jewels: [],
};

export async function handleEnvironmentContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<EnvironmentContextResult> {
  if (!userId) return EMPTY;
  const { data, error } = await supabase
    .from('environment_profiles')
    .select('siem_platforms, edr_tools, log_sources, custom_log_sources, cloud_platforms, industry, crown_jewels')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn('[environment-context] query failed:', error.message);
    return EMPTY;
  }
  return {
    siem_platforms:      Array.isArray(data.siem_platforms)      ? data.siem_platforms      : [],
    edr_tools:           Array.isArray(data.edr_tools)           ? data.edr_tools           : [],
    log_sources:         Array.isArray(data.log_sources)         ? data.log_sources         : [],
    custom_log_sources:  Array.isArray(data.custom_log_sources)  ? data.custom_log_sources  : [],
    cloud_platforms:     data.cloud_platforms ?? [],
    industry:            data.industry ?? null,
    crown_jewels:        Array.isArray(data.crown_jewels)        ? data.crown_jewels        : [],
  };
}
