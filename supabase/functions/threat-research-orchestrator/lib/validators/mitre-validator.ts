// supabase/functions/threat-research-orchestrator/lib/validators/mitre-validator.ts
//
// Thin wrapper around lib/mitre-validator.ts's bare functions, reshaped to
// this directory's finding-string interface for composition in index.ts.
//
// The orchestrator's own direct calls to findUnverifiedMitreIds /
// fetchTechniqueTactics / filterTacticInconsistent (all in handleDetection)
// are UNCHANGED — those populate real typed tree fields
// (unverified_mitre_ids, tactic_inconsistent_mitre_ids) the UI already
// renders, and rewiring them through here would risk regressing working
// code for no gain. This wrapper exists only so the composed
// run-all-validators call surfaces the same signal as a validator_findings
// string, which today has no UI surface at the detection level (only
// tactic_inconsistent_mitre_ids at the BEHAVIOUR level does).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { MitreTacticName } from "../types.ts";
import {
  findUnverifiedMitreIds,
  fetchTechniqueTactics,
  filterTacticInconsistent,
} from "../mitre-validator.ts";

export async function runMitreValidator(
  supabase: SupabaseClient,
  mitreTechniqueIds: readonly string[],
  tactic: MitreTacticName,
): Promise<string | null> {
  if (mitreTechniqueIds.length === 0) return null;

  const unverified = await findUnverifiedMitreIds(supabase, mitreTechniqueIds);
  const unverifiedSet = new Set(unverified);
  const verifiedIds = mitreTechniqueIds.filter(id => !unverifiedSet.has(id));

  const notes: string[] = [];
  if (unverified.length > 0) {
    notes.push(`unverified MITRE ID(s) not in the canonical catalog: ${unverified.join(', ')}`);
  }
  if (verifiedIds.length > 0) {
    const tacticsByTechnique = await fetchTechniqueTactics(supabase, verifiedIds);
    const inconsistent = filterTacticInconsistent(verifiedIds, tactic, tacticsByTechnique);
    if (inconsistent.length > 0) {
      notes.push(`technique(s) whose canonical tactic doesn't match this detection's tactic (${tactic}): ${inconsistent.join(', ')}`);
    }
  }
  return notes.length > 0 ? notes.join('; ') : null;
}
