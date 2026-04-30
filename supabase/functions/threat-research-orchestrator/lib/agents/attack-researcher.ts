// supabase/functions/threat-research-orchestrator/lib/agents/attack-researcher.ts
//
// Attack Researcher Agent — produces 3-12 Attack Behaviours mapping how
// the adversary actually operates.
// Tools: web_search, mitre_search, library_search.
// Knowledge Pack: adversary-research-methodology.

import { runAgentLoop, AgentLoopConfig } from "./agent-loop.ts";
import { ToolContext, TOOLS_FOR } from "../tools/index.ts";
import { RunContext, emit } from "../events.ts";
import { loadKnowledgePack } from "../skills-loader.ts";
import type { AttackBehaviour, KillChainTactic, ResearchSubject } from "../types.ts";

const SYSTEM = `You are the Attack Researcher Agent for the Threat Research feature.
Your job: given the Subject Brief, produce a quality-driven list of Attack Behaviours.
You MUST follow the adversary-research-methodology knowledge pack.
You MUST cite at least one authoritative source per behaviour.
Use library_search to check whether the user already covers each behaviour, and populate library_already_covers_ids[] from those results.
Aim for 3-12 behaviours. Quality > quantity. Hard ceiling: 12.
≤ 8 model calls. ≤ 6 tool calls.
When done, output a SINGLE JSON ARRAY matching the schema in the knowledge pack (no fences, no commentary outside JSON).`;

const VALID_PHASES: ReadonlySet<string> = new Set([
  'reconnaissance','resource-development','initial-access',
  'execution','persistence','privilege-escalation',
  'defense-evasion','credential-access','discovery',
  'lateral-movement','collection','command-and-control',
  'exfiltration','impact',
]);

function validateBehaviours(text: string): AttackBehaviour[] | null {
  try {
    const t = text.trim();
    const start = t.indexOf('[');
    if (start < 0) return null;
    const json = JSON.parse(t.slice(start, t.lastIndexOf(']') + 1));
    if (!Array.isArray(json) || json.length === 0) return null;
    const out: AttackBehaviour[] = [];
    for (const item of json) {
      if (!item?.title || !item?.narrative_description) return null;
      if (!VALID_PHASES.has(String(item.kill_chain_phase))) return null;
      if (!Array.isArray(item.citations) || item.citations.length === 0) return null;
      out.push({
        id: String(item.id ?? `b${out.length + 1}`),
        title: String(item.title),
        narrative_description: String(item.narrative_description),
        kill_chain_phase: item.kill_chain_phase as KillChainTactic,
        mitre_technique_ids: Array.isArray(item.mitre_technique_ids) ? item.mitre_technique_ids.map(String) : [],
        data_sources: Array.isArray(item.data_sources) ? item.data_sources.map(String) : [],
        artefacts: Array.isArray(item.artefacts) ? item.artefacts.map(String) : [],
        citations: item.citations.map((c: any) => ({ source: String(c?.source ?? ''), url: String(c?.url ?? ''), claim: String(c?.claim ?? '') })),
        library_already_covers_ids: Array.isArray(item.library_already_covers_ids) ? item.library_already_covers_ids.map(String) : [],
        opportunities: [],
      });
      if (out.length >= 12) break;
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function runAttackResearcher(
  toolCtx: ToolContext,
  runCtx: RunContext,
  subject: ResearchSubject,
): Promise<AttackBehaviour[]> {
  const pack = await loadKnowledgePack('adversary-research-methodology');
  const cfg: AgentLoopConfig<AttackBehaviour[]> = {
    agent: 'attack-researcher',
    model: 'claude-sonnet-4-6',
    systemInstruction: `${SYSTEM}\n\n---\n\n${pack}`,
    toolDeclarations: TOOLS_FOR.attackResearcher,
    iterationCap: 8,
    feature: 'tr-attack-researcher',
    validateFinalOutput: validateBehaviours,
  };

  const initialMessage =
    `Subject Brief:\n${JSON.stringify(subject, null, 2)}\n\n` +
    `Map how this threat actually operates. Produce 3-12 Attack Behaviours per the knowledge pack's quality bar.`;

  const outcome = await runAgentLoop<AttackBehaviour[]>(cfg, toolCtx, runCtx, initialMessage);
  const behaviours = outcome.output ?? [];

  for (const b of behaviours) {
    await emit(runCtx, {
      agent: 'attack-researcher',
      event_type: 'behaviour_created',
      message: b.title,
      payload: { id: b.id, kill_chain_phase: b.kill_chain_phase, mitre_technique_ids: b.mitre_technique_ids },
    });
  }

  return behaviours;
}
