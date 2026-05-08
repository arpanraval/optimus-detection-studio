// supabase/functions/threat-research-orchestrator/lib/tools/library-search.ts
//
// Search the user's existing detection library for similar detections. Uses
// the existing `hybrid_search_detections` RPC (semantic + keyword) and the
// existing `generate-embedding` edge function to embed the agent's query.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export const librarySearchToolDeclaration = {
  functionDeclarations: [{
    name: 'library_search',
    description: `Search the user's existing detection library for similar detections. Use this to:
- Avoid generating duplicates (a near-match means the user already covers this)
- Anchor new detections to the user's house style
- Identify behaviours that are already covered`,
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Free-text describing the behaviour, technique, or detection idea' },
        limit: { type: 'INTEGER', description: 'Max results (default 10, max 25)' },
      },
      required: ['query'],
    },
  }],
};

export interface LibrarySearchHit {
  id: string;
  name: string;
  description: string;
  status: string;
  severity: string;
  mitre_technique_ids: string[];
  /** Empty string when the detection row has no language set, or when the
   *  follow-up lookup didn't find this id. The hybrid_search_detections RPC
   *  doesn't return queryLanguage in its TABLE signature, so we fetch it
   *  via a small batched SELECT after the search completes. */
  query_language: string;
  semantic_score: number;
  keyword_score: number;
  combined_score: number;
}

/**
 * Embed the query via the existing generate-embedding edge function, then
 * call the hybrid search RPC. Both pieces are existing infrastructure with
 * clear intent (text → vector; vector + text → ranked detections).
 *
 * Internal callers (the orchestrator) run with the service-role key — they
 * MUST pass userId so generate-embedding can attribute telemetry without
 * trying to validate the bearer as a user-JWT.
 */
export async function handleLibrarySearch(
  supabase: SupabaseClient,
  params: { query: string; limit?: number; userId: string },
): Promise<{ hits: LibrarySearchHit[] }> {
  const limit = Math.min(params.limit ?? 10, 25);
  const q = params.query.trim();
  if (!q) return { hits: [] };

  // 1. Embed.
  const { data: embedRes, error: embedErr } = await supabase.functions.invoke('generate-embedding', {
    body: { type: 'query', text: q, feature: 'embedding-threat-intel', userId: params.userId },
  });
  if (embedErr || !embedRes?.embedding) {
    console.warn('[library-search] embed failed:', embedErr?.message);
    // Graceful degradation: keyword-only search via the same RPC with a zero
    // vector would mis-rank results, so just return empty rather than mislead.
    return { hits: [] };
  }

  // 2. Hybrid search.
  const { data, error } = await supabase.rpc('hybrid_search_detections', {
    p_query: q,
    p_query_embedding: embedRes.embedding,
    p_limit: limit,
  });
  if (error) {
    console.warn('[library-search] hybrid_search_detections failed:', error.message);
    return { hits: [] };
  }

  const rows = (data ?? []) as any[];
  if (rows.length === 0) return { hits: [] };

  // 3. Backfill queryLanguage. The hybrid RPC's TABLE signature doesn't
  //    return it but the Detection Engineer needs it (the LibraryMatch
  //    payload it emits ships query_language to the UI). One batched SELECT
  //    on the matched ids — small, indexed, and only fires when there are
  //    hits. Failure is non-fatal; missing language degrades to ''.
  const ids = rows.map(r => r.detection_id).filter(Boolean);
  const langById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: langRows, error: langErr } = await supabase
      .from('detections')
      .select('id, queryLanguage')
      .in('id', ids);
    if (langErr) {
      console.warn('[library-search] queryLanguage backfill failed:', langErr.message);
    } else {
      for (const r of (langRows ?? []) as Array<{ id: string; queryLanguage: string | null }>) {
        if (r.queryLanguage) langById.set(r.id, r.queryLanguage);
      }
    }
  }

  return {
    hits: rows.map(d => ({
      id: d.detection_id,
      name: d.name,
      description: d.description ?? '',
      status: d.status,
      severity: d.severity,
      mitre_technique_ids: d.mitre_ids ?? [],
      query_language: langById.get(d.detection_id) ?? '',
      semantic_score: d.semantic_score ?? 0,
      keyword_score: d.keyword_score ?? 0,
      combined_score: d.combined_score ?? 0,
    })),
  };
}
