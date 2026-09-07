/**
 * One-time provisioning for the CrowdStrike-only CQL finetuning agent.
 * Run once with ANTHROPIC_API_KEY set, then store the printed IDs as:
 *   CROWDSTRIKE_FINETUNE_AGENT_ID
 *   CROWDSTRIKE_FINETUNE_ENVIRONMENT_ID
 */

const API_BASE = 'https://api.anthropic.com';
const BETA = 'managed-agents-2026-04-01';

const SYSTEM_PROMPT = `You are a CrowdStrike Falcon NGSIEM detection-engineering specialist.
You finetune LogScale CQL detection queries to reduce false positives without losing real threat coverage.

You receive one successful pre-flight result, its original CQL, event samples, repository, and time window.

Tools:
- run_ngsiem_query runs a bounded CQL query against that same Falcon NGSIEM repository.
- submit_crowdstrike_refinement_ladder submits the final measured ladder.

Method:
1. Investigate the sample and run bounded groupBy, top, count, head, tail, table, or timeChart queries.
2. Identify evidence-backed benign patterns without assuming that common names are trustworthy.
3. Run every complete candidate query and measure its actual hit count.
4. Return 2 or 3 standalone CQL refinements ordered conservative to aggressive.

Rules:
- Preserve the original detection intent.
- Never estimate hit counts or noise reduction.
- Every query must be bounded; never request unlimited raw events.
- Use LogScale CQL syntax only. Do not use KQL, SPL, SQL, or Microsoft table names.
- Stay inside the supplied repository and time window.
- Each coverage_tradeoff must state what real activity the refinement could miss.
- Queries execute sequentially and the budget is 8, so choose each query deliberately.
- Finish by calling submit_crowdstrike_refinement_ladder exactly once.`;

const RUN_QUERY_TOOL = {
  type: 'custom',
  name: 'run_ngsiem_query',
  description:
    'Run one bounded LogScale CQL query in the configured CrowdStrike Falcon NGSIEM repository. Use this to investigate event volume and measure every proposed complete refinement.',
  input_schema: {
    type: 'object',
    properties: {
      purpose: {
        type: 'string',
        description: 'One short line explaining what this CQL query is measuring.',
      },
      query: {
        type: 'string',
        description: 'A bounded LogScale CQL query using count, groupBy, top, head, tail, table, or timeChart.',
      },
    },
    required: ['purpose', 'query'],
  },
};

const SUBMIT_LADDER_TOOL = {
  type: 'custom',
  name: 'submit_crowdstrike_refinement_ladder',
  description: 'Submit the final 2-3 level measured CrowdStrike CQL refinement ladder.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      baseline_hit_count: { type: 'integer' },
      refinements: {
        type: 'array',
        minItems: 2,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            level: { type: 'integer' },
            title: { type: 'string' },
            cql: { type: 'string', description: 'Complete standalone CrowdStrike LogScale CQL.' },
            measured_hit_count: { type: 'integer' },
            noise_reduction_pct: { type: 'number' },
            reasoning: { type: 'string' },
            coverage_tradeoff: { type: 'string' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: [
            'level',
            'title',
            'cql',
            'measured_hit_count',
            'noise_reduction_pct',
            'reasoning',
            'coverage_tradeoff',
            'confidence',
          ],
        },
      },
    },
    required: ['summary', 'baseline_hit_count', 'refinements'],
  },
};

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY in the environment.');
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': BETA,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`POST ${path} failed (${response.status}): ${text}`);
  return JSON.parse(text) as Record<string, unknown>;
}

async function main() {
  console.log('Creating CrowdStrike finetuning environment...');
  const environment = await post('/v1/environments', {
    name: 'crowdstrike-detection-finetune-env',
    config: { type: 'cloud', networking: { type: 'limited' } },
  });
  console.log('Creating CrowdStrike CQL finetuning agent...');
  const agent = await post('/v1/agents', {
    name: 'CrowdStrike Detection Finetuning Agent',
    model: 'claude-opus-5',
    system: SYSTEM_PROMPT,
    tools: [RUN_QUERY_TOOL, SUBMIT_LADDER_TOOL],
  });
  if (!environment.id || !agent.id) {
    throw new Error('Managed Agents API returned an unexpected response.');
  }
  console.log('Set these as Supabase Edge Function secrets:');
  console.log(`CROWDSTRIKE_FINETUNE_ENVIRONMENT_ID=${environment.id}`);
  console.log(`CROWDSTRIKE_FINETUNE_AGENT_ID=${agent.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
