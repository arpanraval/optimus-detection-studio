// supabase/functions/threat-research-orchestrator/lib/agents/detection-engineer.ts
//
// Detection Engineer — runs once per behaviour.
//
// 1. LIBRARY-FIRST CHECK: before generating anything, calls library_search
//    against the user's existing detection library. If a hit clears the
//    LIBRARY_MATCH_THRESHOLD, the behaviour is marked `library_match` and
//    NO new detection is generated. The leaf renders with sage-green glow.
//
// 2. Otherwise: produces 1-3 detection opportunities, each containing one
//    detection in the user's resolved SIEM language. Each detection is then
//    sent to the QA agent via the actor-critic loop (max 2 revisions).

import { runAgentLoop, AgentLoopConfig } from "./agent-loop.ts";
import { ToolContext, TOOLS_FOR } from "../tools/index.ts";
import { RunContext, emit } from "../events.ts";
import { loadKnowledgePack } from "../skills-loader.ts";
import { handleLibrarySearch } from "../tools/library-search.ts";
import { critiqueDetection } from "./qa-agent.ts";
import type {
  AttackBehaviour, AttackResearchDeepDive, DetectionOpportunity,
  GeneratedDetection, LibraryMatch, MitreTacticName, QaIteration, QaResult,
  ResearchQueryLanguage, ResearchSubject,
} from "../types.ts";

const LIBRARY_MATCH_THRESHOLD = 0.75;

const VALID_SEVERITY = new Set(['Critical','High','Medium','Low','Informational']);
const VALID_TYPE     = new Set(['Detection','Hunting']);
const VALID_TACTICS = new Set<MitreTacticName>([
  'reconnaissance','resource-development','initial-access',
  'execution','persistence','privilege-escalation',
  'defense-evasion','credential-access','discovery',
  'lateral-movement','collection','command-and-control',
  'exfiltration','impact',
]);
const VALID_FEASIBILITY = new Set(['covered','partial','uncovered']);

function buildSystemPrompt(language: ResearchQueryLanguage): string {
  return `You are the Detection Engineer for ONE Attack Behaviour. You receive:
  • the Research Agent's Knowledge Bundle (intel context)
  • the Attack Researcher's offensive deep-dive on this specific behaviour
  • the user's resolved SIEM language: ${language}

Your job: produce 1-3 Detection Opportunities for this behaviour, each with
ONE Detection (a runnable ${language} query). Use the deep-dive's
"controls_bypassed" and "success_signal" sections to ground the query.

Use feasibility_lookup BEFORE writing each query. Mark each detection's
feasibility from the user's environment profile.

Use web_search sparingly — only for query-language idioms or PoCs.
Use mitre_search for technique → data-source mapping if needed.

Inline citations (// Source: …) belong inside the query itself.

OUTPUT (single JSON array, no fences):
[
  {
    "title": "Short noun phrase",
    "description": "1-2 sentences",
    "detection": {
      "name": "Concrete detection name",
      "description": "What this catches and what it does NOT filter",
      "query_language": "${language}",
      "query": "// inline citations\\n<query body>",
      "mitre_technique_ids": ["T..."],
      "tactic": "<MITRE tactic, lowercase>",
      "suggested_severity": "Critical|High|Medium|Low|Informational",
      "suggested_detection_type": "Detection|Hunting",
      "feasibility": "covered|partial|uncovered",
      "feasibility_notes": "...",
      "citations": [{ "source": "...", "url": "...", "claim": "..." }],
      "covers_behaviour_ids": ["..."]
    }
  }
]`;
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
      if (!opp?.title || !opp?.description || !det) continue;
      if (!det.name || !det.query) continue;
      if (!VALID_SEVERITY.has(det.suggested_severity)) continue;
      if (!VALID_TYPE.has(det.suggested_detection_type)) continue;
      if (!VALID_TACTICS.has(det.tactic)) continue;
      if (!VALID_FEASIBILITY.has(det.feasibility)) continue;

      out.push({
        id: `o${out.length + 1}`,
        title: String(opp.title),
        description: String(opp.description),
        detection: {
          id: `d${out.length + 1}`,
          name: String(det.name),
          description: String(det.description ?? ''),
          query_language: language,
          query: String(det.query),
          mitre_technique_ids: Array.isArray(det.mitre_technique_ids) ? det.mitre_technique_ids.map(String) : [],
          tactic: det.tactic,
          suggested_severity: det.suggested_severity,
          suggested_detection_type: det.suggested_detection_type,
          feasibility: det.feasibility,
          feasibility_notes: String(det.feasibility_notes ?? ''),
          citations: Array.isArray(det.citations)
            ? det.citations.map((c: any) => ({
                source: String(c?.source ?? ''),
                url: String(c?.url ?? ''),
                claim: String(c?.claim ?? ''),
              }))
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

// ────────────────────────────────────────────────────────────────────────────
// Actor-critic loop (Engineer ↔ QA, max 2 revisions)
// ────────────────────────────────────────────────────────────────────────────

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
    history.push({ verdict: qa.verdict, concerns: qa.concerns, diff_from_previous: null });
    if (qa.verdict === 'pass') break;
    if (iter >= 2) break;
    detection = await writeFn(detection, qa);
  }

  return {
    ...detection,
    qa: { ...qa!, iteration_history: history, iteration_count: history.length },
  };
}

async function reviseDetection(
  toolCtx: ToolContext,
  runCtx: RunContext,
  prev: GeneratedDetection,
  qa: QaResult,
  language: ResearchQueryLanguage,
  pack: string,
): Promise<GeneratedDetection> {
  const cfg: AgentLoopConfig<DetectionOpportunity[]> = {
    agent: 'detection-engineer',
    model: 'claude-opus-4-7',
    systemInstruction: buildSystemPrompt(language),
    knowledgePack: pack,
    toolDeclarations: TOOLS_FOR.detectionEngineer,
    iterationCap: 4,
    feature: 'tr-detection-engineer',
    validateFinalOutput: (text) => validateOpportunities(text, language),
  };
  const initialMessage =
    `REVISION ROUND. Existing detection:\n${JSON.stringify(prev, null, 2)}\n\n` +
    `QA verdict: ${qa.verdict}\nQA concerns:\n${qa.concerns.map(c => `- ${c}`).join('\n')}\n` +
    `QA suggested changes:\n${qa.suggested_changes.map(s => `- ${s}`).join('\n')}\n\n` +
    `Revise this detection to address the concerns. Output the same JSON shape (single-element array).`;
  const outcome = await runAgentLoop<DetectionOpportunity[]>(cfg, toolCtx, runCtx, initialMessage);
  if (outcome.output && outcome.output.length > 0) return outcome.output[0].detection;
  return prev;
}

// ────────────────────────────────────────────────────────────────────────────
// Top-level: handle one behaviour
// ────────────────────────────────────────────────────────────────────────────

/** Decide whether the user's library already covers this behaviour. Returns
 *  the strongest match if score >= LIBRARY_MATCH_THRESHOLD, else null. */
async function checkLibraryCoverage(
  toolCtx: ToolContext,
  behaviour: AttackBehaviour,
): Promise<LibraryMatch | null> {
  const query = `${behaviour.title}. ${behaviour.narrative_description}`;
  const { hits } = await handleLibrarySearch(toolCtx.supabase, { query, limit: 5 });
  if (!hits.length) return null;
  const top = hits[0];
  if (top.combined_score < LIBRARY_MATCH_THRESHOLD) return null;
  return {
    existing_detection_id: top.id,
    name: top.name,
    query_language: top.query_language,
    combined_score: top.combined_score,
    semantic_score: top.semantic_score,
    keyword_score: top.keyword_score,
  };
}

export async function runDetectionEngineerForBehaviour(
  toolCtx: ToolContext,
  runCtx: RunContext,
  subject: ResearchSubject,
  behaviour: AttackBehaviour,
  language: ResearchQueryLanguage,
): Promise<{ library_match: LibraryMatch | null; opportunities: DetectionOpportunity[] }> {
  // 1. Library-first.
  const libMatch = await checkLibraryCoverage(toolCtx, behaviour);
  if (libMatch) {
    await emit(runCtx, {
      agent: 'detection-engineer',
      event_type: 'library_match_found',
      message: `${behaviour.title} → already covered by "${libMatch.name}"`,
      payload: { behaviour_id: behaviour.id, match: libMatch },
    });
    return { library_match: libMatch, opportunities: [] };
  }

  // 2. Generate.
  const pack = await loadKnowledgePack('detection-engineering');
  const cfg: AgentLoopConfig<DetectionOpportunity[]> = {
    agent: 'detection-engineer',
    model: 'claude-opus-4-7',
    systemInstruction: buildSystemPrompt(language),
    knowledgePack: pack,
    toolDeclarations: TOOLS_FOR.detectionEngineer,
    iterationCap: 8,
    feature: 'tr-detection-engineer',
    validateFinalOutput: (text) => validateOpportunities(text, language),
  };

  const initialMessage =
    `Subject context (Knowledge Bundle):\n${JSON.stringify({
      subject: subject.subject,
      brief: subject.brief,
      intel_summary: subject.intel_summary,
    }, null, 2)}\n\n` +
    `BEHAVIOUR (only this one):\n${JSON.stringify({
      title: behaviour.title,
      narrative_description: behaviour.narrative_description,
      tactic: behaviour.tactic,
      mitre_technique_ids: behaviour.mitre_technique_ids,
      data_sources: behaviour.data_sources,
    }, null, 2)}\n\n` +
    `OFFENSIVE DEEP-DIVE (from Attack Researcher):\n${JSON.stringify(behaviour.deep_dive ?? {}, null, 2)}\n\n` +
    `Produce 1-3 detection opportunities for this behaviour. SIEM language: ${language}.`;

  const outcome = await runAgentLoop<DetectionOpportunity[]>(cfg, toolCtx, runCtx, initialMessage);
  const opportunities = outcome.output ?? [];

  // 3. Actor-critic per detection.
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

    await emit(runCtx, { agent: 'qa', event_type: 'qa_refinement_started', message: `qa for ${opp.detection.id}` });
    opp.detection = await driveActorCritic(
      opp.detection,
      (prev, qa) => reviseDetection(toolCtx, runCtx, prev, qa, language, pack),
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

  return { library_match: null, opportunities };
}
