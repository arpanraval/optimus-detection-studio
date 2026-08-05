// supabase/functions/threat-research-orchestrator/lib/citations.ts
//
// Citation merging for generated detections.
//
// validateGeneratedDetection hardcodes `citations: []`, and nothing downstream
// ever filled it — so the Citations panel on every detection leaf was
// permanently empty. The sources exist: the Research Agent puts citations on
// each behaviour, and the Attack Researcher puts more on each behaviour's
// deep_dive. They just never reached the leaf.
//
// This is a deterministic server-side post-step, not a prompt change. The
// model is not asked to restate its sources (which invites fabricated URLs);
// we attach the citations the pipeline already collected and verified.
//
// No Deno or esm.sh imports here, so this module is unit-testable.

import type { AttackBehaviour, ResearchCitation } from "./types.ts";

/** Upper bound on citations attached to one detection. The panel is a sidebar
 *  list, and a detection merged from several behaviours can otherwise inherit
 *  30+ sources — past roughly this many the list stops being reviewable and
 *  starts being noise. */
export const MAX_DETECTION_CITATIONS = 8;

/** Merge the citations from every behaviour that fed a detection.
 *
 *  Order is deliberate and stable: for each source behaviour, its own
 *  (Research Agent) citations first, then its deep_dive (Attack Researcher)
 *  citations. Research citations establish that the behaviour is real; the
 *  deep-dive ones elaborate on how it works, so they read better second.
 *
 *  Deduped by URL, keeping the first occurrence — the first mention carries the
 *  claim closest to why the behaviour was identified. Entries without a URL are
 *  dropped: the UI renders each citation as a link, and an unlinkable citation
 *  is an unverifiable one. */
export function mergeSourceCitations(
  behaviours: readonly Pick<AttackBehaviour, 'citations' | 'deep_dive'>[],
  limit: number = MAX_DETECTION_CITATIONS,
): ResearchCitation[] {
  const seen = new Set<string>();
  const out: ResearchCitation[] = [];

  for (const b of behaviours) {
    const fromBehaviour = b?.citations ?? [];
    const fromDeepDive = b?.deep_dive?.citations ?? [];
    for (const c of [...fromBehaviour, ...fromDeepDive]) {
      if (!c?.url) continue;
      if (seen.has(c.url)) continue;
      seen.add(c.url);
      out.push(c);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
