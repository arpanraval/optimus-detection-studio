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
import { ROLE_CONFIG } from "../llm/model-routing.ts";
import { selectWorkflowPrompt, workflowLabel } from "./research/workflows.ts";
import type {
  AttackBehaviour,
  MitreTacticName,
  ResearchInputClassification,
  ResearchSubject,
  TacticSummary,
} from "../types.ts";

const ALL_TACTICS: readonly MitreTacticName[] = [
  'reconnaissance','resource-development','initial-access',
  'execution','persistence','privilege-escalation',
  'defense-evasion','credential-access','discovery',
  'lateral-movement','collection','command-and-control',
  'exfiltration','impact',
];

// SYSTEM_PROMPT is now selected per-classification via selectWorkflowPrompt()
// in research/workflows.ts. The previous single-prompt approach forced every
// input through a 14-tactic walk, which over-enumerated CVEs and techniques
// (see workflows.ts header for the failure modes). Existing test code that
// imports SYSTEM_PROMPT for snapshot/contract testing should be updated to
// import { selectWorkflowPrompt } from './research/workflows.ts'.

const TACTIC_ALIASES: Record<string, MitreTacticName> = {
  'reconnaissance': 'reconnaissance',
  'resource-development': 'resource-development',
  'resource development': 'resource-development',
  'initial-access': 'initial-access',
  'initial access': 'initial-access',
  'execution': 'execution',
  'persistence': 'persistence',
  'privilege-escalation': 'privilege-escalation',
  'privilege escalation': 'privilege-escalation',
  'defense-evasion': 'defense-evasion',
  'defense evasion': 'defense-evasion',
  'defence-evasion': 'defense-evasion',
  'defence evasion': 'defense-evasion',
  'credential-access': 'credential-access',
  'credential access': 'credential-access',
  'discovery': 'discovery',
  'lateral-movement': 'lateral-movement',
  'lateral movement': 'lateral-movement',
  'collection': 'collection',
  'command-and-control': 'command-and-control',
  'command and control': 'command-and-control',
  'command-control': 'command-and-control',
  'c2': 'command-and-control',
  'exfiltration': 'exfiltration',
  'impact': 'impact',
};

function normalizeTactic(value: unknown): MitreTacticName | null {
  const values = Array.isArray(value) ? value : [value];
  for (const raw of values) {
    if (typeof raw !== 'string') continue;
    const direct = normalizeTacticText(raw);
    if (direct) return direct;

    // Technique workflows often have two valid tactic contexts. Accept
    // composite values like "Persistence / Privilege Escalation" instead of
    // discarding the whole behaviour and forcing another model pass.
    for (const part of raw.split(/\s*(?:\/|,|;|\||&|\band\b|\bor\b)\s*/i)) {
      const tactic = normalizeTacticText(part);
      if (tactic) return tactic;
    }

    const cleaned = cleanTacticText(raw);
    for (const [alias, tactic] of Object.entries(TACTIC_ALIASES)) {
      if (new RegExp(`(^|\\s)${escapeRegex(alias)}(\\s|$)`).test(cleaned)) {
        return tactic;
      }
    }
  }
  return null;
}

function normalizeTacticText(value: string): MitreTacticName | null {
  const cleaned = cleanTacticText(value);
  return TACTIC_ALIASES[cleaned] ?? TACTIC_ALIASES[cleaned.replace(/\s+/g, '-')] ?? null;
}

function cleanTacticText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^ta\d{4}\s*[-:]\s*/i, '')
    .replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function stringArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value
        .map(v => typeof v === 'string' ? v.trim() : String(v ?? '').trim())
        .filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) return [value.trim()];
  }
  return [];
}

function firstArray(...values: unknown[]): any[] | null {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return null;
}

function skippedBehaviourSample(b: any): string {
  if (!b || typeof b !== 'object') return `non-object:${typeof b}`;
  const tacticValue = b.tactic ?? b.tactics ?? b.tactic_name ?? b.tactic_names ?? b.mitre_tactic ?? b.mitre_tactics;
  return `keys=${Object.keys(b).slice(0, 12).join(',')}; tactic=${JSON.stringify(tacticValue ?? null)?.slice(0, 120)}`;
}

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
  // Subject-side variant tolerance mirrors the behaviour-side approach:
  // accept common synonyms the model emits when its prompt phrasing varies.
  // Classification/subject/brief are required; if even with fallbacks none
  // resolve, that's a structural failure worth retrying.
  const s = json.subject ?? json.knowledge_bundle ?? json.intel ?? {};
  const classification = firstString(s.classification, s.category, s.kind, s.type);
  const subjectName = firstString(
    s.subject, s.canonical_name, s.canonicalName, s.name, s.identifier, s.title,
  );
  const brief = firstString(s.brief, s.summary, s.synopsis, s.description, s.overview);
  if (!classification) return { ok: false, reason: 'subject.classification missing — required string' };
  if (!subjectName)    return { ok: false, reason: 'subject.subject missing — required canonical name' };
  if (!brief)          return { ok: false, reason: 'subject.brief missing — required short synthesis' };

  const intelRaw = s.intel_summary ?? s.intelSummary ?? s.intel ?? {};
  const citationsRaw = Array.isArray(s.citations) ? s.citations
                     : Array.isArray(s.sources)    ? s.sources
                     : Array.isArray(s.references) ? s.references
                     : [];

  const subject: ResearchSubject = {
    classification,
    subject: subjectName,
    brief,
    intel_summary: intelRaw,
    citations: citationsRaw.map((c: any) => ({
      source: String(c?.source ?? c?.title ?? c?.name ?? ''),
      url: String(c?.url ?? c?.link ?? ''),
      claim: String(c?.claim ?? c?.summary ?? c?.description ?? ''),
    })),
  };

  // ── Tactic summary (must cover all 14) ──────────────────────────────
  const rawTacticSummary = firstArray(
    json.tactic_summary,
    json.tacticSummary,
    json.tactics,
    json.mitre_tactics,
  );
  const seenTactics = new Set<string>();
  const tactic_summary: TacticSummary[] = [];
  for (const ts of rawTacticSummary ?? []) {
    if (!ts) continue;
    const tactic = normalizeTactic(ts.tactic ?? ts.name ?? ts.tactic_name ?? ts.mitre_tactic);
    if (!tactic) continue;
    if (seenTactics.has(tactic)) continue;
    seenTactics.add(tactic);
    tactic_summary.push({
      tactic,
      observed: ts.observed === true,
      rationale: typeof ts.rationale === 'string' ? ts.rationale : '',
    });
  }
  // Missing tactic_summary rows are repaired after behaviours are parsed.

  // ── Behaviours (unbounded, capped at HALLUCINATION_CEILING) ─────────
  const rawBehaviours = firstArray(
    json.behaviours,
    json.behaviors,
    json.attack_behaviours,
    json.attack_behaviors,
    json.implementation_variants,
    json.variants,
  );
  if (!rawBehaviours)
    return { ok: false, reason: 'missing "behaviours" array' };

  const behaviours: AttackBehaviour[] = [];
  let skipped = 0;
  const skippedSamples: string[] = [];
  for (const b of rawBehaviours) {
    if (behaviours.length >= HALLUCINATION_CEILING) break;
    const title = firstString(
      b?.title,
      b?.name,
      b?.behaviour,
      b?.behavior,
      b?.action,
      b?.technique,
      b?.variant,
    );
    const narrative = firstString(
      b?.narrative_description,
      b?.description,
      b?.narrative,
      b?.summary,
      b?.implementation,
      b?.attack_description,
      b?.details,
    );
    const tactic = normalizeTactic(
      b?.tactic ?? b?.tactics ?? b?.tactic_name ?? b?.tactic_names ?? b?.mitre_tactic ?? b?.mitre_tactics,
    );
    if (!title || !narrative || !tactic) {
      skipped++;
      if (skippedSamples.length < 3) skippedSamples.push(skippedBehaviourSample(b));
      continue;
    }
    behaviours.push({
      id: `b${behaviours.length + 1}`,
      title,
      narrative_description: narrative,
      tactic,
      mitre_technique_ids: stringArray(
        b?.mitre_technique_ids,
        b?.mitre_technique_id,
        b?.mitre_ids,
        b?.technique_ids,
        b?.mitre_techniques,
      ),
      unverified_mitre_ids: [], // populated by post-step
      tactic_inconsistent_mitre_ids: [], // populated by post-step
      data_sources: stringArray(b?.data_sources, b?.data_source, b?.telemetry, b?.log_sources),
      artefacts: stringArray(b?.artefacts, b?.artifacts, b?.observables, b?.observable_chain),
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
        ? `all ${skipped} behaviours had missing title/narrative or invalid tactic. Samples: ${skippedSamples.join(' | ')}`
        : 'behaviours array is empty — at least one observed Tactic must have behaviours',
    };
  }

  // Per-Tactic completeness: previously a HARD validation failure when a
  // tactic was marked observed:true with zero behaviours. That killed
  // sessions in real-world cases where the model's reasoning was correct
  // (e.g. for a CVE, resource-development IS technically observed because
  // the attacker crafted the email — but the CVE workflow prompt also
  // forbids enumerating it as a behaviour without a public source). The
  // model got caught between the two and retried the same output 3× until
  // the reaper killed the session. Trace from 2026-05-19 CVE-2026-42897.
  //
  // New behaviour: auto-flip observed:true → observed:false when no
  // matching behaviour exists, appending a note to the rationale so the
  // mutation is visible to the user in the canvas. Output is preserved,
  // session proceeds. The behaviour-count invariant (at least one
  // observed Tactic must have behaviours) below still applies — that one
  // genuinely is a structural failure.
  const behaviourTactics = new Set(behaviours.map(b => b.tactic));
  for (const tactic of ALL_TACTICS) {
    if (seenTactics.has(tactic)) continue;
    const observed = behaviourTactics.has(tactic);
    tactic_summary.push({
      tactic,
      observed,
      rationale: observed
        ? '[auto-filled: valid behaviour entries were emitted for this tactic, but tactic_summary was missing this row.]'
        : '[auto-filled: no validated behaviour entries were emitted for this tactic.]',
    });
    seenTactics.add(tactic);
  }

  const autoFlipped: string[] = [];
  for (const ts of tactic_summary) {
    if (!ts.observed && behaviourTactics.has(ts.tactic)) {
      ts.observed = true;
      ts.rationale = (ts.rationale ? ts.rationale + ' ' : '') +
        '[auto-flipped to observed:true: validated behaviour entries exist for this tactic.]';
    }
    if (ts.observed && !behaviourTactics.has(ts.tactic)) {
      ts.observed = false;
      ts.rationale = (ts.rationale ? ts.rationale + ' ' : '') +
        '[auto-flipped to observed:false: model marked this tactic observed but emitted no substantiated behaviour entry under it. ' +
        'Either the tactic genuinely doesn\'t apply here, or the model lacked a sourced behaviour to cite. Treat as not-observed for downstream planning.]';
      autoFlipped.push(ts.tactic);
    }
  }

  // After auto-flip, at least one tactic must still be observed AND have
  // a behaviour. If everything got flipped, we have behaviours that belong
  // to no observed-true tactic — structurally broken.
  const finalObserved = new Set(tactic_summary.filter(t => t.observed).map(t => t.tactic));
  const orphanBehaviours = behaviours.filter(b => !finalObserved.has(b.tactic));
  if (orphanBehaviours.length > 0) {
    return {
      ok: false,
      reason: `${orphanBehaviours.length} behaviour(s) are tagged with tactics that are all observed:false after auto-flip. ` +
        `Behaviour tactics: ${Array.from(new Set(orphanBehaviours.map(b => b.tactic))).join(', ')}. ` +
        `Either mark those tactics observed:true with rationale, or remove the behaviour entries.`,
    };
  }

  return { ok: true, value: { subject, tactic_summary, behaviours } };
}

export async function runResearchAgent(
  toolCtx: ToolContext,
  runCtx: RunContext,
  inputText: string,
  classification: ResearchInputClassification = 'concept',
): Promise<ResearchAgentOutput | null> {
  const pack = await loadKnowledgePack('threat-classification');
  const role = ROLE_CONFIG.RESEARCH;
  // System prompt is selected per classification. CVE / technique / concept
  // each load a different workflow lane (see research/workflows.ts); only
  // actor and campaign run the original 14-tactic walk. Default fallback
  // when classifier failed is 'concept' (set by preflight, also defaults
  // here for legacy invocations).
  const systemPrompt = selectWorkflowPrompt(classification);
  const cfg: AgentLoopConfig<ResearchAgentOutput> = {
    agent: 'research',
    // Sonnet 4.6: knowledge cutoff Aug 2025 covers current-year threats that
    // Haiku 4.5 (Feb 2025 cutoff) misses. The previous "Sonnet exceeds wall
    // budget" comment was stale — the queue architecture gives each call its
    // own fresh edge worker, and ROLE_CONFIG.RESEARCH.timeoutMs is sized
    // (240s) to fit a typical workflow's ~8-12K-token output at Sonnet's
    // per-token rate.
    model: role.model,
    systemInstruction: systemPrompt,
    knowledgePack: pack,
    toolDeclarations: TOOLS_FOR.research,
    iterationCap: 5,
    feature: 'tr-research-agent',
    validateFinalOutput: validate,
    timeoutMs: role.timeoutMs,
    maxTokens: role.maxTokens,
    maxValidationRetries: 0,
    contextPayload: { classification },
  };

  const initialMessage =
    `User input:\n<untrusted_input>\n${inputText}\n</untrusted_input>\n\n` +
    `Workflow lane: ${workflowLabel(classification)}.\n` +
    `Classification (from preflight, authoritative): ${classification}.\n\n` +
    `Produce the JSON output per the workflow rules in your system prompt. ` +
    `Use web_search to ground claims; you're the only agent doing broad sourcing.`;

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
