/**
 * Optimus Detection Studio — guided setup for a self-hosted install.
 *
 *   bun run setup
 *
 * Walks a fresh clone through standing up its OWN Supabase backend:
 *   1. checks prerequisites (bun, supabase CLI, psql)
 *   2. reads .env.local for your project URL + anon key
 *   3. links your Supabase project
 *   4. applies supabase/schema.sql to your database (the full schema)
 *   5. deploys the edge functions
 *   6. prints the exact `supabase secrets set` command to run
 *   7. tells you how to become owner + load MITRE data
 *
 * Nothing here talks to anyone else's instance — only the project you point it at.
 * Commands are executed via spawnSync with argument arrays (no shell), so a
 * pasted connection string cannot inject shell commands.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const C = { reset: '\x1b[0m', cyan: '\x1b[36m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', dim: '\x1b[2m' };
const log = (m = '') => console.log(m);
const step = (n: number, m: string) => log(`\n${C.cyan}[${n}/6] ${m}${C.reset}`);
const ok = (m: string) => log(`  ${C.green}✓${C.reset} ${m}`);
const warn = (m: string) => log(`  ${C.yellow}!${C.reset} ${m}`);
const die = (m: string) => { log(`\n${C.red}✗ ${m}${C.reset}`); process.exit(1); };

/** True if `bin --version` succeeds. No user input, safe. */
function has(bin: string, pre: string[] = []): boolean {
  const r = spawnSync(bin, [...pre, '--version'], { stdio: 'ignore' });
  return r.status === 0;
}
/** Execute a program with an argument array — NO shell, so args are never interpreted. */
function run(bin: string, args: string[], opts: { allowFail?: boolean } = {}): boolean {
  log(`  ${C.dim}$ ${bin} ${args.map((a) => (a.startsWith('postgres') ? '<db-url>' : a)).join(' ')}${C.reset}`);
  const r = spawnSync(bin, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    if (opts.allowFail) { warn(`command failed (continuing): ${bin} ${args[0] ?? ''}`); return false; }
    die(`command failed: ${bin} ${args[0] ?? ''}`);
  }
  return true;
}
function parseEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const REQUIRED_SECRETS: [string, string][] = [
  ['GEMINI_API_KEY', 'Google Gemini API key (primary AI provider — at least one AI key required)'],
  ['OPENAI_API_KEY', 'OpenAI API key (embeddings / alternative provider)'],
  ['ANTHROPIC_API_KEY', 'Anthropic Claude API key (optional alternative provider)'],
  ['SUPABASE_URL', 'https://YOUR_REF.supabase.co (auto-available to functions; set for safety)'],
  ['SUPABASE_ANON_KEY', 'your anon key'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'your service-role key (Settings → API)'],
  ['INTEGRATION_ENCRYPTION_KEY', '32-byte hex for AES-GCM SIEM credential encryption: openssl rand -hex 32'],
  ['RESEND_API_KEY', 'Resend API key — only if you use the demo-request email (optional)'],
  ['DEMO_NOTIFY_EMAIL', 'email to receive demo requests (optional)'],
  ['TAVILY_API_KEY', 'Tavily key for threat-intel web search (optional)'],
  ['ALLOWED_ORIGINS', 'comma-separated allowed origins for CORS (optional)'],
  ['SITE_URL', 'your deployed app URL for email links (optional)'],
];

async function main() {
  log(`${C.cyan}╔════════════════════════════════════════════════════╗`);
  log(`║   Optimus Detection Studio — self-hosted setup     ║`);
  log(`╚════════════════════════════════════════════════════╝${C.reset}`);

  // 1) Prerequisites
  step(1, 'Checking prerequisites');
  has('bun') ? ok('bun') : warn('bun not detected');
  // Prefer a global `supabase`, else fall back to `npx supabase`.
  let supaBin = 'supabase', supaPre: string[] = [];
  if (!has('supabase')) {
    if (has('npx', ['supabase'])) { supaBin = 'npx'; supaPre = ['supabase']; }
    else die('Supabase CLI not found. Install: https://supabase.com/docs/guides/cli');
  }
  ok(`supabase CLI (${supaBin} ${supaPre.join(' ')}`.trim() + ')');
  const havePsql = has('psql');
  havePsql ? ok('psql') : warn('psql not found — needed to apply schema.sql. Install PostgreSQL client tools.');

  // 2) Environment
  step(2, 'Reading .env.local');
  if (!existsSync('.env.local')) die('.env.local not found. Run: cp .env.example .env.local  and fill in your Supabase URL + anon key.');
  const env = parseEnv('.env.local');
  const url = env.VITE_SUPABASE_URL;
  if (!url || !env.VITE_SUPABASE_ANON_KEY) die('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing in .env.local');
  const refMatch = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (!refMatch) die(`Could not parse project ref from VITE_SUPABASE_URL=${url}`);
  const ref = refMatch[1];
  ok(`project ref: ${ref}`);

  const rl = createInterface({ input, output });
  const dbUrl = (env.SUPABASE_DB_URL || process.env.SUPABASE_DB_URL ||
    (await rl.question(`\n  Paste your database connection string — Settings → Database → Connection string → URI\n  ${C.dim}(begins with postgresql:// and contains your project ref, DB password, and pooler host)${C.reset}\n  > `))).trim();
  await rl.close();
  if (!dbUrl.startsWith('postgres')) die('A valid postgres connection string is required to apply the schema.');

  // 3) Link
  step(3, 'Linking your Supabase project');
  run(supaBin, [...supaPre, 'link', '--project-ref', ref], { allowFail: true });

  // 4) Apply schema (dbUrl passed as an argument, never interpolated into a shell string)
  step(4, 'Applying supabase/schema.sql');
  if (!havePsql) die('psql is required. Install it and re-run, or run manually: psql "<db-url>" -f supabase/schema.sql');
  run('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/schema.sql']);
  ok('schema applied');

  // 5) Deploy functions
  step(5, 'Deploying edge functions');
  run(supaBin, [...supaPre, 'functions', 'deploy'], { allowFail: true });

  // 6) Secrets + next steps
  step(6, 'Set your edge-function secrets');
  const supaStr = [supaBin, ...supaPre].join(' ');
  log(`  Run this (fill in your own values — at least one AI key + service role + encryption key):\n`);
  log(`  ${C.dim}${supaStr} secrets set \\`);
  log(REQUIRED_SECRETS.map(([k]) => `    ${k}=...`).join(' \\\n') + `${C.reset}\n`);
  for (const [k, d] of REQUIRED_SECRETS) log(`    ${C.cyan}${k}${C.reset}  ${C.dim}${d}${C.reset}`);

  log(`\n${C.green}Setup steps run. Finish with:${C.reset}`);
  log(`  1. Set the secrets above.`);
  log(`  2. Sign up in the app, then promote yourself to owner in the SQL editor:`);
  log(`     ${C.dim}update public.profiles set role = 'owner' where email = 'you@example.com';${C.reset}`);
  log(`  3. Start the app:  ${C.cyan}bun run dev${C.reset}`);
  log(`  4. In-app: Settings → MITRE Data Sync → "Import MITRE Data", then "Refresh Scores".`);
  log(`  5. (Optional) Background automation: apply ${C.cyan}supabase/optional-scheduled-jobs.sql${C.reset}.`);
  log(`\n  Verify everything with:  ${C.cyan}bun run setup:check${C.reset}\n`);
}

main().catch((e) => die(e?.message || String(e)));
