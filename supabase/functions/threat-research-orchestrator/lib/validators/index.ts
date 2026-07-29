// supabase/functions/threat-research-orchestrator/lib/validators/index.ts
//
// Deterministic (no-LLM) post-generation checks, run once per detection
// right after the existing KQL schema validation in handleDetection.
// Findings are advisory — they never block a detection from shipping, they
// just surface on GeneratedDetection.validator_findings for the QA agent
// and the UI to see. No new job phase, no reaper/dispatcher changes.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { DetectionOpportunity, GeneratedDetection } from "../types.ts";
import { runTelemetryFeasibilityValidator } from "./telemetry-feasibility.ts";
import { runSigmaSyntaxValidator } from "./sigma-syntax.ts";
import { runCitationCheckValidator } from "./citation-check.ts";
import { runMitreValidator } from "./mitre-validator.ts";

export async function runDetectionValidators(
  supabase: SupabaseClient,
  userId: string,
  opportunity: DetectionOpportunity,
  detection: GeneratedDetection,
): Promise<Record<string, string>> {
  const [telemetry, sigma, citations, mitre] = await Promise.all([
    runTelemetryFeasibilityValidator(supabase, userId, opportunity.telemetry ?? []),
    Promise.resolve(runSigmaSyntaxValidator(detection.query, detection.query_language)),
    runCitationCheckValidator(detection.citations),
    runMitreValidator(supabase, detection.mitre_technique_ids, detection.tactic),
  ]);

  const findings: Record<string, string> = {};
  if (telemetry) findings.telemetry_feasibility = telemetry;
  if (sigma) findings.sigma_syntax = sigma;
  if (citations) findings.citation_check = citations;
  if (mitre) findings.mitre = mitre;
  return findings;
}
