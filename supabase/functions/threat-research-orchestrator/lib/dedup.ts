// supabase/functions/threat-research-orchestrator/lib/dedup.ts
//
// Cross-opportunity semantic duplicate detection. Extracted from orchestrator.ts
// so it can be unit-tested: orchestrator.ts imports the Supabase client from
// esm.sh at module scope, which a vitest run cannot resolve. Everything here is
// pure — tree in, mutations + count out, no I/O, no Deno globals.

import type { GeneratedDetection, DetectionOpportunity, ThreatResearchTree } from "./types.ts";

/** Cross-opportunity duplicate detection finder. Runs at finalise time after
 *  all detection workers have committed their per-leaf patches. Catches
 *  anything the Opportunity Planner missed.
 *
 *  Pre-PR2 used exact-string name+query match. PR3-lite upgrades to a
 *  SEMANTIC FINGERPRINT that combines:
 *    1. normalized MITRE technique set (sorted, deduped) — catches "same
 *       T1003.001 different wording" duplicates
 *    2. canonical telemetry source set — catches "same Sysmon EID 10
 *       different field projections" duplicates
 *    3. extracted query tokens: table name, key field references,
 *       operator class — catches "same DeviceProcessEvents | where
 *       FileName contains 'mimikatz'" semantic duplicates that differ
 *       in formatting / aliasing
 *
 *  Two detections matching on (2 of 3) buckets are flagged as duplicates.
 *  The first occurrence wins canonicity; later ones get qa.duplicate_of set.
 *
 *  Mutates `tree` in place. Returns the number of duplicates flagged. */
export function flagCrossBehaviourDuplicates(tree: ThreatResearchTree): number {
  type Fingerprint = {
    mitre: string;       // sorted, joined technique ids
    telemetry: string;   // sorted, normalized data source set
    queryTokens: string; // sorted, normalized query token set
  };
  const seen = new Array<{ fp: Fingerprint; detectionId: string }>();
  let flagged = 0;

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const fingerprintQuery = (q: string): string => {
    if (!q) return '';
    // Strip inline comments and string literals — they're variable across
    // detections that are otherwise semantically identical (e.g. different
    // case styles, paraphrased rationales). Keep the structural tokens.
    const stripped = q
      .replace(/\/\/.*?$/gm, '')           // // line comments
      .replace(/\/\*[\s\S]*?\*\//g, '')    // /* block comments */
      .replace(/"[^"\n]*"/g, '"S"')        // double-quoted strings → placeholder
      .replace(/'[^'\n]*'/g, "'S'")        // single-quoted strings → placeholder
      .toLowerCase();
    // Extract identifier-like tokens (table names, fields, operators).
    // Sort+dedupe so reordering doesn't change the fingerprint.
    const tokens = stripped.match(/[a-z_][a-z0-9_.]{2,}/g) ?? [];
    return Array.from(new Set(tokens)).sort().join('|');
  };
  const fingerprintTelemetry = (det: GeneratedDetection, opp: DetectionOpportunity): string => {
    const src = new Set<string>();
    for (const t of opp.telemetry ?? []) src.add(norm(t));
    // Pull common data-source hints from the query body too (e.g. "Sysmon
    // EID 1", "DeviceProcessEvents", "process_creation").
    const hints = (det.query || '').match(/\b(sysmon|deviceprocessevents|deviceloginevents|securityalert|signinlogs|networktraffic|auditd|powershell|wineventlog)[a-z0-9_.]*/gi) ?? [];
    for (const h of hints) src.add(norm(h));
    return Array.from(src).sort().join('|');
  };
  const fingerprintMitre = (det: GeneratedDetection): string => {
    return Array.from(new Set(det.mitre_technique_ids.map(s => s.toUpperCase().trim()))).sort().join(',');
  };

  for (const b of tree.behaviours) {
    for (const opp of b.opportunities) {
      const det = opp.detection;
      if (det.archived) continue;
      if (!det.query) continue; // empty detection — skip (engineer_failed / library_match path)

      const fp: Fingerprint = {
        mitre: fingerprintMitre(det),
        telemetry: fingerprintTelemetry(det, opp),
        queryTokens: fingerprintQuery(det.query),
      };
      // Don't dedup against a fingerprint that's entirely empty.
      if (!fp.mitre && !fp.telemetry && !fp.queryTokens) continue;

      // Match against any prior fingerprint with at least 2 of 3 buckets
      // identical. 2-of-3 catches semantic duplicates while tolerating
      // legitimate variation (e.g. one might cite different MITRE if the
      // engineer dropped a sub-technique tag).
      const match = seen.find(({ fp: other }) => {
        let hits = 0;
        if (fp.mitre && fp.mitre === other.mitre) hits++;
        if (fp.telemetry && fp.telemetry === other.telemetry) hits++;
        if (fp.queryTokens && fp.queryTokens === other.queryTokens) hits++;
        return hits >= 2;
      });

      if (!match) {
        seen.push({ fp, detectionId: det.id });
        continue;
      }

      // Flag the duplicate. Preserve any existing qa verdict — we're
      // adding a concern, not overwriting the model's judgement.
      const dupNote = `Semantic duplicate of detection ${match.detectionId} (fingerprint match across MITRE/telemetry/query tokens).`;
      if (det.qa) {
        det.qa.duplicate_of = match.detectionId;
        if (!det.qa.concerns.some(c => c.startsWith('Semantic duplicate'))) {
          det.qa.concerns = [...det.qa.concerns, dupNote];
        }
      } else {
        // No qa block — the detection shipped with a qa_error, or QA never
        // ran at all. The previous code synthesised a qa block here with
        // verdict:'pass_with_concerns' while its own comment said "don't
        // fabricate a verdict". That fabrication was load-bearing in the UI:
        // resolveRowState reads det.qa?.verdict FIRST, so a never-QA'd
        // detection rendered "Passed with concerns" and became bulk-save
        // eligible. Record the duplicate as detection-level metadata instead,
        // and leave det.qa null so every reader can still tell that no
        // verdict exists.
        det.duplicate_of = match.detectionId;
        if (!det.qa_error) det.qa_error = 'duplicate_no_qa';
      }
      flagged++;
    }
  }
  return flagged;
}
