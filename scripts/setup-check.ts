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
 *     data, and whether the MITRE knowledge base has been imported.
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
    if (Number(rt) >= 7) pass('realtime publication', `${rt} tables`); else warn('realtime tables missing', `${rt}/7`);
  }

  // ── Edge functions ──
  head('Edge functions');
  const supa = has('supabase') ? ['supabase', []] as const : has('npx', ['supabase']) ? ['npx', ['supabase']] as const : has('bunx', ['supabase']) ? ['bunx', ['supabase']] as const : null;
  if (!supa) warn('supabase CLI not found — skipping function check');
  else {
    const r = spawnSync(supa[0], [...supa[1], 'functions', 'list'], { encoding: 'utf8', timeout: 15_000 });
    if (r.error && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
      warn('function check timed out', 'run `supabase functions list` after `supabase link`');
    } else if (r.status !== 0) warn('could not list functions', 'run `supabase link` first');
    else {
      const deployed = (r.stdout || '').split('\n').filter((l) => /\S/.test(l)).length - 1; // minus header
      if (deployed >= 19) pass('edge functions deployed', `${deployed}`); else warn('some edge functions not deployed', `${deployed}/19 — run \`supabase functions deploy\``);
    }
  }

  // ── Summary ──
  console.log('');
  if (failures === 0 && warnings === 0) console.log(`${C.green}All checks passed. You're good to go.${C.reset}`);
  else console.log(`${failures ? C.red : C.yellow}${failures} failure(s), ${warnings} warning(s).${C.reset}`);
  process.exit(failures ? 1 : 0);
}

main();
