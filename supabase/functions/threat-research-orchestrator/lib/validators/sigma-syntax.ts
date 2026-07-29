// supabase/functions/threat-research-orchestrator/lib/validators/sigma-syntax.ts
//
// Edge-native structural check for Sigma rule bodies. The real Sigma
// converter (SigmaConverterService.ts) is a browser-only Pyodide WASM
// worker and cannot run in a Deno edge function (no Worker/window, plus the
// platform's ~400s/256MB ceiling) — see the consolidated remediation plan
// §3.2. This is deliberately narrower: confirm the required top-level keys
// resolve with plausible structure, not a full YAML parse + schema
// validation. Only fires when query_language is 'Sigma'; other languages
// no-op (a documented gap, not silently assumed covered).

import type { ResearchQueryLanguage } from "../types.ts";

const REQUIRED_TOP_LEVEL = ['title', 'logsource', 'detection'] as const;

/** Index of the first line matching `^{key}\s*:` (a zero-indent top-level
 *  key), or -1 if absent. */
function findTopLevelKeyLine(lines: string[], key: string): number {
  const re = new RegExp(`^${key}\\s*:`);
  return lines.findIndex(l => re.test(l));
}

/** Returns a finding string when the Sigma rule is missing required
 *  structure, else null. No-ops for any non-Sigma query_language. */
export function runSigmaSyntaxValidator(
  query: string,
  queryLanguage: ResearchQueryLanguage,
): string | null {
  if (queryLanguage !== 'Sigma') return null;
  if (!query.trim()) return null;

  const lines = query.split('\n');
  const missing = REQUIRED_TOP_LEVEL.filter(key => findTopLevelKeyLine(lines, key) < 0);
  if (missing.length > 0) {
    return `Sigma rule is missing required top-level key(s): ${missing.join(', ')}.`;
  }

  // `condition` lives nested under `detection`, not at top level. Scan
  // forward from the detection: line until the next zero-indent key (or
  // EOF) and confirm a `condition:` line appears somewhere in between.
  const detectionLine = findTopLevelKeyLine(lines, 'detection');
  let hasCondition = false;
  for (let i = detectionLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) break; // next top-level key — detection block ended
    if (/^\s*condition\s*:/.test(line)) { hasCondition = true; break; }
  }
  if (!hasCondition) {
    return `Sigma rule's 'detection' block has no 'condition' key.`;
  }
  return null;
}
