// supabase/functions/threat-research-orchestrator/lib/preflight.ts
//
// Phase 0: input classification.
//
// Previous incarnation: a library_search against raw input text, reported as
// "X detections similar". Removed because it was structurally misleading
// (no behaviours yet to match against, no minimum-similarity floor).
//
// Current incarnation: classify the input into one of cve / group / campaign
// / technique / concept and write that classification to tree.subject EARLY.
// The Research Agent reads tree.subject.classification to pick the right
// workflow lane (CVE doesn't get the 14-tactic walk; technique gets variant
// enumeration; etc.).
//
// Why this matters: pre-PR2, the Research Agent ran the same 14-tactic walk
// regardless of input shape, which produced fabricated post-exploit
// behaviours for CVEs and pointless "observed:false" rows for techniques.
// Classifying first lets each downstream call run a prompt that fits the
// input shape — the single biggest win of PR2.
//
// Failure mode: if the classifier loop fails (timeout, validation cap,
// 429 cascade), preflight does NOT block the session — it falls back to
// classification='concept' and lets the Research Agent's actor/concept
// workflow run. Better honest-fallback than fail-the-session-here.

import { ToolContext } from "./tools/index.ts";
import { RunContext, emit } from "./events.ts";
import { classifyInput } from "./agents/input-classifier.ts";
import type { PreflightSummary, ResearchInputClassification, ResearchSubject } from "./types.ts";

export interface PreflightResult {
  summary: PreflightSummary;
  /** Classification stub the orchestrator writes to tree.subject. The
   *  Research Agent reads classification to pick its workflow and merges
   *  this into its own subject output (adding brief, intel_summary,
   *  citations). The orchestrator preserves the classifier's value over
   *  the Research Agent's — preflight is the source of truth for the
   *  workflow lane. */
  subject_stub: Pick<ResearchSubject, 'classification' | 'subject'> | null;
}

export async function runPreflight(
  toolCtx: ToolContext,
  runCtx: RunContext,
  inputText: string,
): Promise<PreflightResult> {
  const start = Date.now();
  await emit(runCtx, {
    agent: 'preflight',
    event_type: 'preflight_started',
    message: 'classifying input',
  });

  const classified = await classifyInput(toolCtx, runCtx, inputText);
  let classification: ResearchInputClassification = 'concept';
  let canonical_name = inputText.trim().slice(0, 200);
  if (classified) {
    classification = classified.classification;
    canonical_name = classified.canonical_name;
    await emit(runCtx, {
      agent: 'preflight',
      event_type: 'preflight_completed',
      message: `classified as ${classification}: ${canonical_name}`,
      duration_ms: Date.now() - start,
      payload: {
        classification,
        canonical_name,
        reasoning: classified.reasoning,
      },
    });
  } else {
    // Classifier loop failed. Don't block the session — fall through with
    // concept classification. The Research Agent's concept workflow is
    // the closest thing we have to a "general" workflow; it won't
    // fabricate the way CVE-mis-classified-as-actor will. Surface the
    // fallback in the event log so an analyst can see it.
    await emit(runCtx, {
      agent: 'preflight',
      event_type: 'preflight_completed',
      message: 'classifier did not produce verdict — defaulting to concept workflow',
      duration_ms: Date.now() - start,
      payload: {
        classification,
        canonical_name,
        fallback: true,
      },
    });
  }

  const summary: PreflightSummary = {
    library_hits: 0,
    techniques_seen_in_hits: [],
    skipped: false,
    ran_at: new Date().toISOString(),
  };

  return {
    summary,
    subject_stub: { classification, subject: canonical_name },
  };
}
