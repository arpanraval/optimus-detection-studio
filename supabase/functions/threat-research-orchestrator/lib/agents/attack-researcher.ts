// supabase/functions/threat-research-orchestrator/lib/agents/attack-researcher.ts
//
// Attack Researcher — offensive-security researcher.
//
// RUNS ONCE PER BEHAVIOUR (fan-out from Phase 2). Each invocation receives
// ONE attack behaviour from the Research Agent's output and reads the open web
// to produce a deep offensive-side analysis: how the attack works, what
// controls it bypasses, why an attacker does it, what they gain, what success
// looks like, and notable variants. This deep-dive is then handed to the
// Detection Engineer alongside the Knowledge Bundle so detections are written
// with full offensive context.
//
// Tools: web_search ONLY. No library lookups, no MITRE structured queries —
// those distract the agent from primary-source synthesis (the agent already
// has MITRE knowledge from training).

import { runAgentLoop, AgentLoopConfig } from "./agent-loop.ts";
import { ToolContext, TOOLS_FOR } from "../tools/index.ts";
import { RunContext } from "../events.ts";
import { loadKnowledgePack } from "../skills-loader.ts";
import type { AttackBehaviour, AttackResearchDeepDive, ResearchSubject } from "../types.ts";

const SYSTEM = `You are the Attack Researcher for one specific Attack Behaviour identified by the Research Agent.

Your single job: produce an offensive-security deep dive on THIS behaviour.
Use Tavily web_search to read primary sources (vendor research, threat-intel
blogs, security conference talks, atomic-red-team write-ups). Synthesise from
sources + your own knowledge of offensive tradecraft.

Answer these specifically:
  • how_it_works: step-by-step, concrete, technical
  • controls_bypassed: which security controls fail to catch this and WHY
  • attacker_motivation: why the attacker chooses this technique
  • attacker_gain: what the attacker walks away with
  • success_signal: what a successful execution looks like (defender's view)
  • variants: notable evasions, known sub-patterns, second-stage choices

Cite every claim. No invented facts.

OUTPUT (single JSON object, no fences):
{
  "how_it_works": "...",
  "controls_bypassed": ["control 1 — why it fails", "..."],
  "attacker_motivation": "...",
  "attacker_gain": "...",
  "success_signal": "...",
  "variants": ["..."],
  "citations": [{ "source": "...", "url": "...", "claim": "..." }]
}`;

function validate(text: string): AttackResearchDeepDive | null {
  try {
    const t = text.trim();
    const start = t.indexOf('{');
    if (start < 0) return null;
    const json = JSON.parse(t.slice(start, t.lastIndexOf('}') + 1));
    if (typeof json.how_it_works !== 'string' || !json.how_it_works) return null;
    if (typeof json.attacker_motivation !== 'string') return null;
    if (typeof json.success_signal !== 'string') return null;
    return {
      how_it_works: json.how_it_works,
      controls_bypassed: Array.isArray(json.controls_bypassed) ? json.controls_bypassed.map(String) : [],
      attacker_motivation: json.attacker_motivation,
      attacker_gain: String(json.attacker_gain ?? ''),
      success_signal: json.success_signal,
      variants: Array.isArray(json.variants) ? json.variants.map(String) : [],
      citations: Array.isArray(json.citations)
        ? json.citations.map((c: any) => ({
            source: String(c?.source ?? ''),
            url: String(c?.url ?? ''),
            claim: String(c?.claim ?? ''),
          }))
        : [],
    };
  } catch {
    return null;
  }
}

export async function runAttackResearcherForBehaviour(
  toolCtx: ToolContext,
  runCtx: RunContext,
  subject: ResearchSubject,
  behaviour: AttackBehaviour,
): Promise<AttackResearchDeepDive | null> {
  const pack = await loadKnowledgePack('adversary-research-methodology');
  const cfg: AgentLoopConfig<AttackResearchDeepDive> = {
    agent: 'attack-researcher',
    model: 'claude-sonnet-4-6',
    systemInstruction: SYSTEM,
    knowledgePack: pack,
    toolDeclarations: TOOLS_FOR.attackResearcher,
    iterationCap: 6,
    feature: 'tr-attack-researcher',
    validateFinalOutput: validate,
  };

  const initialMessage =
    `Subject context:\n${JSON.stringify({
      subject: subject.subject,
      brief: subject.brief,
      intel_summary: subject.intel_summary,
    }, null, 2)}\n\n` +
    `BEHAVIOUR TO DEEP-DIVE (only this one):\n${JSON.stringify({
      title: behaviour.title,
      tactic: behaviour.tactic,
      narrative_description: behaviour.narrative_description,
      mitre_technique_ids: behaviour.mitre_technique_ids,
      data_sources: behaviour.data_sources,
    }, null, 2)}\n\n` +
    `Use web_search to research how this attack actually works. Output the JSON deep-dive.`;

  const outcome = await runAgentLoop<AttackResearchDeepDive>(cfg, toolCtx, runCtx, initialMessage);
  return outcome.output;
}
