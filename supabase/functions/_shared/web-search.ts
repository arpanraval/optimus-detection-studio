// supabase/functions/_shared/web-search.ts
//
// Shared Tavily web-search wrapper. Used by both optimus-tools and
// threat-research-orchestrator. Preserves the exact response shape and
// focus enum that optimus-tools previously emitted.

export type WebSearchFocus =
  | 'general' | 'threat_intel' | 'tools'
  | 'vulnerabilities' | 'documentation' | 'news';

export interface WebSearchResult {
  query: string;
  focus?: WebSearchFocus;
  total?: number;
  results: Array<{
    title: string;
    url: string;
    description: string;
    source: string;
    score: number;
  }>;
  summary?: string | null;
  sources?: string[];
  error?: string;
  suggestion?: string;
  over_budget?: boolean;
}

// Cached focus → domain mappings (verbatim from optimus-tools).
const DOMAINS_BY_FOCUS: Record<WebSearchFocus, string[]> = {
  threat_intel: [
    'attack.mitre.org','mandiant.com','microsoft.com','crowdstrike.com',
    'unit42.paloaltonetworks.com','secureworks.com','talosintelligence.com',
    'thedfirreport.com','bleepingcomputer.com',
  ],
  tools: [
    'attack.mitre.org','lolbas-project.github.io','gtfobins.github.io',
    'github.com','atomic-red-team.org',
  ],
  vulnerabilities: [
    'nvd.nist.gov','cve.org','cvedetails.com',
    'rapid7.com','tenable.com','qualys.com',
  ],
  documentation: [
    'learn.microsoft.com','docs.aws.amazon.com','cloud.google.com',
    'elastic.co','splunk.com',
  ],
  news: [
    'bleepingcomputer.com','therecord.media','darkreading.com',
    'securityweek.com','krebsonsecurity.com',
  ],
  general: [],
};

export interface WebSearchOpts {
  query: string;
  focus?: WebSearchFocus;
  /** Optional in-process cache, keyed by sha1(query|focus). */
  cache?: Map<string, WebSearchResult>;
}

async function sha1(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-1', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

export async function webSearch(opts: WebSearchOpts): Promise<WebSearchResult> {
  const { query, focus = 'general', cache } = opts;
  const cacheKey = await sha1(`${query}|${focus}`);

  if (cache?.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  const apiKey = Deno.env.get('TAVILY_API_KEY');
  if (!apiKey) {
    return {
      query,
      results: [],
      error: 'Web search is not configured. Ask your administrator to add TAVILY_API_KEY.',
      suggestion: 'Try using the MITRE query or library search tools instead.',
    };
  }

  const includeDomains = DOMAINS_BY_FOCUS[focus] || [];

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        include_answer: true,
        include_domains: includeDomains.length > 0 ? includeDomains : undefined,
        max_results: 8,
      }),
    });

    if (!response.ok) {
      console.error('Tavily API error:', await response.text());
      return { query, results: [], error: 'Web search failed. Try the MITRE or library search tools.' };
    }

    const data = await response.json();
    const results = (data.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      description: r.content?.slice(0, 400) || '',
      source: new URL(r.url).hostname,
      score: r.score,
    }));

    const result: WebSearchResult = {
      query,
      focus,
      total: results.length,
      results,
      summary: data.answer || null,
      sources: results.map((r: any) => r.source).filter((s: string, i: number, a: string[]) => a.indexOf(s) === i),
    };

    if (cache) cache.set(cacheKey, result);
    return result;
  } catch (e) {
    console.error('Web search error:', e);
    return { query, results: [], error: 'Web search failed.' };
  }
}
