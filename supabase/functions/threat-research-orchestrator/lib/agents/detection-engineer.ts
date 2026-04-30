// supabase/functions/threat-research-orchestrator/lib/agents/detection-engineer.ts
//
// Detection Engineering Agent — for each behaviour, produces 1-3 detection
// opportunities with one detection each. Then drives the actor-critic loop
// with the QA Agent: write -> critique -> revise (max 2 revisions).
// Tools: web_search, mitre_search, library_search, feasibility_lookup.
// Knowledge Pack: detection-engineering.

import { runAgentLoop, AgentLoopConfig } from "./agent-loop.ts";
import { ToolContext, TOOLS_FOR } from "../tools/index.ts";
import { RunContext, emit } from "../events.ts";
import { loadKnowledgePack } from "../skills-loader.ts";
import { critiqueDetection } from "./qa-agent.ts";
import type {
  AttackBehaviour, DetectionOpportunity, GeneratedDetection,
  QaResult, QaIteration, ResearchQueryLanguage,
} from "../types.ts";

const VALID_SEVERITY = new Set(['Critical','High','Medium','Low','Informational']);
const VALID_TYPE     = new Set(['Detection','Hunting']);
const VALID_PHASES = new Set([
  'reconnaissance','resource-development','initial-access',
  'execution','persistence','privilege-escalation',
  'defense-evasion','credential-access','discovery',
  'lateral-movement','collection','command-and-control',
  'exfiltration','impact',
]);
const VALID_FEASIBILITY = new Set(['covered','partial','uncovered']);

function buildSystemPrompt(language: ResearchQueryLanguage, knowledgePack: string): string {
  return `You are the Detection Engineering Agent for the Threat Research feature.
Your job: for the given Attack Behaviour, produce 1-3 Detection Opportunities, each containing exactly one Detection.
The user's primary SIEM language is ${language}. Write all queries in ${language}.
You MUST follow the detection-engineering knowledge pack.
For each technique you target, call feasibility_lookup BEFORE writing the query.
Call library_search to anchor your style and avoid duplicates.
Every detection's query MUST include inline citation comments per the knowledge pack.
Optimise for selectivity — a noisy detection is worse than no detection.
≤ 12 model calls per behaviour subtree.
When done, output a SINGLE JSON ARRAY of opportunities matching the schema in the knowledge pack (no fences, no commentary outside JSON).

---

${knowledgePack}`;
}

function validateOpportunities(text: string, language: ResearchQueryLanguage): DetectionOpportunity[] | null {
  try {
    const t = text.trim();
    const start = t.indexOf('[');
    if (start < 0) return null;
    const json = JSON.parse(t.slice(start, t.lastIndexOf(']') + 1));
    if (!Array.isArray(json) || json.length === 0) return null;
    const out: DetectionOpportunity[] = [];
    for (const opp of json) {
      const det = opp?.detection;
      if (!opp?.title || !opp?.description || !det) return null;
      if (!det.name || !det.query) return null;
      if (!VALID_SEVERITY.has(det.suggested_severity)) return null;
      if (!VALID_TYPE.has(det.suggested_detection_type)) return null;
      if (!VALID_PHASES.has(det.kill_chain_phase)) return null;
      if (!VALID_FEASIBILITY.has(det.feasibility)) return null;

      out.push({
        id: String(opp.id ?? `o${out.length + 1}`),
        title: String(opp.title),
        description: String(opp.description),
        detection: {
          id: String(det.id ?? `d${out.length + 1}`),
          name: String(det.name),
          description: String(det.description ?? ''),
          query_language: language,                       // hard-pin: agent doesn't get to switch language
          query: String(det.query),
          mitre_technique_ids: Array.isArray(det.mitre_technique_ids) ? det.mitre_technique_ids.map(String) : [],
          kill_chain_phase: det.kill_chain_phase,
          suggested_severity: det.suggested_severity,
          suggested_detection_type: det.suggested_detection_type,
          feasibility: det.feasibility,
          feasibility_notes: String(det.feasibility_notes ?? ''),
          citations: Array.isArray(det.citations)
            ? det.citations.map((c: any) => ({ source: String(c?.source ?? ''), url: String(c?.url ?? ''), claim: String(c?.claim ?? '') }))
            : [],
          covers_behaviour_ids: Array.isArray(det.covers_behaviour_ids) ? det.covers_behaviour_ids.map(String) : [],
          qa: null,
          saved_detection_id: null,
          archived: false,
        },
      });
      if (out.length >= 3) break;
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * Pure-logic actor-critic driver. Exported for unit testing without spinning
 * up the full agent loop.
 */
export async function driveActorCritic(
  initialDetection: GeneratedDetection,
  writeFn: (prevDetection: GeneratedDetection, qa: QaResult) => Promise<GeneratedDetection>,
  qaFn:    (detection: GeneratedDetection, previousQa?: QaResult) => Promise<QaResult>,
): Promise<GeneratedDetection> {
  let detection = initialDetection;
  let qa: QaResult | undefined;
  const history: QaIteration[] = [];

  for (let iter = 0; iter <= 2; iter++) {
    qa = await qaFn(detection, qa);
    history.push({
      verdict: qa.verdict,
      concerns: qa.concerns,
      diff_from_previous: null,
    });
    if (qa.verdict === 'pass') break;
    if (iter >= 2) break;
    detection = await writeFn(detection, qa);
  }

  return {
    ...detection,
    qa: { ...qa!, iteration_history: history, iteration_count: history.length },
  };
}

/**
 * Ask the Detection Engineer to revise a detection in response to QA concerns.
 * One model call (no tool use needed for revision); we constrain to the
 * existing artefact + concerns and validate the revised output.
 */
async function reviseDetection(
  toolCtx: ToolContext,
  runCtx: RunContext,
  prev: GeneratedDetection,
  qa: QaResult,
  language: ResearchQueryLanguage,
): Promise<GeneratedDetection> {
  const pack = await loadKnowledgePack('detection-engineering');
  const cfg: AgentLoopConfig<DetectionOpportunity[]> = {
    agent: 'detection-engineer',
    model: 'claude-opus-4-6',
    systemInstruction: buildSystemPrompt(language, pack),
    toolDeclarations: TOOLS_FOR.detectionEngineer,
    iterationCap: 3,
    feature: 'tr-detection-engineer',
    validateFinalOutput: (text) => validateOpportunities(text, language),
  };

  const initialMessage =
    `Existing detection (revising):\n${JSON.stringify(prev, null, 2)}\n\n` +
    `QA verdict: ${qa.verdict}\nQA concerns:\n${qa.concerns.map(c => `- ${c}`).join('\n')}\n` +
    `QA suggestions:\n${qa.suggested_changes.map(s => `- ${s}`).join('\n')}\n\n` +
    `Revise this detection to address the concerns. Output the same opportunity-with-detection JSON shape (single-element array is fine).`;

  const outcome = await runAgentLoop<DetectionOpportunity[]>(cfg, toolCtx, runCtx, initialMessage);
  if (outcome.output && outcome.output.length > 0) {
    return outcome.output[0].detection;
  }
  // Couldn't revise — return the previous detection unchanged so QA can issue
  // its final verdict on it.
  return prev;
}

/**
 * Top-level: for one behaviour, produce its opportunities (with detections),
 * then run actor-critic per detection.
 */
export async function runDetectionEngineerForBehaviour(
  toolCtx: ToolContext,
  runCtx: RunContext,
  behaviour: AttackBehaviour,
  language: ResearchQueryLanguage,
): Promise<DetectionOpportunity[]> {
  const pack = await loadKnowledgePack('detection-engineering');
  const cfg: AgentLoopConfig<DetectionOpportunity[]> = {
    agent: 'detection-engineer',
    model: 'claude-opus-4-6',
    systemInstruction: buildSystemPrompt(language, pack),
    toolDeclarations: TOOLS_FOR.detectionEngineer,
    iterationCap: 12,
    feature: 'tr-detection-engineer',
    validateFinalOutput: (text) => validateOpportunities(text, language),
  };

  const initialMessage =
    `Behaviour:\n${JSON.stringify(behaviour, null, 2)}\n\n` +
    `Produce 1-3 detection opportunities. The user's primary SIEM language is ${language}. ` +
    `Each opportunity must contain exactly one detection.`;

  const outcome = await runAgentLoop<DetectionOpportunity[]>(cfg, toolCtx, runCtx, initialMessage);
  const opportunities = outcome.output ?? [];

  for (const opp of opportunities) {
    await emit(runCtx, {
      agent: 'detection-engineer',
      event_type: 'opportunity_created',
      message: opp.title,
      payload: { id: opp.id, behaviour_id: behaviour.id },
    });
    await emit(runCtx, {
      agent: 'detection-engineer',
      event_type: 'detection_generated',
      message: opp.detection.name,
      payload: { id: opp.detection.id, opportunity_id: opp.id, severity: opp.detection.suggested_severity },
    });

    // Actor-critic refinement.
    await emit(runCtx, { agent: 'qa', event_type: 'qa_refinement_started', message: `qa for ${opp.detection.id}` });
    opp.detection = await driveActorCritic(
      opp.detection,
      (prev, qa) => reviseDetection(toolCtx, runCtx, prev, qa, language),
      (det, prevQa) => critiqueDetection(toolCtx, runCtx, det, prevQa),
    );
    await emit(runCtx, {
      agent: 'qa',
      event_type: 'qa_refinement_completed',
      message: `qa done for ${opp.detection.id}`,
      payload: { verdict: opp.detection.qa?.verdict, iterations: opp.detection.qa?.iteration_count },
    });
    await emit(runCtx, {
      agent: 'qa',
      event_type: 'qa_verdict',
      message: `${opp.detection.qa?.verdict ?? 'unknown'} (${opp.detection.qa?.coverage_quality ?? 'unknown'})`,
      payload: { detection_id: opp.detection.id, qa: opp.detection.qa },
    });
  }

  return opportunities;
}
