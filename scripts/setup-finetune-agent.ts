/**
 * One-time provisioning for the Detection Finetuning agent.
 * Run once:  ANTHROPIC_API_KEY=... bun scripts/setup-finetune-agent.ts
 * Then set the printed IDs as Supabase Edge Function secrets:
 *   FINETUNE_AGENT_ID, FINETUNE_ENVIRONMENT_ID
 */

const API_BASE = 'https://api.anthropic.com';
const BETA = 'managed-agents-2026-04-01';

const SYSTEM_PROMPT = `You are a detection-engineering specialist. You finetune SIEM detection queries to cut false positives without losing real threat coverage.

You are given one Microsoft Defender XDR detection, written in KQL, that fired on too many events during a backtest. Investigate why, then return a ladder of progressively-refined queries.

## Tools
- run_hunting_query — runs any KQL query against the same Defender Advanced Hunting tenant and returns the results. Use it both to investigate and to MEASURE refinements. You have a budget of about 12 queries — spend them deliberately. When several queries are independent, call run_hunting_query several times in the SAME turn; they run in parallel and keep the run fast.
- submit_refinement_ladder — your final deliverable. Call it exactly once, at the end.

## Method
1. Investigate. Run summarize/count queries to find what is generating the volume — top processes, accounts, devices, command lines, paths, signers, whatever the data shows. Let the evidence tell you. Do not assume; do not rely on generic reputation.
2. Hypothesize which slices are benign noise and which could be real activity.
3. Measure. For every candidate refinement, RUN it with run_hunting_query and read the actual hit count. Never estimate a reduction — measure it against the baseline.
4. Build a ladder of 2 or 3 refinements, ordered conservative to aggressive:
   - Level 1: removes only noise you are confident is benign. Smallest, safest reduction.
   - Level 2: balanced — removes well-supported noise with a modest, stated tradeoff.
   - Level 3 (optional): aggressive — the largest reduction, with an explicit coverage tradeoff the user accepts knowingly.
   Each level is a complete standalone query, more aggressive than the level before it.

## Rules
- Never return a single maximally-aggressive query. The user chooses their own risk tolerance from the ladder.
- Every refinement must preserve the detection's core intent. In coverage_tradeoff, state plainly what real activity each level could miss and why that is acceptable there.
- Always bound queries with summarize, count, or take. Never request unbounded raw rows.
- Stay within the backtest window you are given.
- Base every number on a query you actually ran.
- Be efficient — the user is waiting on you. Batch independent queries into one turn; a few well-chosen summarize queries beat many narrow ones. You do not need to spend the whole budget. Aim to finish within a few minutes.
- Keep going until you have a fully measured ladder, then call submit_refinement_ladder once and stop.`;

const RUN_HUNTING_QUERY_TOOL = {
  type: 'custom',
  name: 'run_hunting_query',
  description:
    'Run a KQL query against the connected Microsoft Defender XDR Advanced Hunting tenant and get the results back. Use this to investigate what is generating detection noise and to MEASURE the effect of a candidate refinement by running it and reading the real hit count. Always bound your queries: use summarize, count, or take — never return unbounded raw rows. The backtest window is enforced server-side; you cannot query beyond it. When you have several independent queries, call this tool several times in the SAME turn — they run in parallel and keep the run fast.',
  input_schema: {
    type: 'object',
    properties: {
      purpose: { type: 'string', description: 'One short line stating why you are running this query (shown to the user as a progress step).' },
      query: { type: 'string', description: 'The KQL hunting query to execute.' },
    },
    required: ['purpose', 'query'],
  },
};

const SUBMIT_LADDER_TOOL = {
  type: 'custom',
  name: 'submit_refinement_ladder',
  description:
    'Submit your final result: a ladder of 2 or 3 progressively-refined queries. Call this exactly once, when your investigation is complete and every refinement has been measured.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: '2-3 sentences: what is driving the noise and the overall finetuning strategy.' },
      baseline_hit_count: { type: 'integer', description: "The unrefined query's hit count over the backtest window, as you verified it." },
      refinements: {
        type: 'array',
        description: '2 or 3 entries, ordered conservative -> aggressive.',
        items: {
          type: 'object',
          properties: {
            level: { type: 'integer', description: '1, 2, or 3.' },
            title: { type: 'string', description: "Short label, e.g. 'Exclude signed first-party installers'." },
            kql: { type: 'string', description: 'The complete, standalone refined query.' },
            measured_hit_count: { type: 'integer', description: 'The ACTUAL hit count from running this exact query via run_hunting_query.' },
            noise_reduction_pct: { type: 'number', description: '(baseline - measured) / baseline * 100, rounded.' },
            reasoning: { type: 'string', description: 'Why this refinement is sound — the evidence behind every exclusion.' },
            coverage_tradeoff: { type: 'string', description: 'What real activity this level could miss, and why that is acceptable at this level.' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['level', 'title', 'kql', 'measured_hit_count', 'noise_reduction_pct', 'reasoning', 'coverage_tradeoff', 'confidence'],
        },
      },
    },
    required: ['summary', 'baseline_hit_count', 'refinements'],
  },
};

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY in the environment.');
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': BETA,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function main() {
  console.log('Creating environment…');
  const env = await post('/v1/environments', {
    name: 'detection-finetune-env',
    config: { type: 'cloud', networking: { type: 'limited' } },
  });
  console.log('Creating agent…');
  const agent = await post('/v1/agents', {
    name: 'Detection Finetuning Agent',
    model: 'claude-opus-4-7',
    system: SYSTEM_PROMPT,
    tools: [RUN_HUNTING_QUERY_TOOL, SUBMIT_LADDER_TOOL],
  });
  console.log('\n=== Done. Set these as Supabase Edge Function secrets ===');
  console.log(`FINETUNE_ENVIRONMENT_ID=${env.id}`);
  console.log(`FINETUNE_AGENT_ID=${agent.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
