// supabase/functions/threat-research-orchestrator/lib/agents/research-agent.ts
//
// Research Agent — classifies the input and produces a Subject Brief.
// Tools: web_search, mitre_search.
// Knowledge Pack: threat-classification.

import { runAgentLoop, AgentLoopConfig } from "./agent-loop.ts";
import { ToolContext, TOOLS_FOR } from "../tools/index.ts";
import { RunContext } from "../events.ts";
import { loadKnowledgePack } from "../skills-loader.ts";
import type { ResearchSubject } from "../types.ts";

const SYSTEM = `You are the Research Agent for the Threat Research feature.
Your job: classify the user's input and produce a Subject Brief.
You MUST use the threat-classification knowledge pack to choose a classification.
You MUST cite at least one authoritative source per claim in the brief.
Use web_search and mitre_search sparingly — at most 4 model calls total.
When you have enough information, output a SINGLE JSON object matching the schema in the knowledge pack (no markdown fences, no commentary outside the JSON).`;

function validateResearchSubject(text: string): ResearchSubject | null {
  try {
    const t = text.trim();
    const start = t.indexOf('{');
    if (start < 0) return null;
    const json = JSON.parse(t.slice(start, t.lastIndexOf('}') + 1));
    if (typeof json.classification !== 'string') return null;
    if (typeof json.subject !== 'string' || !json.subject.trim()) return null;
    if (typeof json.brief !== 'string' || !json.brief.trim()) return null;
    if (!Array.isArray(json.scope_hints)) return null;
    if (!Array.isArray(json.citations)) return null;
    return {
      classification: json.classification,
      subject: json.subject,
      brief: json.brief,
      scope_hints: json.scope_hints.map(String),
      citations: json.citations.map((c: any) => ({
        source: String(c?.source ?? ''),
        url: String(c?.url ?? ''),
        claim: String(c?.claim ?? ''),
      })),
    };
  } catch {
    return null;
  }
}

export async function runResearchAgent(
  toolCtx: ToolContext,
  runCtx: RunContext,
  inputText: string,
): Promise<ResearchSubject | null> {
  const pack = await loadKnowledgePack('threat-classification');
  const cfg: AgentLoopConfig<ResearchSubject> = {
    agent: 'research',
    model: 'gemini-3-flash-preview',
    systemInstruction: `${SYSTEM}\n\n---\n\n${pack}`,
    toolDeclarations: TOOLS_FOR.research,
    iterationCap: 4,
    feature: 'tr-research-agent',
    validateFinalOutput: validateResearchSubject,
  };

  const initialMessage = `Input to research:\n"""\n${inputText}\n"""\n\nClassify this input and produce the Subject Brief in the required JSON shape.`;
  const outcome = await runAgentLoop<ResearchSubject>(cfg, toolCtx, runCtx, initialMessage);
  return outcome.output;
}
