// supabase/functions/threat-research-orchestrator/lib/validators/citation-check.ts
//
// Deterministic check that a detection's cited sources actually say
// something resembling the claim attributed to them. Fetches each cited
// URL (capped, short timeout) and checks for significant-word overlap
// between the claim and the fetched page text. Fail-open on fetch errors —
// a network failure or paywall is not evidence the citation is fabricated,
// so it is never counted against the citation.

import type { ResearchCitation } from "../types.ts";
import { webFetch } from "../../../_shared/web-fetch.ts";

const MAX_CITATIONS_CHECKED = 4;
const FETCH_TIMEOUT_MS = 8_000;
const MIN_OVERLAP_RATIO = 0.3;

const STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'were', 'been', 'their', 'they',
  'which', 'about', 'into', 'used', 'using', 'when', 'where', 'then', 'than',
  'also', 'were', 'will', 'would', 'could', 'should',
]);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function significantWords(s: string): string[] {
  return normalize(s).split(' ').filter(w => w.length >= 4 && !STOPWORDS.has(w));
}

function overlapRatio(claim: string, pageText: string): number {
  const claimWords = significantWords(claim);
  if (claimWords.length === 0) return 1; // nothing meaningful to check, don't flag
  const pageNorm = normalize(pageText);
  const hit = claimWords.filter(w => pageNorm.includes(w)).length;
  return hit / claimWords.length;
}

/** Returns a finding string when one or more citations' claims don't
 *  overlap with their cited page's fetched text, else null. Citations past
 *  MAX_CITATIONS_CHECKED are skipped, not flagged — this is a spot-check,
 *  not exhaustive verification. */
export async function runCitationCheckValidator(
  citations: readonly ResearchCitation[],
): Promise<string | null> {
  const toCheck = citations.filter(c => c.url && c.claim).slice(0, MAX_CITATIONS_CHECKED);
  if (toCheck.length === 0) return null;

  const results = await Promise.all(toCheck.map(async (c) => {
    const fetched = await webFetch({ url: c.url, timeoutMs: FETCH_TIMEOUT_MS });
    if (fetched.error || !fetched.text) return null; // fail open — can't verify, don't penalize
    return overlapRatio(c.claim, fetched.text) < MIN_OVERLAP_RATIO ? c : null;
  }));

  const weak = results.filter((c): c is ResearchCitation => c !== null);
  if (weak.length === 0) return null;

  return `${weak.length} citation(s) don't clearly support their claim on the fetched page: ${weak.map(c => c.url).join(', ')}. Verify manually — the source may have changed or the claim may be paraphrased beyond recognition.`;
}
