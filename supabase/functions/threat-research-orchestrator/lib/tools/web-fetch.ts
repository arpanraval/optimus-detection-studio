// supabase/functions/threat-research-orchestrator/lib/tools/web-fetch.ts
//
// Thin wrapper around the shared plain-fetch page reader for the agent loop.
// Companion to web_search: web_search finds candidate URLs, web_fetch reads
// one specific page in full when the search snippet isn't enough.

import { webFetch, WebFetchResult } from "../../../_shared/web-fetch.ts";

export const webFetchToolDeclaration = {
  functionDeclarations: [{
    name: 'web_fetch',
    description: 'Fetch and read the full text content of one specific URL — usually one already returned by web_search. Use this when a search snippet is too short to extract the technical detail you actually need: a full command line, registry key, IOC list, or the complete body of an advisory or DFIR writeup.',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: { type: 'STRING', description: 'The exact URL to fetch' },
      },
      required: ['url'],
    },
  }],
};

export async function handleWebFetch(
  cache: Map<string, WebFetchResult>,
  params: { url: string },
): Promise<WebFetchResult> {
  return await webFetch({ url: params.url, cache });
}
