// supabase/functions/threat-research-orchestrator/lib/agents/research-agent.ts
//
// Research Agent — threat-intel researcher.
//
// Reads the web (Tavily) + reasons over its own knowledge to build a complete
// intel picture, then breaks the threat down into Attack Behaviours grouped
// by MITRE ATT&CK Tactic. The output (Knowledge Bundle + behaviours[]) feeds
// BOTH the Attack Researcher (per-behaviour deep dive) and the Detection
// Engineer.

import { runAgentLoop, AgentLoopConfig } from "./agent-loop.ts";
import { ToolContext, TOOLS_FOR } from "../tools/index.ts";
import { RunContext, emit } from "../events.ts";
import { loadKnowledgePack } from "../skills-loader.ts";
import type { AttackBehaviour, MitreTacticName, ResearchSubject } from "../types.ts";

const SYSTEM = `You are the Research Agent for Threat Research, working as a senior threat-intel researcher.

Your job has TWO outputs in a single JSON response:
  1. A Subject Brief — complete, sourced intelligence picture
  2. A list of Attack Behaviours organised by MITRE ATT&CK Tactic

You MUST use Tavily web_search to read primary sources (vendor research, MITRE,
news, threat-intel blogs). Do not invent facts; cite every claim.

You will see the threat-classification knowledge pack below. Follow it.

OUTPUT (single JSON object, no fences, no commentary outside the JSON):
{
  "subject": {
    "classification": "cve" | "group" | "campaign" | "technique" | "concept",
    "subject": "canonical name",
    "brief": "1 paragraph synthesis",
    "intel_summary": {
      "actor": "...", "infrastructure": "...", "victimology": "...",
      "timing": "...", "tooling": "...", "attribution": "..."
    },
    "citations": [{ "source": "...", "url": "...", "claim": "..." }]
  },
  "behaviours": [
    {
      "title": "Short noun phrase",
      "narrative_description": "What the adversary does, in 2-3 sentences",
      "tactic": "<one of MITRE ATT&CK Tactics, lowercase-with-hyphens>",
      "mitre_technique_ids": ["T1059.001", ...],
      "data_sources": ["Sysmon EID 1", ...],
      "artefacts": ["...", ...],
      "citations": [{ "source": "...", "url": "...", "claim": "..." }]
    },
    ...
  ]
}

Aim for 4-10 behaviours covering the realistic kill chain for this threat.
Cover all relevant MITRE ATT&CK Tactics from initial-access through impact
(skip a tactic only if it genuinely doesn't apply to this threat).
Each behaviour MUST have at least one citation.`;

const VALID_TACTICS: ReadonlySet<MitreTacticName> = new Set<MitreTacticName>([
  'reconnaissance','resource-development','initial-access',
  'execution','persistence','privilege-escalation',
  'defense-evasion','credential-access','discovery',
  'lateral-movement','collection','command-and-control',
  'exfiltration','impact',
]);

export interface ResearchAgentOutput {
  subject: ResearchSubject;
  behaviours: AttackBehaviour[];
}

function validate(text: string): ResearchAgentOutput | null {
  try {
    const t = text.trim();
    const start = t.indexOf('{');
    if (start < 0) return null;
    const json = JSON.parse(t.slice(start, t.lastIndexOf('}') + 1));
    const s = json.subject;
    if (!s || typeof s.classification !== 'string') return null;
    if (typeof s.subject !== 'string' || !s.subject) return null;
    if (typeof s.brief !== 'string' || !s.brief) return null;

    const subject: ResearchSubject = {
      classification: s.classification,
      subject: s.subject,
      brief: s.brief,
      intel_summary: s.intel_summary ?? {},
      citations: Array.isArray(s.citations)
        ? s.citations.map((c: any) => ({
            source: String(c?.source ?? ''),
            url: String(c?.url ?? ''),
            claim: String(c?.claim ?? ''),
          }))
        : [],
    };

    if (!Array.isArray(json.behaviours) || json.behaviours.length === 0) return null;
    const behaviours: AttackBehaviour[] = [];
    for (const b of json.behaviours) {
      if (!b?.title || !b?.narrative_description) continue;
      if (!VALID_TACTICS.has(b.tactic)) continue;
      behaviours.push({
        id: `b${behaviours.length + 1}`,
        title: String(b.title),
        narrative_description: String(b.narrative_description),
        tactic: b.tactic,
        mitre_technique_ids: Array.isArray(b.mitre_technique_ids) ? b.mitre_technique_ids.map(String) : [],
        data_sources: Array.isArray(b.data_sources) ? b.data_sources.map(String) : [],
        artefacts: Array.isArray(b.artefacts) ? b.artefacts.map(String) : [],
        citations: Array.isArray(b.citations)
          ? b.citations.map((c: any) => ({
              source: String(c?.source ?? ''),
              url: String(c?.url ?? ''),
              claim: String(c?.claim ?? ''),
            }))
          : [],
        deep_dive: null,
        library_match: null,
        opportunities: [],
      });
      if (behaviours.length >= 12) break;
    }
    if (behaviours.length === 0) return null;
    return { subject, behaviours };
  } catch {
    return null;
  }
}

export async function runResearchAgent(
  toolCtx: ToolContext,
  runCtx: RunContext,
  inputText: string,
): Promise<ResearchAgentOutput | null> {
  const pack = await loadKnowledgePack('threat-classification');
  const cfg: AgentLoopConfig<ResearchAgentOutput> = {
    agent: 'research',
    model: 'claude-haiku-4-5',
    systemInstruction: SYSTEM,
    knowledgePack: pack,
    toolDeclarations: TOOLS_FOR.research,
    iterationCap: 10,
    feature: 'tr-research-agent',
    validateFinalOutput: validate,
  };

  const initialMessage =
    `User input:\n"""\n${inputText}\n"""\n\n` +
    `Build the complete Subject Brief and list of Attack Behaviours grouped by MITRE ATT&CK Tactic.\n` +
    `Use web_search liberally — you are the only agent that does the broad sweep.`;

  const outcome = await runAgentLoop<ResearchAgentOutput>(cfg, toolCtx, runCtx, initialMessage);

  if (outcome.output) {
    for (const b of outcome.output.behaviours) {
      await emit(runCtx, {
        agent: 'research',
        event_type: 'behaviour_created',
        message: `${b.tactic} · ${b.title}`,
        payload: { id: b.id, tactic: b.tactic, mitre_technique_ids: b.mitre_technique_ids },
      });
    }
  }
  return outcome.output;
}
