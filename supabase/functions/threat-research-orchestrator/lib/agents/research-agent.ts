// supabase/functions/threat-research-orchestrator/lib/agents/research-agent.ts
//
// Research Agent — threat-intel researcher.
//
// Reads the web (Tavily) + reasons over its own knowledge to build a complete
// intel picture, then breaks the threat down into Attack Behaviours grouped
// by MITRE ATT&CK Tactic. The output (Knowledge Bundle + behaviours[]) feeds
// BOTH the Attack Researcher (per-behaviour deep dive) and the Detection
// Engineer.

import { runAgentLoop, AgentLoopConfig, ValidationResult } from "./agent-loop.ts";
import { ToolContext, TOOLS_FOR } from "../tools/index.ts";
import { RunContext, emit } from "../events.ts";
import { loadKnowledgePack } from "../skills-loader.ts";
import type { AttackBehaviour, MitreTacticName, ResearchSubject, TacticSummary } from "../types.ts";

const ALL_TACTICS: readonly MitreTacticName[] = [
  'reconnaissance','resource-development','initial-access',
  'execution','persistence','privilege-escalation',
  'defense-evasion','credential-access','discovery',
  'lateral-movement','collection','command-and-control',
  'exfiltration','impact',
];

export const SYSTEM_PROMPT = `You are the Research Agent for Threat Research.

YOUR JOB: produce a SYSTEMATIC walk of MITRE ATT&CK against this threat. For
every one of the 14 Tactics, decide whether the threat operates in that
Tactic AND say why. For Tactics where it does, enumerate EVERY distinct
attacker behaviour you can substantiate from sources or established intel.

This is not a "pick the top 5" exercise. The output's job is exhaustive
coverage organised by Tactic, in the style of a DFIR Report kill-chain
breakdown — every step the adversary takes, anchored to observable signals.

OPERATING DISCIPLINE (strict):
  1. Make AT MOST 3 tool calls TOTAL across web_search and mitre_search.
  2. Combine search angles into rich queries — Tavily returns 8 hits each.
  3. After your last tool call, your VERY NEXT response is the JSON output.
     No more tool calls, no commentary outside the JSON.

SCOPE DISCIPLINE (apply to every candidate behaviour):

Enumerate by SPECIFICITY, not exhaustiveness. For each candidate behaviour
ask: is this specific to THIS threat (unique mechanism, named artefact,
attribution-bound TTP, post-exploitation step with specific indicators)?
Or is it a generic OS-level action common to any similar threat?

Specific → include. Generic → exclude, UNLESS it forms part of a unique
correlation chain whose correlation itself is threat-specific (e.g.
cmd.exe from w3wp.exe within 5 min of an inbound HTTP POST to /owa/auth/
— generic ingredients, webshell-class-specific correlation; include as
ONE correlated behaviour, not the steps in isolation).

Generic post-exploit excluded by this filter is acknowledged in ONE
summary line on subject.brief, not enumerated as separate behaviours.
Behaviour count falls out of the actual specificity surface — a simple
CVE may produce 4–6, ProxyLogon-class chains may produce 15+, both
correct. The filter still preserves the per-tactic walk: every tactic
gets its observed/not-observed verdict; only behaviour entries within
observed tactics are gated by specificity.

OUTPUT SHAPE (single JSON object, no markdown fences):
{
  "subject": {
    "classification": "cve" | "group" | "campaign" | "technique" | "concept",
    "subject": "canonical name",
    "brief": "1 paragraph synthesis (3-5 sentences)",
    "intel_summary": {
      "actor": "...", "infrastructure": "...", "victimology": "...",
      "timing": "...", "tooling": "...", "attribution": "..."
    },
    "citations": [{ "source": "...", "url": "...", "claim": "..." }]
  },
  "tactic_summary": [
    // EXACTLY 14 entries, one per Tactic, in this order:
    //   reconnaissance, resource-development, initial-access, execution,
    //   persistence, privilege-escalation, defense-evasion, credential-access,
    //   discovery, lateral-movement, collection, command-and-control,
    //   exfiltration, impact
    {
      "tactic": "<tactic-name>",
      "observed": true | false,
      "rationale": "1-2 sentence reason. For false: explain why this threat
                    doesn't operate here. For true: a 1-line summary of what
                    the threat does in this Tactic."
    },
    ...
  ],
  "behaviours": [
    // ONE entry per distinct attacker behaviour. NO COUNT CAP. Two behaviours
    // CAN share the same tactic and the same primary mitre_technique_id —
    // they are distinct if their observable artefacts or tooling differ.
    // Example: "LSASS dump via PowerShell Get-Process" and "LSASS dump via
    // comsvcs.dll MiniDump" are two behaviours under credential-access:T1003.
    //
    // The order should mirror tactic_summary: emit all initial-access
    // behaviours, then execution, then persistence, etc.
    {
      "title": "Short noun phrase identifying the attacker action",
      "narrative_description": "2-3 sentences on what the attacker does",
      "tactic": "<one of the 14 lowercase-with-hyphens names>",
      "mitre_technique_ids": ["T1059.001", "T1218.005"],
      "tooling_or_vector": ["powershell", "compromised_websites", "..."],
      "data_sources": ["Sysmon EID 1", "DeviceProcessEvents", "..."],
      "artefacts": ["RunMRU registry key", "explorer.exe → powershell.exe parent chain", "..."],
      "citations": [{ "source": "...", "url": "...", "claim": "..." }],
      // OPTIONAL: set to true when the behaviour is backed by general training
      // knowledge rather than a specific source. Mutually exclusive with a
      // populated citations[] in spirit (you can do both, but unsourced=true
      // alone is the signal "I am NOT pointing at a source for this").
      "unsourced": false
    },
    ...
  ]
}

QUALITY BAR:
- Every \`observed: true\` Tactic must have at least one behaviour entry.
- Every behaviour must EITHER have at least one citation OR set
  \`"unsourced": true\` explicitly. The unsourced flag means the claim comes
  from your training rather than a verifiable source. Don't claim training-
  backing without flagging — an unsourced claim that looks sourced is
  indistinguishable from a hallucination downstream.
- Behaviours under the same Tactic and technique are fine if their
  observables or tooling differ. Don't collapse them.
- For a Tactic you've decided is \`observed: false\`, set behaviours[] to
  exclude it — don't emit empty placeholder behaviours.`;

const VALID_TACTICS: ReadonlySet<MitreTacticName> = new Set<MitreTacticName>(ALL_TACTICS);

/** Hallucination ceiling. The model should NEVER need this many distinct
 *  attacker behaviours; if we hit it, something has gone wrong upstream.
 *  Way above any realistic threat (ClickFix is ~8-12, Volt Typhoon is ~15-20). */
const HALLUCINATION_CEILING = 30;

export interface ResearchAgentOutput {
  subject: ResearchSubject;
  tactic_summary: TacticSummary[];   // exactly 14 entries
  behaviours: AttackBehaviour[];     // unbounded (cap at HALLUCINATION_CEILING)
}

export function validate(text: string): ValidationResult<ResearchAgentOutput> {
  let json: any;
  try {
    const t = text.trim();
    const start = t.indexOf('{');
    if (start < 0) return { ok: false, reason: 'output contains no JSON object — emit a single { ... } block' };
    json = JSON.parse(t.slice(start, t.lastIndexOf('}') + 1));
  } catch (e) {
    return { ok: false, reason: `JSON parse failed: ${(e as Error).message.slice(0, 200)}` };
  }

  // ── Subject ─────────────────────────────────────────────────────────
  const s = json.subject;
  if (!s) return { ok: false, reason: 'missing top-level "subject" object' };
  if (typeof s.classification !== 'string')
    return { ok: false, reason: 'subject.classification missing or not a string' };
  if (typeof s.subject !== 'string' || !s.subject)
    return { ok: false, reason: 'subject.subject missing or empty — must be the canonical name' };
  if (typeof s.brief !== 'string' || !s.brief)
    return { ok: false, reason: 'subject.brief missing or empty — needs a 3-5 sentence synthesis' };

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

  // ── Tactic summary (must cover all 14) ──────────────────────────────
  if (!Array.isArray(json.tactic_summary))
    return { ok: false, reason: 'missing "tactic_summary" array' };

  const seenTactics = new Set<string>();
  const tactic_summary: TacticSummary[] = [];
  for (const ts of json.tactic_summary) {
    if (!ts || typeof ts.tactic !== 'string') continue;
    if (!VALID_TACTICS.has(ts.tactic)) continue;
    if (seenTactics.has(ts.tactic)) continue;
    seenTactics.add(ts.tactic);
    tactic_summary.push({
      tactic: ts.tactic,
      observed: ts.observed === true,
      rationale: typeof ts.rationale === 'string' ? ts.rationale : '',
    });
  }
  if (tactic_summary.length !== 14) {
    const missing = ALL_TACTICS.filter(t => !seenTactics.has(t));
    return {
      ok: false,
      reason: `tactic_summary has ${tactic_summary.length}/14 valid entries. ` +
        `Missing or invalid: ${missing.join(', ')}. Emit one row per Tactic.`,
    };
  }

  // ── Behaviours (unbounded, capped at HALLUCINATION_CEILING) ─────────
  if (!Array.isArray(json.behaviours))
    return { ok: false, reason: 'missing "behaviours" array' };

  const behaviours: AttackBehaviour[] = [];
  let skipped = 0;
  for (const b of json.behaviours) {
    if (behaviours.length >= HALLUCINATION_CEILING) break;
    if (!b?.title || !b?.narrative_description) { skipped++; continue; }
    if (!VALID_TACTICS.has(b.tactic)) { skipped++; continue; }
    behaviours.push({
      id: `b${behaviours.length + 1}`,
      title: String(b.title),
      narrative_description: String(b.narrative_description),
      tactic: b.tactic,
      mitre_technique_ids: Array.isArray(b.mitre_technique_ids) ? b.mitre_technique_ids.map(String) : [],
      unverified_mitre_ids: [], // populated by post-step
      tactic_inconsistent_mitre_ids: [], // populated by post-step
      data_sources: Array.isArray(b.data_sources) ? b.data_sources.map(String) : [],
      artefacts: Array.isArray(b.artefacts) ? b.artefacts.map(String) : [],
      citations: Array.isArray(b.citations)
        ? b.citations.map((c: any) => ({
            source: String(c?.source ?? ''),
            url: String(c?.url ?? ''),
            claim: String(c?.claim ?? ''),
          }))
        : [],
      unsourced: b.unsourced === true,
      deep_dive: null,
      library_match: null,
      detectability: null,
      detectability_rationale: null,
      artefacts_required: [],
      opportunities: [],
    });
  }
  if (behaviours.length === 0) {
    return {
      ok: false,
      reason: skipped > 0
        ? `all ${skipped} behaviours had missing title/narrative or invalid tactic`
        : 'behaviours array is empty — at least one observed Tactic must have behaviours',
    };
  }

  // Per-Tactic completeness invariant: every tactic_summary entry with
  // observed:true MUST have at least one behaviour entry under it. Without
  // this check, the model can declare collection observed:true and emit
  // zero behaviours — silently dropping the entire tactic from downstream
  // detection generation.
  const behaviourTactics = new Set(behaviours.map(b => b.tactic));
  const observedButEmpty = tactic_summary
    .filter(ts => ts.observed && !behaviourTactics.has(ts.tactic))
    .map(ts => ts.tactic);
  if (observedButEmpty.length > 0) {
    return {
      ok: false,
      reason: `tactics marked observed:true with zero behaviours: ${observedButEmpty.join(', ')}. ` +
        `For each of those tactics either (a) emit at least one behaviour entry, ` +
        `or (b) flip observed to false and explain why in rationale.`,
    };
  }

  return { ok: true, value: { subject, tactic_summary, behaviours } };
}

export async function runResearchAgent(
  toolCtx: ToolContext,
  runCtx: RunContext,
  inputText: string,
): Promise<ResearchAgentOutput | null> {
  const pack = await loadKnowledgePack('threat-classification');
  const cfg: AgentLoopConfig<ResearchAgentOutput> = {
    agent: 'research',
    // Haiku is the right model here for now: the agent emits the entire
    // 14-tactic walk in a single response (~10-12K output tokens). Sonnet's
    // slower per-token rate exceeded the per-call wall budget on this output
    // size during testing (workers stalled mid-synthesis at iter 3). The
    // structural fix is to fan-out Research per tactic so each call stays
    // small enough for any model — that's a separate piece of work tracked
    // outside this file. Until that exists, do not switch this back to
    // Sonnet without a strict output cap; the failure mode is silent
    // truncation or timeout, not a graceful degrade.
    model: 'claude-haiku-4-5',
    systemInstruction: SYSTEM_PROMPT,
    knowledgePack: pack,
    toolDeclarations: TOOLS_FOR.research,
    iterationCap: 5,
    feature: 'tr-research-agent',
    validateFinalOutput: validate,
  };

  const initialMessage =
    `User input:\n"""\n${inputText}\n"""\n\n` +
    `Walk all 14 MITRE ATT&CK Tactics and produce the Subject Brief plus the ` +
    `tactic_summary plus every distinct attacker behaviour you can substantiate. ` +
    `Use web_search liberally — you're the only agent that does the broad sweep.`;

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
