/**
 * Optimus Detection Studio — install doctor.
 *
 *   bun run setup:check
 *
 * Verifies a self-hosted install is healthy. Two tiers:
 *   • Always: .env.local is present + well-formed, and your Supabase REST API is
 *     reachable with your anon key.
 *   • Deep (if psql + SUPABASE_DB_URL are available): confirms the schema fully
 *     materialised — 62 tables, required extensions, the signup trigger, seed
 *     data, whether the MITRE knowledge base has been imported, and the
 *     Threat Research plumbing (pg_cron/pg_net, Vault secrets, cron jobs).
 *
 * Set SUPABASE_DB_URL to your connection string to enable the deep checks:
 *   SUPABASE_DB_URL="postgresql://..." bun run setup:check
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const C = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', dim: '\x1b[2m', cyan: '\x1b[36m' };
let failures = 0, warnings = 0;
const pass = (m: string, d = '') => console.log(`  ${C.green}✓${C.reset} ${m}${d ? ` ${C.dim}(${d})${C.reset}` : ''}`);
const fail = (m: string, d = '') => { failures++; console.log(`  ${C.red}✗${C.reset} ${m}${d ? ` ${C.dim}(${d})${C.reset}` : ''}`); };
const warn = (m: string, d = '') => { warnings++; console.log(`  ${C.yellow}!${C.reset} ${m}${d ? ` ${C.dim}(${d})${C.reset}` : ''}`); };
const head = (m: string) => console.log(`\n${C.cyan}${m}${C.reset}`);

function parseEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
function has(bin: string, pre: string[] = []): boolean {
  const r = spawnSync(bin, [...pre, '--version'], { stdio: 'ignore', timeout: 10_000 });
  return r.status === 0;
}
/** Run a fixed SQL query via psql; returns trimmed scalar or null. dbUrl + query are our own, no shell. */
function psqlScalar(dbUrl: string, query: string): string | null {
  const r = spawnSync('psql', [dbUrl, '-tAc', query], { encoding: 'utf8', timeout: 20_000 });
  if (r.status !== 0) return null;
  return (r.stdout || '').trim();
}
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

async function main() {
  console.log(`${C.cyan}Optimus Detection Studio — install doctor${C.reset}`);

  // ── Environment ──
  head('Environment');
  const env = parseEnv('.env.local');
  if (!existsSync('.env.local')) fail('.env.local missing', 'cp .env.example .env.local');
  else pass('.env.local present');
  const url = env.VITE_SUPABASE_URL || '';
  const anon = env.VITE_SUPABASE_ANON_KEY || '';
  if (url.match(/^https:\/\/[a-z0-9]+\.supabase\.co/i)) pass('VITE_SUPABASE_URL', url); else fail('VITE_SUPABASE_URL missing/invalid');
  if (anon.startsWith('eyJ')) pass('VITE_SUPABASE_ANON_KEY', 'looks like a JWT'); else fail('VITE_SUPABASE_ANON_KEY missing/invalid');

  // ── Reachability ──
  head('Supabase reachability');
  if (url && anon) {
    try {
      const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: anon } });
      if (res.status < 500) pass('REST API reachable', `HTTP ${res.status}`); else fail('REST API error', `HTTP ${res.status}`);
      const auth = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anon } });
      if (auth.status < 500) pass('Auth service reachable', `HTTP ${auth.status}`); else warn('Auth health unexpected', `HTTP ${auth.status}`);
    } catch (e) {
      fail('could not reach Supabase', String((e as Error).message));
    }
  } else warn('skipped (URL/anon not set)');

  // ── Deep schema checks (need psql + SUPABASE_DB_URL) ──
  head('Schema (deep checks)');
  const dbUrl = process.env.SUPABASE_DB_URL || env.SUPABASE_DB_URL || '';
  if (!has('psql')) warn('psql not installed — skipping deep checks');
  else if (!dbUrl) warn('SUPABASE_DB_URL not set — skipping deep checks', 'SUPABASE_DB_URL="postgresql://..." bun run setup:check');
  else {
    const tables = psqlScalar(dbUrl, "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
    if (tables === null) fail('could not connect with SUPABASE_DB_URL');
    else if (Number(tables) === 62) pass('public tables', `${tables}/62`);
    else fail('unexpected table count', `${tables}, expected 62`);

    const autoDigestColumns = psqlScalar(dbUrl, `
      select count(*)
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'auto_digest_jobs'
         and column_name in ('active_entry_id', 'heartbeat_at')
    `);
    if (Number(autoDigestColumns) === 2) pass('auto-digest watchdog columns', 'active_entry_id + heartbeat_at');
    else fail('auto-digest watchdog columns missing', `${autoDigestColumns ?? 0}/2 — run bun run setup`);

    const watchdogDefinition = psqlScalar(dbUrl, `
      select count(*)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid = 'public.auto_digest_watchdog()'::regprocedure
         and pg_get_functiondef(p.oid) like '%active_entry_id%'
         and pg_get_functiondef(p.oid) like '%heartbeat_at%'
         and pg_get_functiondef(p.oid) like '%digest_failed%'
    `);
    if (Number(watchdogDefinition) === 1) pass('auto-digest watchdog function', 'heartbeat-aware recovery');
    else fail('auto-digest watchdog function outdated', 'run bun run setup');

    const ext = psqlScalar(dbUrl, "select string_agg(extname,',' order by extname) from pg_extension where extname in ('vector','pg_trgm','pgcrypto','uuid-ossp')");
    if (ext && ['vector', 'pg_trgm', 'pgcrypto'].every((e) => ext.includes(e)))
      pass('required extensions', ext);
    else fail('missing required extensions', ext || 'none');

    const trig = psqlScalar(dbUrl, "select count(*) from pg_trigger where tgname='on_auth_user_created'");
    if (Number(trig) === 1) pass('signup trigger (on_auth_user_created)'); else fail('signup trigger missing', 'new users will get no profile');

    const seed = psqlScalar(dbUrl, "select count(*) from public.mitre_tactic_weights");
    if (Number(seed) >= 42) pass('scoring seed (mitre_tactic_weights)', `${seed} rows`); else warn('scoring seed low/missing', `${seed} rows`);

    const mitre = psqlScalar(dbUrl, "select count(*) from public.mitre_objects");
    if (Number(mitre) > 0) pass('MITRE knowledge base imported', `${mitre} objects`);
    else warn('MITRE data not imported yet', 'in-app: Settings → Data Sync → Import MITRE Data');

    const rt = psqlScalar(dbUrl, "select count(*) from pg_publication_tables where pubname='supabase_realtime'");
    if (Number(rt) >= 8) pass('realtime publication', `${rt} tables`); else warn('realtime tables missing', `${rt}/8`);

    // ── Threat Research & background automation ──
    // The in-app Threat Research feature dispatches jobs over pg_net using a
    // service-role key stored in Vault. Without these, sessions stall in
    // "pending" forever with no visible error.
    head('Threat Research & automation');
    const autoExt = psqlScalar(dbUrl, "select string_agg(extname,',' order by extname) from pg_extension where extname in ('pg_cron','pg_net')") ?? '';
    if (autoExt.includes('pg_cron') && autoExt.includes('pg_net')) pass('pg_cron + pg_net enabled');
    else warn('pg_cron/pg_net not enabled', `found: ${autoExt || 'none'} — run bun run setup (step 7) or supabase/optional-scheduled-jobs.sql`);

    const vaultSecrets = psqlScalar(dbUrl, "select count(*) from vault.secrets where name in ('tr_supabase_url','tr_service_role_key')");
    if (Number(vaultSecrets) === 2) pass('Vault secrets (tr_supabase_url, tr_service_role_key)');
    else warn('Vault secrets missing — Threat Research sessions will stall in pending', `${vaultSecrets ?? 0}/2 — run bun run setup (step 7) or supabase/optional-scheduled-jobs.sql`);

    const cronJobs = psqlScalar(dbUrl, "select count(*) from cron.job where jobname in ('ai_usage_rollup','threat-research-dispatcher','auto-digest-watchdog','auto-digest-scheduler','auto-digest-queue-consumer','pack-deploy-dispatcher')");
    if (Number(cronJobs) === 6) pass('scheduled jobs (dispatcher, watchdog, digest, rollup, queue, packs)', '6/6');
    else if (cronJobs === null) warn('cron jobs not readable (pg_cron missing?)', 'run bun run setup (step 7)');
    else warn('scheduled jobs missing', `${cronJobs}/6 — Background recovery or scheduled jobs unavailable; run bun run setup (step 7)`);
  }

  // ── Edge functions ──
  head('Edge functions');
  const supa = has('supabase') ? ['supabase', []] as const : has('npx', ['supabase']) ? ['npx', ['supabase']] as const : has('bunx', ['supabase']) ? ['bunx', ['supabase']] as const : null;
  if (!supa) warn('supabase CLI not found — skipping function check');
  else {
    const r = spawnSync(supa[0], [...supa[1], 'functions', 'list', '-o', 'json'], { encoding: 'utf8', timeout: 15_000 });
    if (r.error && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
      warn('function check timed out', 'run `supabase functions list` after `supabase link`');
    } else if (r.status !== 0) warn('could not list functions', 'run `supabase link` first');
    else {
      const deployed = parseCliNames(r.stdout || '').size;
      if (deployed >= 19) pass('edge functions deployed', `${deployed}`); else warn('some edge functions not deployed', `${deployed}/19 — run \`supabase functions deploy\``);
    }

    const sr = spawnSync(supa[0], [...supa[1], 'secrets', 'list', '-o', 'json'], { encoding: 'utf8', timeout: 15_000 });
    if (sr.status !== 0) warn('could not list edge-function secrets', 'run `supabase link` first');
    else {
      const names = parseCliNames(sr.stdout || '');
      if (names.has('GEMINI_API_KEY')) pass('GEMINI_API_KEY set');
      else warn('GEMINI_API_KEY not set', 'semantic search / playbooks / digest degraded — supabase secrets set GEMINI_API_KEY=...');
      if (names.has('INTEGRATION_ENCRYPTION_KEY')) pass('INTEGRATION_ENCRYPTION_KEY set');
      else warn('INTEGRATION_ENCRYPTION_KEY not set', 'SIEM integrations will not work — bun run setup generates one');
      if (names.has('ANTHROPIC_API_KEY')) pass('ANTHROPIC_API_KEY set');
      else warn('ANTHROPIC_API_KEY not set', 'Threat Research + Detection Finetuning need it — supabase secrets set ANTHROPIC_API_KEY=...');
    }
  }

  // ── Summary ──
  console.log('');
  if (failures === 0 && warnings === 0) console.log(`${C.green}All checks passed. You're good to go.${C.reset}`);
  else console.log(`${failures ? C.red : C.yellow}${failures} failure(s), ${warnings} warning(s).${C.reset}`);
  process.exit(failures ? 1 : 0);
}

main();
