// supabase/functions/threat-research-orchestrator/lib/agents/qa-agent.ts
//
// QA Agent — critiques a generated detection. Returns verdict, concerns,
// suggested changes. Drives the actor-critic loop in detection-engineer.ts.
// Tools: feasibility_lookup, library_search.
// Knowledge Pack: query-qa.

import { runAgentLoop, AgentLoopConfig } from "./agent-loop.ts";
import { ToolContext, TOOLS_FOR } from "../tools/index.ts";
import { RunContext } from "../events.ts";
import { loadKnowledgePack } from "../skills-loader.ts";
import type { GeneratedDetection, QaResult, QaVerdict, QaCoverageQuality } from "../types.ts";

const SYSTEM = `You are the QA Agent for the Threat Research feature.
Your job: critique the candidate detection. Use the query-qa knowledge pack.
You have feasibility_lookup and library_search; you do NOT have web_search.
Be specific, action-oriented, and kind.
Output a SINGLE JSON object matching the schema in the knowledge pack (no fences, no commentary outside JSON).`;

const VALID_VERDICTS = new Set<QaVerdict>(['pass','pass_with_concerns','fail']);
const VALID_QUALITY  = new Set<QaCoverageQuality>(['tight','acceptable','loose']);

function validateQaResult(text: string): QaResult | null {
  try {
    const t = text.trim();
    const start = t.indexOf('{');
    if (start < 0) return null;
    const json = JSON.parse(t.slice(start, t.lastIndexOf('}') + 1));
    if (!VALID_VERDICTS.has(json.verdict)) return null;
    if (!VALID_QUALITY.has(json.coverage_quality)) return null;
    return {
      verdict: json.verdict,
      coverage_quality: json.coverage_quality,
      concerns: Array.isArray(json.concerns) ? json.concerns.map(String) : [],
      suggested_changes: Array.isArray(json.suggested_changes) ? json.suggested_changes.map(String) : [],
      duplicate_of: typeof json.duplicate_of === 'string' ? json.duplicate_of : null,
      iteration_history: [], // populated by orchestrator
      iteration_count: 0,    // populated by orchestrator
    };
  } catch {
    return null;
  }
}

export async function critiqueDetection(
  toolCtx: ToolContext,
  runCtx: RunContext,
  detection: GeneratedDetection,
  previousQa?: QaResult,
): Promise<QaResult> {
  const pack = await loadKnowledgePack('query-qa');
  const cfg: AgentLoopConfig<QaResult> = {
    agent: 'qa',
    model: 'claude-haiku-4-5',
    systemInstruction: SYSTEM,
    knowledgePack: pack,
    toolDeclarations: TOOLS_FOR.qa,
    iterationCap: 3,
    feature: 'tr-qa-agent',
    validateFinalOutput: validateQaResult,
  };

  const previousNote = previousQa
    ? `\n\nThis is a refinement round. Your previous critique:\n${JSON.stringify({ verdict: previousQa.verdict, concerns: previousQa.concerns, suggested_changes: previousQa.suggested_changes }, null, 2)}\n\nThe Detection Engineer has revised. Re-evaluate the CURRENT artefact below independently.`
    : '';

  const initialMessage =
    `Candidate detection to critique:\n${JSON.stringify(detection, null, 2)}${previousNote}\n\n` +
    `Critique this detection per the query-qa knowledge pack. Output the JSON verdict.`;

  const outcome = await runAgentLoop<QaResult>(cfg, toolCtx, runCtx, initialMessage);

  if (!outcome.output) {
    // Loop failed; emit a deterministic fallback verdict so the actor-critic
    // loop can still proceed. Mark as fail with a single concern naming the
    // failure reason — the user gets honest information that QA didn't run.
    return {
      verdict: 'fail',
      coverage_quality: 'loose',
      concerns: [`QA agent did not produce a valid verdict (${outcome.reason ?? 'unknown'})`],
      suggested_changes: [],
      duplicate_of: null,
      iteration_history: [],
      iteration_count: 0,
    };
  }
  return outcome.output;
}
