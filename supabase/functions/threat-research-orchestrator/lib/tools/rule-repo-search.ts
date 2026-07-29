// supabase/functions/threat-research-orchestrator/lib/tools/rule-repo-search.ts
//
// Thin wrapper around the shared GitHub vendor-rule-repo search for the
// agent loop. Reuse priority: internal library first (library_search) —
// this tool is checked second, only when the internal library has no
// match, and its hits are drafting context ("adapt or complement these"),
// never a gate on whether generation proceeds.

import { ruleRepoSearch, type RuleRepoSearchResult } from "../../../_shared/rule-repo-search.ts";

export const ruleRepoSearchToolDeclaration = {
  functionDeclarations: [{
    name: 'rule_repo_search',
    description: `Search vendor detection-rule repositories (SigmaHQ/sigma, elastic/detection-rules, splunk/security_content, panther-labs/panther-analysis, sublime-security/sublime-rules) for existing rules covering this technique or behaviour. Call this AFTER library_search has found nothing in the user's own library — if a vendor rule already exists, adapt or complement it rather than writing from scratch. Requires the GITHUB_TOKEN secret; returns an empty result with an explanatory error if that isn't configured.`,
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
): Promise<RuleRepoSearchResult> {
  return await ruleRepoSearch({ query: params.query });
}
