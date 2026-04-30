// supabase/functions/threat-research-orchestrator/lib/tools/mitre-search.ts
//
// MITRE ATT&CK lookup. Queries the unified `mitre_objects` table (STIX-shaped:
// type ∈ {intrusion-set, attack-pattern, malware, tool, campaign}). Aliases
// live inside the `data` JSONB column. There is no separate per-kind table.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export const mitreSearchToolDeclaration = {
  functionDeclarations: [{
    name: 'mitre_search',
    description: `Look up MITRE ATT&CK entities by name, alias, or MITRE ID. Returns matching groups, software, techniques (with sub-techniques), and campaigns.
Use this to:
- Find a threat actor by alias ("Scattered Spider" -> G1015)
- Resolve a technique by name ("Process Injection" -> T1055)
- Walk a sub-technique tree (T1059 -> T1059.001, T1059.003, ...)`,
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Name, alias, or MITRE ID (e.g. "G1015", "Scattered Spider", "T1003")' },
        kind:  { type: 'STRING', description: 'Filter to a specific entity kind', enum: ['group','software','technique','campaign','any'] },
        limit: { type: 'INTEGER', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  }],
};

export interface MitreSearchHit {
  kind: 'group' | 'software' | 'technique' | 'campaign';
  id: string;
  name: string;
  aliases?: string[];
  description: string;
  url: string;
  stix_id: string;
}

const KIND_TO_STIX_TYPE: Record<string, string[]> = {
  group:     ['intrusion-set'],
  software:  ['malware', 'tool'],
  technique: ['attack-pattern'],
  campaign:  ['campaign'],
};

function rowToHit(row: any): MitreSearchHit {
  const stixType = row.type as string;
  const kind: MitreSearchHit['kind'] =
    stixType === 'intrusion-set'  ? 'group' :
    stixType === 'attack-pattern' ? 'technique' :
    stixType === 'campaign'       ? 'campaign' :
                                    'software';
  return {
    kind,
    id: row.mitre_id,
    name: row.name,
    aliases: row.data?.aliases ?? [],
    description: (row.description ?? '').slice(0, 1000),
    url: row.url ?? '',
    stix_id: row.stix_id,
  };
}

export async function handleMitreSearch(
  supabase: SupabaseClient,
  params: { query: string; kind?: string; limit?: number },
): Promise<{ hits: MitreSearchHit[] }> {
  const limit = Math.min(params.limit ?? 10, 25);
  const kind  = params.kind ?? 'any';
  const q = params.query.trim();
  if (!q) return { hits: [] };

  const stixTypes = kind === 'any'
    ? ['intrusion-set','attack-pattern','malware','tool','campaign']
    : (KIND_TO_STIX_TYPE[kind] ?? []);

  // Build OR filter: match by mitre_id (case-insensitive), name (substring), or alias.
  // Postgrest .or() syntax:
  //   mitre_id.ilike.<q>,name.ilike.%<q>%,data->aliases.cs.["<q>"]
  // We split into two queries because PostgREST doesn't support ILIKE on JSONB
  // alias arrays in a single .or — instead we run a second query against the
  // jsonb `data` and union in code.
  const query = supabase
    .from('mitre_objects')
    .select('mitre_id, stix_id, name, type, description, url, data, deprecated')
    .in('type', stixTypes)
    .eq('deprecated', false)
    .or(`mitre_id.ilike.${q},name.ilike.%${q}%`)
    .limit(limit);

  const { data, error } = await query;
  if (error) {
    console.warn('[mitre-search] query failed:', error.message);
    return { hits: [] };
  }

  // Secondary: alias match. Cheap because it's the same indexed table; we
  // de-dupe by stix_id afterwards.
  const aliasQuery = supabase
    .from('mitre_objects')
    .select('mitre_id, stix_id, name, type, description, url, data, deprecated')
    .in('type', stixTypes)
    .eq('deprecated', false)
    .contains('data', { aliases: [q] })
    .limit(limit);

  const { data: aliasData } = await aliasQuery;

  const seen = new Set<string>();
  const hits: MitreSearchHit[] = [];
  for (const row of [...(data ?? []), ...(aliasData ?? [])]) {
    if (seen.has(row.stix_id)) continue;
    seen.add(row.stix_id);
    hits.push(rowToHit(row));
    if (hits.length >= limit) break;
  }

  return { hits };
}
