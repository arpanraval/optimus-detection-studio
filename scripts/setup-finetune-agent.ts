/**
 * One-time provisioning for the Detection Finetuning agent.
 * Run once:  ANTHROPIC_API_KEY=... bun scripts/setup-finetune-agent.ts
 * Then set the printed IDs as Supabase Edge Function secrets:
 *   FINETUNE_AGENT_ID, FINETUNE_ENVIRONMENT_ID
 *
 * Not idempotent: re-running creates a SECOND environment and agent under
 * the same names. If you re-run after a partial failure, delete the orphaned
 * resources in the Anthropic console.
 */

const API_BASE = 'https://api.anthropic.com';
const BETA = 'managed-agents-2026-04-01';

import { FINETUNE_SYSTEM_PROMPT, FINETUNE_TOOLS } from '../supabase/functions/_shared/finetune-agent';

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
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`POST ${path} -> ${res.status} but non-JSON body: ${text}`);
  }
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
    model: 'claude-opus-5',
    system: FINETUNE_SYSTEM_PROMPT,
    tools: FINETUNE_TOOLS,
  });
  if (!env.id || !agent.id) {
    throw new Error(
      `Unexpected API response shape — environment: ${JSON.stringify(env)}, agent: ${JSON.stringify(agent)}`,
    );
  }
  console.log('\n=== Done. Set these as Supabase Edge Function secrets ===');
  console.log(`FINETUNE_ENVIRONMENT_ID=${env.id}`);
  console.log(`FINETUNE_AGENT_ID=${agent.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
