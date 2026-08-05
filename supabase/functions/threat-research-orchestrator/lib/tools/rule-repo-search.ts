// supabase/functions/threat-research-orchestrator/lib/tools/rule-repo-search.ts
//
// Thin wrapper around the shared GitHub vendor-rule-repo search for the
// agent loop. Reuse priority: internal library first (library_search) —
// this tool is checked second, only when the internal library has no
// match, and its hits are drafting context ("adapt or complement these"),
// never a gate on whether generation proceeds.
//
// PROVENANCE
//
// Production shows seven rule_repo_search calls with no persisted result, no
// source URL, and no error. The reason is that the tool returns
// `{ hits: [], error: 'not configured' }` when GITHUB_TOKEN is absent, and that
// answer goes only into the model's context — where it is neither stored nor
// visible afterwards. So the session could not substantiate having reviewed
// vendor detections at all, in either direction: not that it found nothing, and
// not that it never looked.
//
// Every call now records what happened on the ToolContext, and the orchestrator
// persists it to the tree. "Not configured" becomes a recorded fact instead of
// an absence.

import {
  ruleRepoSearch,
  reposForLanguage,
  type RuleRepoSearchResult,
} from "../../../_shared/rule-repo-search.ts";

/** One vendor-search attempt, durable. */
export interface VendorSearchRecord {
  query: string;
  attempted_at: string;
  repositories: readonly string[];
  results_found: number;
  /** URLs of the hits returned, so a claim of "we reviewed vendor rules" can
   *  be checked rather than taken on trust. */
  source_urls: string[];
  /** Present when the search could not run — most often a missing
   *  GITHUB_TOKEN. */
  error?: string;
}

export const ruleRepoSearchToolDeclaration = {
  functionDeclarations: [{
    name: 'rule_repo_search',
    description: `Search vendor detection-rule repositories for existing rules covering this technique or behaviour. Which repos are searched depends on the session's target language — KQL sessions search SigmaHQ/sigma, Azure/Azure-Sentinel and microsoft/Microsoft-365-Defender-Hunting-Queries; SPL searches Sigma and splunk/security_content; EQL searches Sigma and elastic/detection-rules. Call this AFTER library_search has found nothing in the user's own library — if a vendor rule already exists, adapt or complement it rather than writing from scratch. Requires the GITHUB_TOKEN secret; returns an empty result with an explanatory error if that isn't configured.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Search terms describing the technique, behaviour, or observable (e.g. "mshta inline hta execution")' },
      },
      required: ['query'],
    },
  }],
};

export async function handleRuleRepoSearch(
  params: { query: string },
  ctx?: {
    /** Target language, so only the relevant repos are searched — all seven
     *  would spend seven of GitHub's ten code-search requests per minute. */
    queryLanguage?: string | null;
    /** Appended to, for the orchestrator to persist. */
    vendorSearchLog?: VendorSearchRecord[];
  },
): Promise<RuleRepoSearchResult> {
  const repos = reposForLanguage(ctx?.queryLanguage);
  const result = await ruleRepoSearch({ query: params.query, repos });

  ctx?.vendorSearchLog?.push({
    query: params.query,
    attempted_at: new Date().toISOString(),
    repositories: repos,
    results_found: result.hits.length,
    source_urls: result.hits.map(h => h.html_url).filter(u => Boolean(u)),
    ...(result.error ? { error: result.error } : {}),
  });

  return result;
}
