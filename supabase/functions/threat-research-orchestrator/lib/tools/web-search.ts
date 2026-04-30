// supabase/functions/threat-research-orchestrator/lib/tools/web-search.ts
//
// Thin wrapper around the shared Tavily module for the agent loop.

import { webSearch, WebSearchResult } from "../../../_shared/web-search.ts";

export const webSearchToolDeclaration = {
  functionDeclarations: [{
    name: 'web_search',
    description: 'Search the public web. Focus enum routes the query through curated security-domain bundles (threat_intel, vulnerabilities, tools, documentation, news) or general for unrestricted search. Returns ranked results with summaries.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Search query' },
        focus: { type: 'STRING', description: 'Domain bundle to focus on', enum: ['general','threat_intel','tools','vulnerabilities','documentation','news'] },
      },
      required: ['query'],
    },
  }],
};

export async function handleWebSearch(
  cache: Map<string, WebSearchResult>,
  params: { query: string; focus?: string },
): Promise<WebSearchResult> {
  return await webSearch({
    query: params.query,
    focus: (params.focus as any) ?? 'general',
    cache,
  });
}
