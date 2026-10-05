/**
 * Optimus Detection Studio — guided end-to-end setup for a self-hosted install.
 *
 *   bun run setup
 *
 * Walks a fresh clone through standing up its OWN Supabase backend:
 *   1. checks prerequisites (bun, supabase CLI, psql)
 *   2. reads .env.local for your project URL + anon key
 *   3. links your Supabase project
 *   4. applies supabase/schema.sql (skipped automatically if already applied)
 *   5. deploys the edge functions
 *   6. sets edge-function secrets (prompts; auto-generates the encryption key)
 *   7. enables Threat Research + background automation (Vault secrets, pg_cron)
 *   8. runs the install doctor (setup-check) and prints a step-by-step summary
 *
 * Safe to re-run at any time: every step detects what is already done and
 * skips it, so a failed install can be retried by just running `bun run setup`
 * again. The final summary shows exactly what completed, what was skipped,
 * and what failed (with the manual command to fix it).
 *
 * Non-interactive (CI): set SUPABASE_DB_URL, and optionally GEMINI_API_KEY /
 * SUPABASE_SERVICE_ROLE_KEY, in the environment — all prompts are skipped.
 *
 * Nothing here talks to anyone else's instance — only the project you point it at.
 * Commands are executed via spawnSync with argument arrays (no shell), so a
 * pasted connection string cannot inject shell commands. Secrets are passed to
 * psql over stdin, never written to disk or the process argument list.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface, type Interface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const C = { reset: '\x1b[0m', cyan: '\x1b[36m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', dim: '\x1b[2m' };
const TOTAL_STEPS = 8;
const log = (m = '') => console.log(m);
const step = (n: number, m: string) => log(`\n${C.cyan}[${n}/${TOTAL_STEPS}] ${m}${C.reset}`);
const ok = (m: string) => log(`  ${C.green}✓${C.reset} ${m}`);
const warn = (m: string) => log(`  ${C.yellow}!${C.reset} ${m}`);
const err = (m: string) => log(`  ${C.red}✗${C.reset} ${m}`);
const die = (m: string) => { log(`\n${C.red}✗ ${m}${C.reset}`); process.exit(1); };

// ── Step ledger: every step reports done / skipped / failed with a note ──
type Status = 'done' | 'skipped' | 'failed';
const ledger: { name: string; status: Status; note: string }[] = [];
const record = (name: string, status: Status, note = '') => ledger.push({ name, status, note });

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
/** Run SQL against the database. The SQL goes over stdin — never argv, never disk. */
function runSql(dbUrl: string, sql: string): { ok: boolean; error: string } {
  const r = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', timeout: 120_000 });
  return { ok: r.status === 0, error: (r.stderr || '').trim() };
}
/** Run a fixed scalar query via psql; returns trimmed value or null on failure. */
function sqlScalar(dbUrl: string, query: string): string | null {
  const r = spawnSync('psql', [dbUrl, '-tAc', query], { encoding: 'utf8', timeout: 30_000 });
  if (r.status !== 0) return null;
  return (r.stdout || '').trim();
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
const sqlQuote = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** Parse `supabase ... list` output: prefers `-o json` (array or {secrets:[...]}), falls back to table rows. */
function parseCliNames(stdout: string): Set<string> {
  const names = new Set<string>();
  const raw = (stdout || '').trim();
  try {
    const j = JSON.parse(raw);
    const arr = Array.isArray(j) ? j : Array.isArray(j?.secrets) ? j.secrets : [];
    for (const e of arr) if (typeof e?.name === 'string') names.add(e.name);
    return names;
  } catch { /* not JSON — fall through to table parsing */ }
  for (const line of raw.split('\n')) {
    const name = line.split(/[|│]/)[0]?.trim();
    if (name && name !== 'NAME' && /^[A-Z][A-Z0-9_]*$/.test(name)) names.add(name);
  }
  return names;
}

const SECRET_PROMPTS: { key: string; why: string; required: boolean }[] = [
  { key: 'GEMINI_API_KEY', why: 'Gemini — embeddings, semantic search, playbooks, the core AI experience', required: true },
  { key: 'ANTHROPIC_API_KEY', why: 'Anthropic — REQUIRED for Threat Research and Detection Finetuning', required: false },
  { key: 'TAVILY_API_KEY', why: 'Tavily — threat-intel web search (optional)', required: false },
  { key: 'OPENAI_API_KEY', why: 'OpenAI — alternate generation provider (optional)', required: false },
];

const CRON_JOBS: [string, string, string][] = [
  ['pack-deploy-dispatcher', '* * * * *', 'select public.pack_deploy_dispatch()'],
  ['ai_usage_rollup', '0 2 * * *', 'select public.rollup_ai_usage()'],
  ['threat-research-dispatcher', '* * * * *', 'select public.threat_research_dispatcher()'],
  ['auto-digest-watchdog', '*/5 * * * *', 'select public.auto_digest_watchdog()'],
  ['auto-digest-scheduler', '0 * * * *', 'select public.auto_digest_scheduler()'],
  ['auto-digest-queue-consumer', '* * * * *', `select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/auto-digest-queue-consumer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'apikey', current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  )`],
];

// The canonical snapshot is for fresh databases. These forward migrations are
// also applied by the guided installer so an existing installation receives
// newly-added runtime columns and functions.
const FORWARD_MIGRATIONS = [
  'supabase/migrations/20260716000000_active_entry_id.sql',
  'supabase/migrations/20260729120000_threat_research_library_search_visibility_scope.sql',
  'supabase/migrations/20260729130000_threat_research_events_agent_check_add_dossier.sql',
  'supabase/migrations/20260729140000_threat_research_session_abort.sql',
  'supabase/migrations/20260729150000_threat_research_job_checkpoints.sql',
  'supabase/migrations/20260729160000_threat_research_token_budgets.sql',
  'supabase/migrations/20260729170000_threat_research_partial_status.sql',
  'supabase/migrations/20260729180000_tr_consume_budget_relock_and_validate.sql',
  'supabase/migrations/20260730120000_threat_research_vendor_searches.sql',
];

async function main() {
  log(`${C.cyan}╔════════════════════════════════════════════════════╗`);
  log(`║   Optimus Detection Studio — self-hosted setup     ║`);
  log(`╚════════════════════════════════════════════════════╝${C.reset}`);
  log(`${C.dim}  Re-run safe: completed steps are detected and skipped.${C.reset}`);

  const interactive = process.stdin.isTTY === true;
  const rl: Interface | null = interactive ? createInterface({ input, output }) : null;
  const ask = async (q: string): Promise<string> => (rl ? (await rl.question(q)).trim() : '');

  // 1) Prerequisites
  step(1, 'Checking prerequisites');
  if (has('bun')) ok('bun'); else warn('bun not detected');
  // Prefer a global `supabase`, else fall back to `npx supabase`, then `bunx supabase`.
  let supaBin = 'supabase', supaPre: string[] = [];
  if (!has('supabase')) {
    if (has('npx', ['supabase'])) { supaBin = 'npx'; supaPre = ['supabase']; }
    else if (has('bunx', ['supabase'])) { supaBin = 'bunx'; supaPre = ['supabase']; }
    else die('Supabase CLI not found. Install: https://supabase.com/docs/guides/cli');
  }
  ok(`supabase CLI (${supaBin} ${supaPre.join(' ')}`.trim() + ')');
  const havePsql = has('psql');
  if (havePsql) ok('psql'); else warn('psql not found — needed to apply schema.sql. Install PostgreSQL client tools.');
  record('Prerequisites', 'done');

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

  const dbUrl = (env.SUPABASE_DB_URL || process.env.SUPABASE_DB_URL ||
    (await ask(`\n  Paste your database connection string — Settings → Database → Connection string → URI\n  ${C.dim}(begins with postgresql:// and contains your project ref, DB password, and pooler host)${C.reset}\n  > `))).trim();
  if (!dbUrl.startsWith('postgres')) die('A valid postgres connection string is required to apply the schema.');
  record('Environment', 'done', `project ${ref}`);

  // 3) Link
  step(3, 'Linking your Supabase project');
  const linked = run(supaBin, [...supaPre, 'link', '--project-ref', ref], { allowFail: true });
  record('Link project', linked ? 'done' : 'failed', linked ? '' : `retry: ${[supaBin, ...supaPre].join(' ')} link --project-ref ${ref}`);

  // 4) Apply schema — detect an already-applied schema and skip (schema.sql is
  //    written for an EMPTY database; re-applying over a complete install fails
  //    on existing policies/triggers).
  step(4, 'Applying supabase/schema.sql');
  if (!havePsql) die('psql is required. Install it and re-run, or run manually: psql "<db-url>" -f supabase/schema.sql');
  const tableCount = Number(sqlScalar(dbUrl, "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'") ?? NaN);
  if (Number.isNaN(tableCount)) {
    die('Could not connect to the database with that connection string. Check it and re-run (Session Pooler URI works on most networks).');
  } else if (tableCount >= 62) {
    ok(`schema already applied (${tableCount} tables) — skipping`);
    record('Database schema', 'skipped', 'already applied');
  } else if (tableCount > 0) {
    warn(`database has ${tableCount} tables — looks like a partial or foreign schema.`);
    warn('Attempting to apply schema.sql on top (tables use IF NOT EXISTS, but existing policies/triggers can collide).');
    const applied = runSql(dbUrl, readFileSync('supabase/schema.sql', 'utf8'));
    if (applied.ok) { ok('schema applied'); record('Database schema', 'done', 'applied over partial state'); }
    else {
      err('schema apply failed on a partially-set-up database.');
      log(`  ${C.dim}${applied.error.split('\n').slice(-3).join('\n  ')}${C.reset}`);
      warn('Easiest fix: reset the database (Supabase Dashboard → Settings → Database → Reset), then re-run bun run setup.');
      record('Database schema', 'failed', 'partial database — reset it, then re-run setup');
    }
  } else {
    run('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/schema.sql']);
    ok('schema applied');
    record('Database schema', 'done');
  }

  let migrationsFailed = false;
  for (const migrationPath of FORWARD_MIGRATIONS) {
    if (!existsSync(migrationPath)) {
      migrationsFailed = true;
      err(`missing forward migration: ${migrationPath}`);
      continue;
    }
    const migration = runSql(dbUrl, readFileSync(migrationPath, 'utf8'));
    if (migration.ok) {
      ok(`forward migration applied: ${migrationPath}`);
    } else {
      migrationsFailed = true;
      err(`forward migration failed: ${migrationPath}`);
      log(`  ${C.dim}${migration.error.split('\n').slice(-3).join('\n  ')}${C.reset}`);
    }
  }
  record(
    'Forward migrations',
    migrationsFailed ? 'failed' : 'done',
    migrationsFailed ? 'fix the migration error and re-run bun run setup' : `${FORWARD_MIGRATIONS.length} applied`,
  );

  // 5) Deploy functions
  step(5, 'Deploying edge functions');
  const deployed = run(supaBin, [...supaPre, 'functions', 'deploy'], { allowFail: true });
  record('Edge functions', deployed ? 'done' : 'failed', deployed ? '' : `retry: ${[supaBin, ...supaPre].join(' ')} functions deploy`);

  // 6) Edge-function secrets — read what's already set, prompt only for what's missing.
  step(6, 'Edge-function secrets');
  const supaStr = [supaBin, ...supaPre].join(' ');
  const listRun = spawnSync(supaBin, [...supaPre, 'secrets', 'list', '-o', 'json'], { encoding: 'utf8', timeout: 30_000 });
  let existing = new Set<string>();
  if (listRun.status === 0) {
    existing = parseCliNames(listRun.stdout || '');
    ok(`found ${existing.size} secret(s) already set${existing.size ? `: ${[...existing].join(', ')}` : ''}`);
  } else {
    warn('could not list existing secrets (is the project linked?) — will prompt for all of them');
  }

  const toSet: string[] = [];
  // INTEGRATION_ENCRYPTION_KEY: generated, never prompted. NEVER regenerate an
  // existing one — stored SIEM credentials become undecryptable.
  if (existing.has('INTEGRATION_ENCRYPTION_KEY')) {
    ok('INTEGRATION_ENCRYPTION_KEY already set — keeping it (rotating it breaks stored SIEM credentials)');
  } else {
    toSet.push(`INTEGRATION_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`);
    ok('INTEGRATION_ENCRYPTION_KEY — generated a fresh 32-byte key');
  }
  for (const { key, why, required } of SECRET_PROMPTS) {
    if (existing.has(key)) { ok(`${key} already set`); continue; }
    const fromEnv = (process.env[key] || '').trim();
    const val = fromEnv || (await ask(`  ${C.cyan}${key}${C.reset} — ${why}\n    ${C.dim}(paste value, or press Enter to skip)${C.reset} > `));
    if (val) toSet.push(`${key}=${val}`);
    else if (required) warn(`${key} skipped — AI features will be degraded until you set it: ${supaStr} secrets set ${key}=...`);
    else warn(`${key} skipped`);
  }
  if (toSet.length > 0) {
    const setRun = spawnSync(supaBin, [...supaPre, 'secrets', 'set', ...toSet], { stdio: ['ignore', 'inherit', 'inherit'], timeout: 60_000 });
    if (setRun.status === 0) { ok(`set ${toSet.length} secret(s)`); record('Secrets', 'done', `${toSet.length} set`); }
    else { err('secrets set failed'); record('Secrets', 'failed', `retry: ${supaStr} secrets set KEY=value ...`); }
  } else {
    record('Secrets', 'skipped', 'all already set / skipped at prompt');
  }
  const anthropicAvailable = existing.has('ANTHROPIC_API_KEY') || toSet.some((s) => s.startsWith('ANTHROPIC_API_KEY='));

  // 7) Threat Research + background automation.
  //    NOT optional if you use Threat Research: the in-app feature dispatches
  //    jobs through pg_net using a service-role key stored in Vault. Without
  //    this step, research sessions sit in "pending" forever.
  step(7, 'Threat Research & background automation');
  log(`  ${C.dim}Stores your project URL + service-role key in Supabase Vault and schedules the`);
  log(`  dispatcher/watchdog cron jobs. Required for the Threat Research feature; also`);
  log(`  enables scheduled auto-digest and AI-usage rollups.${C.reset}`);
  let srk = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!srk && interactive) {
    srk = await ask(`  ${C.cyan}Service-role key${C.reset} — Dashboard → Settings → API → service_role\n    ${C.dim}(paste to enable, or press Enter to skip — you can re-run setup later)${C.reset} > `);
  }
  if (!srk) {
    warn('skipped — Threat Research sessions will NOT run until this is configured.');
    warn(`Re-run bun run setup, or apply supabase/optional-scheduled-jobs.sql by hand.`);
    record('Threat Research & automation', 'skipped', 'no service-role key provided — Threat Research disabled');
  } else {
    const projectUrl = `https://${ref}.supabase.co`;
    const automationSql = `
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $vaultblk$
declare sid uuid;
begin
  select id into sid from vault.secrets where name = 'tr_supabase_url';
  if sid is null then perform vault.create_secret(${sqlQuote(projectUrl)}, 'tr_supabase_url');
  else perform vault.update_secret(sid, ${sqlQuote(projectUrl)}); end if;
  select id into sid from vault.secrets where name = 'tr_service_role_key';
  if sid is null then perform vault.create_secret(${sqlQuote(srk)}, 'tr_service_role_key');
  else perform vault.update_secret(sid, ${sqlQuote(srk)}); end if;
end $vaultblk$;
alter database postgres set app.settings.supabase_url = ${sqlQuote(projectUrl)};
alter database postgres set app.settings.service_role_key = ${sqlQuote(srk)};
${CRON_JOBS.map(([name, sched, cmd]) => `select cron.schedule('${name}', '${sched}', $job$ ${cmd} $job$);`).join('\n')}
`;
    log(`  ${C.dim}$ psql <db-url>  (extensions, Vault secrets, ${CRON_JOBS.length} cron jobs — sent over stdin)${C.reset}`);
    const auto = runSql(dbUrl, automationSql);
    if (auto.ok) {
      ok('pg_cron + pg_net enabled, Vault secrets stored, cron jobs scheduled');
      if (!anthropicAvailable) warn('Threat Research also needs the ANTHROPIC_API_KEY secret (step 6) to run its agents.');
      record('Threat Research & automation', 'done');
    } else {
      err('automation setup failed:');
      log(`  ${C.dim}${auto.error.split('\n').slice(-3).join('\n  ')}${C.reset}`);
      warn('Apply supabase/optional-scheduled-jobs.sql manually in the Supabase SQL Editor.');
      record('Threat Research & automation', 'failed', 'apply supabase/optional-scheduled-jobs.sql manually');
    }
  }
  await rl?.close();

  // 8) Verify with the install doctor
  step(8, 'Verifying the install (bun run setup:check)');
  const check = spawnSync('bun', ['scripts/setup-check.ts'], {
    stdio: 'inherit',
    env: { ...process.env, SUPABASE_DB_URL: dbUrl },
  });
  record('Verification', check.status === 0 ? 'done' : 'failed', check.status === 0 ? '' : 'see failures above; fix and re-run bun run setup:check');

  // ── Summary ──
  log(`\n${C.cyan}══ Setup summary ═══════════════════════════════════${C.reset}`);
  const icon: Record<Status, string> = { done: `${C.green}✓ done   ${C.reset}`, skipped: `${C.yellow}~ skipped${C.reset}`, failed: `${C.red}✗ FAILED ${C.reset}` };
  for (const s of ledger) log(`  ${icon[s.status]} ${s.name}${s.note ? ` ${C.dim}— ${s.note}${C.reset}` : ''}`);
  const failed = ledger.filter((s) => s.status === 'failed');
  if (failed.length) log(`\n${C.yellow}Some steps need attention (notes above). Fix them and re-run ${C.cyan}bun run setup${C.yellow} — completed steps are skipped automatically.${C.reset}`);

  log(`\n${C.green}Finish in the app:${C.reset}`);
  log(`  1. Create your first user in the Supabase dashboard (Authentication → Users → Add user,`);
  log(`     tick "Auto Confirm User" — there is no in-app sign-up), then promote yourself to owner:`);
  log(`     ${C.dim}update public.profiles set role = 'owner' where email = 'you@example.com';${C.reset}`);
  log(`  2. Start the app:  ${C.cyan}bun run dev${C.reset}`);
  log(`  3. In-app: Settings → Data Sync → "Import MITRE Data", then "Refresh Scores".`);
  log(`  4. (Optional) Detection Finetuning needs a Microsoft Defender XDR integration plus a one-time`);
  log(`     ${C.dim}ANTHROPIC_API_KEY=... bun scripts/setup-finetune-agent.ts${C.reset} — see SETUP.md.`);
  log('');
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => die(e?.message || String(e)));
