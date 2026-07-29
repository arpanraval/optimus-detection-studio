// supabase/functions/_shared/rule-repo-search.ts
//
// Search vendor detection-rule repositories (SigmaHQ, Elastic, Splunk,
// Panther, Sublime) via GitHub's Code Search API. This is the missing pillar
// the 2026-07-28/29 remediation plan called out: "here are three existing
// rules — adapt or complement" is a materially different and better prompt
// than "write one from scratch," and no code path in this repo checked
// vendor repos before generating.
//
// Reuse priority (per Amendment 1's closing note): internal library first,
// vendor repos second. This tool is drafting context for the Detection
// Agent when the internal library has no match — never a gate, and internal
// coverage always wins when both exist.
//
// API shape verified directly against GitHub's REST docs (2026-07-29):
//   GET /search/code — Authorization: Bearer <token>, Accept:
//   application/vnd.github+json, X-GitHub-Api-Version: 2026-03-10.
//   Rate limit: 10 requests/minute for code search specifically (separate,
//   stricter than the general 5000/hour REST limit). GitHub's search
//   qualifiers AND within one query — you cannot OR two `repo:` values in a
//   single call, since a file lives in exactly one repo — so covering N
//   target repos costs N code-search requests. We fire all 5 in parallel per
//   tool call, which caps us at ~2 tool calls/minute before hitting the
//   limit; content fetches for the resulting hits use the separate, much
//   higher-ceiling Contents API and don't count against that budget.

export interface RuleRepoSearchHit {
  repo: string;
  path: string;
  html_url: string;
  /** First ~1500 chars of the file, fetched via the Contents API. Empty
   *  when the content fetch failed or was skipped (only the top N combined
   *  hits get a content fetch, to bound total API calls per tool use). */
  snippet: string;
}

export interface RuleRepoSearchResult {
  query: string;
  hits: RuleRepoSearchHit[];
  error?: string;
}

/** The vendor rule repos this tool covers. Sigma first — its rules are the
 *  most portable (pySigma converts to most SIEM query languages) and by far
 *  the most numerous corpus of the five. */
export const TARGET_REPOS = [
  'SigmaHQ/sigma',
  'elastic/detection-rules',
  'splunk/security_content',
  'panther-labs/panther-analysis',
  'sublime-security/sublime-rules',
] as const;

const GITHUB_API_VERSION = '2026-03-10';
const GITHUB_TIMEOUT_MS = 15_000;
const MAX_HITS_PER_REPO = 3;
/** Only the top N combined hits (across all repos) get a content fetch —
 *  bounds total GitHub API calls per tool invocation regardless of how many
 *  repos returned matches. */
const MAX_CONTENT_FETCHES = 5;
const MAX_SNIPPET_CHARS = 1500;

function ghHeaders(token: string): HeadersInit {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    'User-Agent': 'OptimusDetectionStudio/1.0 (+threat-research)',
  };
}

async function searchOneRepo(token: string, query: string, repo: string): Promise<RuleRepoSearchHit[]> {
  const q = encodeURIComponent(`${query} repo:${repo}`);
  try {
    const res = await fetch(`https://api.github.com/search/code?q=${q}&per_page=${MAX_HITS_PER_REPO}`, {
      headers: ghHeaders(token),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Non-fatal per repo — a 422 (malformed query), 403 (rate limited),
      // or any other error on ONE repo shouldn't drop the other four's
      // results. The caller sees which repos yielded nothing via absence,
      // not an error surfaced per-repo.
      return [];
    }
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    return items.slice(0, MAX_HITS_PER_REPO).map((item: any) => ({
      repo,
      path: String(item.path ?? ''),
      html_url: String(item.html_url ?? ''),
      snippet: '',
    }));
  } catch {
    return [];
  }
}

/** Fetch a file's content via the Contents API (uses the repo's default
 *  branch automatically — no need to guess main vs master) and decode the
 *  base64 body. Separate, higher rate-limit ceiling than code search. */
async function fetchSnippet(token: string, hit: RuleRepoSearchHit): Promise<string> {
  try {
    const res = await fetch(`https://api.github.com/repos/${hit.repo}/contents/${hit.path}`, {
      headers: ghHeaders(token),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
    if (!res.ok) return '';
    const data = await res.json();
    if (data.encoding !== 'base64' || typeof data.content !== 'string') return '';
    const decoded = atob(data.content.replace(/\n/g, ''));
    return decoded.slice(0, MAX_SNIPPET_CHARS);
  } catch {
    return '';
  }
}

export interface RuleRepoSearchOpts {
  query: string;
  /** Defaults to all five target repos. Callers may narrow this to reduce
   *  the number of parallel code-search requests (and therefore how much
   *  of the 10/min budget one tool call spends). */
  repos?: readonly string[];
}

export async function ruleRepoSearch(opts: RuleRepoSearchOpts): Promise<RuleRepoSearchResult> {
  const { query, repos = TARGET_REPOS } = opts;
  const token = Deno.env.get('GITHUB_TOKEN');
  if (!token) {
    return {
      query,
      hits: [],
      error: 'Vendor rule-repo search is not configured. Ask your administrator to add GITHUB_TOKEN.',
    };
  }
  if (!query.trim()) {
    return { query, hits: [], error: 'Empty query.' };
  }

  const perRepoResults = await Promise.all(repos.map(repo => searchOneRepo(token, query, repo)));
  const allHits = perRepoResults.flat();
  if (allHits.length === 0) {
    return { query, hits: [] };
  }

  const toFetch = allHits.slice(0, MAX_CONTENT_FETCHES);
  const snippets = await Promise.all(toFetch.map(h => fetchSnippet(token, h)));
  const withSnippets = toFetch.map((h, i) => ({ ...h, snippet: snippets[i] }));

  return { query, hits: withSnippets };
}
