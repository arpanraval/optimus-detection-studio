// supabase/functions/threat-research-orchestrator/lib/actor-coverage.ts
//
// Actor-tagged coverage seed. Runs once after Research, before fan-out.
//
// Design intent:
// - Pull the actor's aliases out of the Research agent's free-text
//   intel_summary.actor field (e.g., "Scattered Spider (aka Octo Tempest,
//   UNC3944, G1015)") and from the canonical mitre_objects.data.aliases.
// - Query the detection library by tag-array overlap (`tr_find_actor_tagged_detections`).
// - Return a small, prompt-sized list of detections the user already has
//   for THIS actor. Hand to the Detection Engineer as explicit-coverage
//   signal — separate from per-behaviour fuzzy similarity, which can't
//   surface broad actor coverage on its own.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { ActorCoverageSeedItem, ResearchSubject } from "./types.ts";

/** Parse the Research agent's free-text actor field into a clean alias list.
 *  Splits on commas, parens, "aka", trims, drops short fragments. */
export function parseActorAliases(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[,()]|\baka\b/i)) {
    const trimmed = piece.trim();
    if (trimmed.length < 3) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Enrich an alias list by looking up the canonical group in mitre_objects
 *  and pulling its `data.aliases` array. Best-effort — failures fall back to
 *  the parsed aliases unchanged. */
async function enrichAliasesViaMitre(
  supabase: SupabaseClient,
  aliases: string[],
): Promise<string[]> {
  if (aliases.length === 0) return aliases;
  // Match ANY of: name = alias, mitre_id = alias, or data->aliases contains alias.
  // Two queries (one for name/id, one for aliases JSONB) — PostgREST doesn't
  // mix the JSONB containment with .or() cleanly.
  const seen = new Set<string>(aliases.map(a => a.toLowerCase()));
  const out: string[] = [...aliases];

  // Query 1: name or mitre_id matches any alias.
  const orFilter = aliases
    .map(a => `name.ilike.${a},mitre_id.ilike.${a}`)
    .join(',');
  const { data: nameMatches } = await supabase
    .from('mitre_objects')
    .select('mitre_id, name, data')
    .eq('type', 'intrusion-set')
    .eq('deprecated', false)
    .or(orFilter)
    .limit(5);

  // Query 2: data->aliases contains any of the supplied aliases.
  for (const a of aliases) {
    const { data: aliasMatch } = await supabase
      .from('mitre_objects')
      .select('mitre_id, name, data')
      .eq('type', 'intrusion-set')
      .eq('deprecated', false)
      .contains('data', { aliases: [a] })
      .limit(1);
    if (aliasMatch && aliasMatch.length > 0) {
      nameMatches?.push(...aliasMatch);
    }
  }

  for (const row of nameMatches ?? []) {
    const candidates: string[] = [
      row.name,
      row.mitre_id,
      ...((row.data?.aliases as string[] | undefined) ?? []),
    ].filter(Boolean);
    for (const c of candidates) {
      const key = c.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }

  return out;
}

/** Build the actor-tagged coverage seed for one session. Returns [] when
 *  the subject has no usable actor field (e.g. CVE-only inputs). */
export async function buildActorCoverageSeed(
  supabase: SupabaseClient,
  subject: ResearchSubject,
  limit = 200,
): Promise<ActorCoverageSeedItem[]> {
  // Source aliases: prefer intel_summary.actor; fall back to subject.subject
  // (which is often "Scattered Spider (G1015)" for actor inputs).
  const rawActor = subject.intel_summary?.actor || subject.subject || '';
  const baseAliases = parseActorAliases(rawActor);
  if (baseAliases.length === 0) return [];

  let aliases: string[];
  try {
    aliases = await enrichAliasesViaMitre(supabase, baseAliases);
  } catch (e) {
    console.warn('[actor-coverage] mitre enrichment failed, proceeding with parsed aliases only:', (e as Error).message);
    aliases = baseAliases;
  }

  const { data, error } = await supabase.rpc('tr_find_actor_tagged_detections', {
    p_aliases: aliases,
    p_limit: limit,
  });
  if (error) {
    console.warn('[actor-coverage] tr_find_actor_tagged_detections failed:', error.message);
    return [];
  }

  return (data ?? []).map((d: {
    id: string;
    name: string;
    severity: string | null;
    mitre_technique_ids: string[] | null;
    matching_aliases: string[] | null;
  }) => ({
    id: d.id,
    name: d.name,
    severity: d.severity ?? null,
    mitre_technique_ids: d.mitre_technique_ids ?? [],
    matching_aliases: d.matching_aliases ?? [],
  }));
}
