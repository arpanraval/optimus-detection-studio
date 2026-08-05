// supabase/functions/threat-research-orchestrator/lib/llm/model-routing.ts
//
// Single source of truth for which Claude model each agent uses.
//
// Routing rationale (July 2026):
//
//   Opus 5 — for the two reasoning surfaces where output quality has the
//              largest downstream multiplier:
//                • PLANNER  — Opportunity Planner (PR2): dedupes N behaviours
//                             into M canonical opportunities. One bad call
//                             produces M duplicate detections.
//                • ENGINEER — Detection Engineer initial-gen + revision. The
//                             detection IS the user-facing artefact; this is
//                             where claude.ai's quality advantage lives.
//
//   Sonnet 5 — for the broader reasoning surfaces where Opus's incremental
//              quality doesn't pay for itself, and as the explicit replacement
//              for all former Haiku routes:
//                • RESEARCH    — Research Agent (workflow-specific intel sweep)
//                • ATTACK      — Attack Researcher (per-behaviour deep dive)
//                • QA          — Detection critique
//                • EXTRACTION  — classification, summary, low-risk extraction
//                                (no Haiku for this either — quality floor stays
//                                at Sonnet across the board)
//
// Both routed models support tool use, strict tool use, and prompt caching.
// The previous comment in research-agent.ts
// claiming "Sonnet's slower per-token rate exceeded the per-call wall budget"
// is stale. The queue gives each PHASE JOB a fresh worker; one agent loop can
// still make several model/tool calls inside that worker. Role limits therefore
// remain subordinate to agent-loop.ts's whole-job safe deadline.

export type ResearchAgentRole =
  | 'PLANNER'      // Detection Opportunity Planner (PR2)
  | 'ENGINEER'     // Detection Engineer (initial generation + actor-critic revision)
  | 'RESEARCH'     // Research Agent (workflow-specific intel sweep)
  | 'ATTACK'       // Attack Researcher (per-behaviour offensive deep dive)
  | 'QA'           // Query QA critique
  | 'EXTRACTION';  // Classification, summary, low-risk extraction

export const MODEL: Record<ResearchAgentRole, string> = {
  PLANNER:    'claude-opus-5',
  ENGINEER:   'claude-opus-5',
  RESEARCH:   'claude-sonnet-5',
  ATTACK:     'claude-sonnet-5',
  QA:         'claude-sonnet-5',
  EXTRACTION: 'claude-sonnet-5',
} as const;

/** Per-role configuration knobs the agent-loop forwards into AnthropicCallParams.
 *
 *  - `timeoutMs`: per-call wall-clock ceiling. Opus calls emit larger
 *    outputs more slowly than Sonnet; PLANNER and ENGINEER get extra
 *    headroom. QA calls are short by design so we keep the lower default.
 *  - `maxTokens`: response cap. The Research Agent's 14-tactic walk and the
 *    Detection Engineer's full opportunity wrapper both legitimately use
 *    8K-12K output tokens; QA verdicts and revision turns are <2K.
 */
export interface RoleConfig {
  model: string;
  timeoutMs: number;
  maxTokens: number;
}

export const ROLE_CONFIG: Record<ResearchAgentRole, RoleConfig> = {
  PLANNER:    { model: MODEL.PLANNER,    timeoutMs: 300_000, maxTokens: 16_384 },
  // ENGINEER: raised from 240s to 300s. Opus wrapper-generation calls
  // can spend 200-280s on a complex multi-opportunity behaviour (8-12K
  // output tokens at ~40-50 tps). At 240s the call timed out close to
  // the model's natural completion, costing a full iteration retry that
  // started from scratch — net cost was higher than the extra minute of
  // ceiling. 300s gives Opus room to finish without sacrificing the hard
  // bound that protects the per-job worker lifetime.
  ENGINEER:   { model: MODEL.ENGINEER,   timeoutMs: 300_000, maxTokens: 16_384 },
  // Research runs after tool calls inside the same Supabase Edge invocation.
  // Claude logs from 2026-05-21 showed ~8K-token final synthesis calls taking
  // ~132s and ending as Anthropic 499 client_disconnected when the hosted edge
  // worker hit its wall-clock ceiling. Keep this compact; later agents do the
  // deeper per-behaviour expansion.
  RESEARCH:   { model: MODEL.RESEARCH,   timeoutMs: 110_000, maxTokens:  6_144 },
  ATTACK:     { model: MODEL.ATTACK,     timeoutMs: 180_000, maxTokens:  8_192 },
  QA:         { model: MODEL.QA,         timeoutMs: 120_000, maxTokens:  4_096 },
  EXTRACTION: { model: MODEL.EXTRACTION, timeoutMs:  90_000, maxTokens:  4_096 },
};
