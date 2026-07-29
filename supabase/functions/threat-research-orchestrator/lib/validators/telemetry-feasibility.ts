// supabase/functions/threat-research-orchestrator/lib/validators/telemetry-feasibility.ts
//
// Deterministic check: does the opportunity's required telemetry actually
// exist in the user's configured environment? mitre_technique_data_sources
// is empty in practice (see the consolidated remediation plan §3.2), so
// this compares the opportunity's own telemetry[] text directly against
// environment_profiles' log_sources / custom_log_sources / edr_tools — no
// join table needed.
//
// Fail-open: no profile configured at all → null (not a finding). This
// validator is advisory; it never blocks a detection from shipping.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { handleEnvironmentContext } from "../tools/environment-context.ts";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Loose containment: true when the requirement and an env entry share
 *  enough text to plausibly refer to the same thing. Word-level, not exact
 *  string equality — env labels ("Sysmon") and telemetry descriptions
 *  ("Sysmon Event ID 1 process creation") come from different agents and
 *  will never match verbatim. */
function isPresentInEnv(requirement: string, envEntries: readonly string[]): boolean {
  const reqNorm = normalize(requirement);
  const reqWords = new Set(reqNorm.split(' ').filter(w => w.length >= 3));
  if (reqWords.size === 0) return true; // nothing meaningful to check against

  for (const entry of envEntries) {
    const entryNorm = normalize(entry);
    if (!entryNorm) continue;
    if (reqNorm.includes(entryNorm) || entryNorm.includes(reqNorm)) return true;
    const entryWords = entryNorm.split(' ').filter(w => w.length >= 3);
    if (entryWords.some(w => reqWords.has(w))) return true;
  }
  return false;
}

/** Returns a finding string when some of `telemetry` isn't present in the
 *  user's configured environment, else null. */
export async function runTelemetryFeasibilityValidator(
  supabase: SupabaseClient,
  userId: string,
  telemetry: readonly string[],
): Promise<string | null> {
  if (telemetry.length === 0) return null;

  const env = await handleEnvironmentContext(supabase, userId);
  const envEntries = [...env.log_sources, ...env.custom_log_sources, ...env.edr_tools];
  if (envEntries.length === 0) return null; // no profile configured — fail open

  const missing = telemetry.filter(t => !isPresentInEnv(t, envEntries));
  if (missing.length === 0) return null;

  return `${missing.length}/${telemetry.length} required telemetry source(s) not found in the user's configured environment: ${missing.join('; ')}. Verify against /settings/environment.`;
}
