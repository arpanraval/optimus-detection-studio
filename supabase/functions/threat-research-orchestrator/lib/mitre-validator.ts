// supabase/functions/threat-research-orchestrator/lib/mitre-validator.ts
//
// Post-validation step for agent-emitted MITRE technique IDs. Models
// occasionally hallucinate IDs (e.g. T1003.005 doesn't exist; only
// T1003.001..008 do at time of writing) or invent sub-technique numbers.
// We validate every emitted ID against the public.mitre_techniques table
// (canonical, kept in sync via STIX ingest) and surface the unverified
// subset so the UI can render a warning. We DON'T silently drop them —
// the model's intent is preserved, just flagged.
//
// We ALSO check tactic-technique consistency: a behaviour tagged with
// tactic X but technique T1598.003 (canonical tactic = reconnaissance) is
// almost certainly mis-classified. The Research Agent's most common
// classification error is conflating resource-development / reconnaissance
// with initial-access; this catch surfaces it.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { MitreTacticName } from "./types.ts";

/** Returns the subset of `ids` that don't exist in mitre_techniques. Empty
 *  array means everything validated. Pass a unique set; duplicates are
 *  collapsed in the query but it's wasteful. */
export async function findUnverifiedMitreIds(
  supabase: SupabaseClient,
  ids: readonly string[],
): Promise<string[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return [];

  const { data, error } = await supabase
    .from('mitre_techniques')
    .select('mitre_id')
    .in('mitre_id', unique);
  if (error) {
    console.warn('[mitre-validator] lookup failed:', error.message);
    return []; // fail open — don't block research because the validator misfired
  }

  const known = new Set((data ?? []).map((r: { mitre_id: string }) => r.mitre_id));
  return unique.filter(id => !known.has(id));
}

/** Bulk fetch canonical tactics for a set of technique IDs. Returns a Map
 *  keyed by mitre_id with the technique's canonical tactics array. Missing
 *  IDs (hallucinated or deprecated) are absent from the map. */
export async function fetchTechniqueTactics(
  supabase: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, string[]>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const out = new Map<string, string[]>();
  if (unique.length === 0) return out;

  const { data, error } = await supabase
    .from('mitre_techniques')
    .select('mitre_id, tactics')
    .in('mitre_id', unique);
  if (error) {
    console.warn('[mitre-validator] tactics lookup failed:', error.message);
    return out;
  }
  for (const r of (data ?? []) as Array<{ mitre_id: string; tactics: string[] | null }>) {
    out.set(r.mitre_id, Array.isArray(r.tactics) ? r.tactics : []);
  }
  return out;
}

/** Of `techniqueIds`, return those whose canonical tactics do NOT include
 *  `behaviourTactic`. Hallucinated IDs (not in mitre_techniques) are
 *  excluded — those are surfaced separately via findUnverifiedMitreIds. */
export function filterTacticInconsistent(
  techniqueIds: readonly string[],
  behaviourTactic: MitreTacticName,
  tacticsByTechnique: Map<string, string[]>,
): string[] {
  const out: string[] = [];
  for (const id of techniqueIds) {
    const canonicalTactics = tacticsByTechnique.get(id);
    if (!canonicalTactics) continue;            // unverified, skip
    if (canonicalTactics.length === 0) continue; // no canonical data, can't judge
    if (!canonicalTactics.includes(behaviourTactic)) out.push(id);
  }
  return out;
}
