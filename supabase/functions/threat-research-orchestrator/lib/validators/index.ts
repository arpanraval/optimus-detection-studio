// supabase/functions/threat-research-orchestrator/lib/validators/index.ts
//
// Deterministic (no-LLM) post-generation checks, run once per detection right
// after the KQL schema validation in handleDetection. Findings are advisory —
// they never block a detection from shipping, they surface on
// GeneratedDetection.validator_findings for the UI to show. No job phase, no
// reaper/dispatcher changes.
//
// A telemetry-feasibility check used to run here and was the one finding that
// DID gate: readiness downgraded on it. It compared the planner's free-text
// telemetry prose to environment_profiles labels by word overlap, so a
// detection's fate turned on whether its phrasing contained "sysmon". In
// session 7382a9c2 it blocked three of seven, two of which described their own
// requirement as optional. Removed — see lib/readiness.ts.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { DetectionOpportunity, GeneratedDetection } from "../types.ts";
import { runSigmaSyntaxValidator } from "./sigma-syntax.ts";
import { runCitationCheckValidator } from "./citation-check.ts";
import { runMitreValidator } from "./mitre-validator.ts";

// `userId` and `opportunity` are no longer read — the telemetry check was the
// only consumer. Kept in the signature so callers don't churn, and because the
// next deterministic check that needs environment context will want them back.
export async function runDetectionValidators(
  supabase: SupabaseClient,
  _userId: string,
  _opportunity: DetectionOpportunity,
  detection: GeneratedDetection,
): Promise<Record<string, string>> {
  const [sigma, citations, mitre] = await Promise.all([
    Promise.resolve(runSigmaSyntaxValidator(detection.query, detection.query_language)),
    runCitationCheckValidator(detection.citations),
    runMitreValidator(supabase, detection.mitre_technique_ids, detection.tactic),
  ]);

  const findings: Record<string, string> = {};
  if (sigma) findings.sigma_syntax = sigma;
  if (citations) findings.citation_check = citations;
  if (mitre) findings.mitre = mitre;
  return findings;
}
