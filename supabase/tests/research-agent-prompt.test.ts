// Layer 4: Research Agent prompt — single-call shape validation.
//
// Run with:
//   ANTHROPIC_API_KEY=sk-... bun run supabase/tests/research-agent-prompt.test.ts
//
// Makes ONE Anthropic call (no tools, no agent loop) with the new walk-every-
// tactic prompt and a canned ClickFix description. Verifies the model can
// produce the new output schema. ~$0.01 expected.
//
// What this proves: the prompt is unambiguous enough that Haiku responds in
// the right shape. What it does NOT prove: TTP coverage quality (that needs
// tools / web search and is gated behind Layer 5/6).

// @ts-expect-error — install Deno.env shim for the adapter
globalThis.Deno = { env: { get: (k: string) => process.env[k] } };

const { callAnthropicRaw } = await import(
  "../functions/threat-research-orchestrator/lib/llm/anthropic-raw.ts"
);
const { validate } = await import(
  "../functions/threat-research-orchestrator/lib/agents/research-agent.ts"
);
// PR2: SYSTEM_PROMPT was replaced with per-classification workflows.
// ClickFix is a "concept" — bounded landscape, not a 14-tactic walk.
const { selectWorkflowPrompt } = await import(
  "../functions/threat-research-orchestrator/lib/agents/research/workflows.ts"
);
const SYSTEM_PROMPT = selectWorkflowPrompt('concept');

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY not set; aborting (no token spend wanted by accident).");
  process.exit(2);
}

const CLICKFIX_INPUT = `ClickFix campaign — fake CAPTCHA prompts that paste a PowerShell payload into the Run dialog and run an infostealer.`;

const userMessage =
  `User input:\n"""\n${CLICKFIX_INPUT}\n"""\n\n` +
  `Walk all 14 MITRE ATT&CK Tactics. For each, decide observed/not-observed with rationale. ` +
  `For observed Tactics, enumerate every distinct attacker behaviour. ` +
  `You have no tool access in this validation run — rely on your training knowledge of ClickFix. ` +
  `Emit the JSON output now.`;

console.log("Calling Anthropic (haiku, temperature=0, no tools)…");
const t0 = Date.now();
const res = await callAnthropicRaw(apiKey, {
  model: "claude-haiku-4-5",
  systemInstruction: SYSTEM_PROMPT,
  messages: [{ role: "user", content: userMessage }],
  temperature: 0,
  maxTokens: 8192,
});
const elapsed = Date.now() - t0;
console.log(`  done in ${elapsed}ms, ${res.usage.inputTokens}↑ ${res.usage.outputTokens}↓ tokens\n`);

// ─── assertions ──────────────────────────────────────────────────────────
const failures: string[] = [];
function assert(cond: unknown, label: string) {
  if (!cond) { failures.push(`✗ ${label}`); console.log(`✗ ${label}`); }
  else { console.log(`✓ ${label}`); }
}

const parsed = validate(res.text);
assert(parsed !== null, "validate() accepts the model output");
if (parsed === null) {
  console.log("\n--- model output (truncated) ---");
  console.log(res.text.slice(0, 2000));
  process.exit(1);
}

assert(parsed.subject.classification === "campaign", `subject.classification === "campaign" (got ${parsed.subject.classification})`);
assert(parsed.subject.subject.toLowerCase().includes("clickfix"), "subject.subject mentions ClickFix");
assert(parsed.subject.brief.length > 50, "subject.brief has substance (>50 chars)");

assert(parsed.tactic_summary.length === 14, `exactly 14 tactic_summary entries (got ${parsed.tactic_summary.length})`);
const observedTactics = parsed.tactic_summary.filter(t => t.observed).map(t => t.tactic);
assert(observedTactics.length >= 3, `at least 3 Tactics observed (got ${observedTactics.length}: ${observedTactics.join(", ")})`);
assert(observedTactics.includes("initial-access"), "ClickFix has initial-access");
assert(observedTactics.includes("execution"), "ClickFix has execution");

// Every Tactic should have a non-empty rationale (especially the false ones,
// to capture WHY a Tactic doesn't apply — that's the intelligence value).
const emptyRationales = parsed.tactic_summary.filter(t => !t.rationale || t.rationale.length < 10);
assert(emptyRationales.length === 0, `every tactic has a rationale ≥10 chars (${emptyRationales.length} too short)`);

assert(parsed.behaviours.length >= 5, `at least 5 distinct behaviours (got ${parsed.behaviours.length})`);
assert(parsed.behaviours.length <= 30, `no more than 30 behaviours (hallucination ceiling, got ${parsed.behaviours.length})`);

// Every behaviour must be tagged with an observed Tactic
const observedSet = new Set(observedTactics);
const orphans = parsed.behaviours.filter(b => !observedSet.has(b.tactic));
assert(orphans.length === 0, `every behaviour's tactic appears in observed tactic_summary (${orphans.length} orphans)`);

// Critical: behaviours under same Tactic+technique can coexist (no auto-dedup)
console.log(`\nBehaviour breakdown by Tactic:`);
const byTactic = new Map<string, number>();
for (const b of parsed.behaviours) {
  byTactic.set(b.tactic, (byTactic.get(b.tactic) ?? 0) + 1);
}
for (const [tactic, count] of byTactic) console.log(`  ${tactic}: ${count}`);

// Print one sample behaviour for eyeballing
console.log(`\nSample behaviour:`);
console.log(JSON.stringify(parsed.behaviours[0], null, 2).slice(0, 1200));

console.log(`\n${failures.length === 0 ? "ALL ASSERTIONS PASSED" : `${failures.length} FAILURE(S)`}`);
process.exit(failures.length === 0 ? 0 : 1);
