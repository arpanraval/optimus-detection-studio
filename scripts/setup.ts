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
 * Re-runs preserve the existing schema and Edge Function secrets. Compatibility
 * repairs repeat, functions redeploy, and supplied Vault credentials are updated.
 *
 * Non-interactive (CI): set SUPABASE_DB_URL, and optionally GEMINI_API_KEY /
 * SUPABASE_SERVICE_ROLE_KEY, in the environment — all prompts are skipped.
 *
 * Nothing here talks to anyone else's instance — only the project you point it at.
 * Commands are executed via spawnSync with argument arrays (no shell), so a
 * pasted connection string cannot inject shell commands. SQL uses stdin and
 * the DB password uses the child environment. CLI secrets use a restricted
 * temporary env file, removed when the CLI exits (see setup-process.ts).
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { missingNames, parseCliNames, parseTableNames, PUBLIC_TABLES_QUERY, schemaTableNames } from './setup-state';
import { promptSecret, parseEnvText, redactSecrets } from './setup-input';
import { classifySupabaseKey, isPublicSupabaseKey } from '../src/lib/supabaseKeys';
import { executeSql, setProjectSecrets } from './setup-process';
import FORWARD_MIGRATIONS from './setup-migrations.json';

const C = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
};
const TOTAL_STEPS = 8;
const log = (m = '') => console.log(m);
const step = (n: number, m: string) => log(`\n${C.cyan}[${n}/${TOTAL_STEPS}] ${m}${C.reset}`);
const ok = (m: string) => log(`  ${C.green}✓${C.reset} ${m}`);
const warn = (m: string) => log(`  ${C.yellow}!${C.reset} ${m}`);
const err = (m: string) => log(`  ${C.red}✗${C.reset} ${m}`);
const die = (m: string) => {
  log(`\n${C.red}✗ ${m}${C.reset}`);
  process.exit(1);
};

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
    if (opts.allowFail) {
      warn(`command failed (continuing): ${bin} ${args[0] ?? ''}`);
      return false;
    }
    die(`command failed: ${bin} ${args[0] ?? ''}`);
  }
  return true;
}
/** Run SQL against the database. The SQL goes over stdin — never argv, never disk. */
function runSql(dbUrl: string, sql: string): { ok: boolean; error: string } {
  return executeSql(dbUrl, sql);
}
/** Run a fixed scalar query via psql; returns trimmed value or null on failure. */
function sqlScalar(dbUrl: string, query: string): string | null {
  const r = executeSql(dbUrl, query, true);
  return r.ok ? r.output : null;
}
function parseEnv(path: string): Record<string, string> {
  return existsSync(path) ? parseEnvText(readFileSync(path, 'utf8')) : {};
}

const sqlQuote = (v: string) => `'${v.replace(/'/g, "''")}'`;

const SECRET_PROMPTS: { key: string; why: string; required: boolean }[] = [
  {
    key: 'GEMINI_API_KEY',
    why: 'Gemini — embeddings, semantic search, playbooks, the core AI experience',
    required: true,
  },
  {
    key: 'ANTHROPIC_API_KEY',
    why: 'Anthropic — REQUIRED for Threat Research and Detection Finetuning',
    required: false,
  },
  { key: 'TAVILY_API_KEY', why: 'Tavily — threat-intel web search (optional)', required: false },
  { key: 'OPENAI_API_KEY', why: 'OpenAI — alternate generation provider (optional)', required: false },
];

// setup-migrations.json lists repeatable compatibility repairs, not the entire
// migration history. Never add superseded migrations: schema.sql includes them.
// In particular, active_entry_id.sql would downgrade the durable-queue watchdog.

async function main() {
  log(`${C.cyan}╔════════════════════════════════════════════════════╗`);
  log(`║   Optimus Detection Studio — self-hosted setup     ║`);
  log(`╚════════════════════════════════════════════════════╝${C.reset}`);
  log(
    `${C.dim}  Re-runs preserve existing schema and Edge Function secrets; repairs and deployments repeat.${C.reset}`,
  );

  const interactive = process.stdin.isTTY === true;
  const ask = promptSecret;

  // 1) Prerequisites
  step(1, 'Checking prerequisites');
  if (has('bun')) ok('bun');
  else warn('bun not detected');
  // Prefer a global `supabase`, else fall back to `npx supabase`, then `bunx supabase`.
  let supaBin = 'supabase',
    supaPre: string[] = [];
  if (!has('supabase')) {
    if (has('npx', ['supabase'])) {
      supaBin = 'npx';
      supaPre = ['supabase'];
    } else if (has('bunx', ['supabase'])) {
      supaBin = 'bunx';
      supaPre = ['supabase'];
    } else die('Supabase CLI not found. Install: https://supabase.com/docs/guides/cli');
  }
  ok(`supabase CLI (${supaBin} ${supaPre.join(' ')}`.trim() + ')');
  const havePsql = has('psql');
  if (havePsql) ok('psql');
  else warn('psql not found — needed to apply schema.sql. Install PostgreSQL client tools.');
  record('Prerequisites', 'done');

  // 2) Environment
  step(2, 'Reading .env.local');
  if (!existsSync('.env.local'))
    die('.env.local not found. Run: cp .env.example .env.local  and fill in your Supabase URL + anon key.');
  const env = parseEnv('.env.local');
  const url = env.VITE_SUPABASE_URL;
  if (!url || !env.VITE_SUPABASE_ANON_KEY) die('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing in .env.local');
  if (!isPublicSupabaseKey(env.VITE_SUPABASE_ANON_KEY))
    die('VITE_SUPABASE_ANON_KEY must be a publishable or legacy anon key, never a backend secret.');
  const refMatch = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/);
  if (!refMatch) die(`Could not parse project ref from VITE_SUPABASE_URL=${url}`);
  const ref = refMatch[1];
  ok(`project ref: ${ref}`);

  const dbUrl = (
    env.SUPABASE_DB_URL ||
    process.env.SUPABASE_DB_URL ||
    (await ask(
      `\n  Paste your database connection string — Settings → Database → Connection string → URI\n  ${C.dim}(begins with postgresql:// and contains your project ref, DB password, and pooler host)${C.reset}\n  > `,
    ))
  ).trim();
  if (!dbUrl.startsWith('postgres')) die('A valid postgres connection string is required to apply the schema.');
  record('Environment', 'done', `project ${ref}`);

  // 3) Link
  step(3, 'Linking your Supabase project');
  const linked = run(supaBin, [...supaPre, 'link', '--project-ref', ref], { allowFail: true });
  if (!linked)
    die(
      'Project linking failed. Setup stopped before database changes or deployment to avoid using a previously linked project.',
    );
  record(
    'Link project',
    linked ? 'done' : 'failed',
    linked ? '' : `retry: ${[supaBin, ...supaPre].join(' ')} link --project-ref ${ref}`,
  );

  // 4) Apply schema — detect an already-applied schema and skip (schema.sql is
  //    written for an EMPTY database; re-applying over a complete install fails
  //    on existing policies/triggers).
  step(4, 'Applying supabase/schema.sql');
  if (!havePsql)
    die('psql is required. Install it and re-run, or run manually: psql "<db-url>" -f supabase/schema.sql');
  const tables = sqlScalar(dbUrl, PUBLIC_TABLES_QUERY);
  if (tables === null) {
    die('Could not connect to the database. Check the connection string and re-run setup.');
  }
  const installedTables = parseTableNames(tables!);
  const missing = missingNames(schemaTableNames(), installedTables);
  if (installedTables.length === 0) {
    const applied = runSql(dbUrl, readFileSync('supabase/schema.sql', 'utf8'));
    if (!applied.ok) die(`Schema application failed: ${applied.error}`);
    ok('schema applied');
    record('Database schema', 'done');
  } else if (!missing.length) {
    ok(`schema already applied (${installedTables.length} tables); skipping`);
    record('Database schema', 'skipped', 'required tables present');
  } else if (installedTables.includes('profiles') && installedTables.includes('auto_digest_jobs')) {
    // Older installs may acquire missing objects from the compatibility migrations below.
    // Never replay the fresh-install snapshot over an existing database.
    warn(`existing installation is missing tables: ${missing.join(', ')}`);
    record('Database schema', 'skipped', 'existing installation; verification will check missing objects');
  } else {
    die(
      'Database is nonempty but does not match Optimus. Use an empty database or apply the missing migrations; setup will not overlay schema.sql.',
    );
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
  if (migrationsFailed)
    die('A database repair failed. Resolve the error before deploying functions; re-run setup afterwards.');
  const repairedTables = sqlScalar(dbUrl, PUBLIC_TABLES_QUERY);
  if (repairedTables === null || missingNames(schemaTableNames(), parseTableNames(repairedTables)).length) {
    die(
      'Required database tables are still missing or unreadable. Apply the missing migrations before deploying functions.',
    );
  }

  // 5) Deploy functions
  step(5, 'Deploying edge functions');
  const deployed = run(supaBin, [...supaPre, 'functions', 'deploy'], { allowFail: true });
  record(
    'Edge functions',
    deployed ? 'done' : 'failed',
    deployed ? '' : `retry: ${[supaBin, ...supaPre].join(' ')} functions deploy`,
  );

  // 6) Edge-function secrets — read what's already set, prompt only for what's missing.
  step(6, 'Edge-function secrets');
  const supaStr = [supaBin, ...supaPre].join(' ');
  const listRun = spawnSync(supaBin, [...supaPre, 'secrets', 'list', '-o', 'json'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  let existing = new Set<string>();
  if (listRun.status === 0) {
    existing = parseCliNames(listRun.stdout || '', true);
    ok(`found ${existing.size} secret(s) already set${existing.size ? `: ${[...existing].join(', ')}` : ''}`);
  } else {
    die(
      'Could not read existing secrets. Setup stopped to avoid replacing an existing encryption key. Link the project and retry.',
    );
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
    if (existing.has(key)) {
      ok(`${key} already set`);
      continue;
    }
    const fromEnv = (process.env[key] || '').trim();
    const val =
      fromEnv ||
      (await ask(
        `  ${C.cyan}${key}${C.reset} — ${why}\n    ${C.dim}(paste value, or press Enter to skip)${C.reset} > `,
      ));
    if (val) toSet.push(`${key}=${val}`);
    else if (required)
      warn(`${key} skipped — AI features will be degraded until you set it: ${supaStr} secrets set ${key}=...`);
    else warn(`${key} skipped`);
  }
  if (toSet.length > 0) {
    const setRun = setProjectSecrets(supaBin, supaPre, toSet);
    if (setRun.ok) {
      ok(`set ${toSet.length} secret(s)`);
      record('Secrets', 'done', `${toSet.length} set`);
    } else {
      err('secrets set failed');
      record('Secrets', 'failed', `retry: ${supaStr} secrets set KEY=value ...`);
    }
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
    srk = await ask(
      `  ${C.cyan}Service-role key${C.reset} — Dashboard → Settings > API Keys > Legacy keys > service_role\n    ${C.dim}(paste to enable, or press Enter to skip — you can re-run setup later)${C.reset} > `,
    );
  }
  if (!srk) {
    warn('skipped — Threat Research sessions will NOT run until this is configured.');
    warn(`Re-run bun run setup, or apply supabase/optional-scheduled-jobs.sql by hand.`);
    record('Threat Research & automation', 'skipped', 'no service-role key provided — Threat Research disabled');
  } else {
    const projectUrl = `https://${ref}.supabase.co`;
    if (classifySupabaseKey(srk) !== 'service_role') {
      die(
        'Automation requires the legacy service_role JWT from Settings > API Keys > Legacy keys. sb_secret and public keys are not supported by the current worker chain.',
      );
    }
    const automationSql = `select public.configure_background_automation(${sqlQuote(projectUrl)}, ${sqlQuote(srk)});`;
    log(`  ${C.dim}$ psql <db-url> (configure Vault and six cron jobs; values sent over stdin)${C.reset}`);
    const auto = runSql(dbUrl, automationSql);
    if (auto.ok) {
      ok('pg_cron + pg_net enabled, Vault secrets stored, cron jobs scheduled');
      if (!anthropicAvailable)
        warn('Threat Research also needs the ANTHROPIC_API_KEY secret (step 6) to run its agents.');
      record('Threat Research & automation', 'done');
    } else {
      err('automation setup failed:');
      log(`  ${C.dim}${auto.error.split('\n').slice(-3).join('\n  ')}${C.reset}`);
      warn('Apply supabase/optional-scheduled-jobs.sql manually in the Supabase SQL Editor.');
      record('Threat Research & automation', 'failed', 'apply supabase/optional-scheduled-jobs.sql manually');
    }
  }

  // 8) Verify with the install doctor
  step(8, 'Verifying the install (bun run setup:check)');
  const check = spawnSync('bun', ['scripts/setup-check.ts'], {
    stdio: 'inherit',
    env: { ...process.env, SUPABASE_DB_URL: dbUrl },
  });
  record(
    'Verification',
    check.status === 0 ? 'done' : 'failed',
    check.status === 0 ? '' : 'see failures above; fix and re-run bun run setup:check',
  );

  // ── Summary ──
  log(`\n${C.cyan}══ Setup summary ═══════════════════════════════════${C.reset}`);
  const icon: Record<Status, string> = {
    done: `${C.green}✓ done   ${C.reset}`,
    skipped: `${C.yellow}~ skipped${C.reset}`,
    failed: `${C.red}✗ FAILED ${C.reset}`,
  };
  for (const s of ledger) log(`  ${icon[s.status]} ${s.name}${s.note ? ` ${C.dim}— ${s.note}${C.reset}` : ''}`);
  const failed = ledger.filter((s) => s.status === 'failed');
  if (failed.length)
    log(
      `\n${C.yellow}Some steps need attention (notes above). Fix them and re-run ${C.cyan}bun run setup${C.yellow}.${C.reset}`,
    );

  log(`\n${C.green}Finish in the app:${C.reset}`);
  log(`  1. Create the first owner. Accounts need an invitation, so first run this in the SQL editor:`);
  log(`     ${C.dim}select public.bootstrap_first_owner('you@example.com');${C.reset}`);
  log(`     then add that email under Authentication → Users → Add user (tick "Auto Confirm User").`);
  log(`  2. Start the app:  ${C.cyan}bun run dev${C.reset}`);
  log(`  3. In-app: Settings → Data Sync → "Import MITRE Data", then "Refresh Scores".`);
  log(`  4. (Optional) Detection Finetuning needs a Microsoft Defender XDR integration plus a one-time`);
  log(`     ${C.dim}ANTHROPIC_API_KEY=... bun scripts/setup-finetune-agent.ts${C.reset} — see SETUP.md.`);
  log('');
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => die(redactSecrets(e?.message || String(e), [])));
