import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Derive the installation contract from the files that setup actually deploys. */
export function requiredTables(schema: string): string[] {
  const names = [...schema.matchAll(/^CREATE TABLE(?: IF NOT EXISTS)? public\.([a-z_][a-z0-9_]*)\s*\(/gim)].map(
    (match) => match[1],
  );
  if (!names.length) throw new Error('No public tables found in supabase/schema.sql');
  return [...new Set(names)].sort();
}

export function requiredEdgeFunctions(directory = 'supabase/functions'): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(directory, entry.name, 'index.ts')))
    .map((entry) => entry.name)
    .sort();
}

export function missingNames(required: Iterable<string>, actual: Iterable<string>): string[] {
  const found = new Set(actual);
  return [...required].filter((name) => !found.has(name));
}

/** psql returns one table per line; an empty database returns the empty string. */
export function parseTableNames(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export const PUBLIC_TABLES_QUERY =
  "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name";

export function schemaTableNames(): string[] {
  return requiredTables(readFileSync('supabase/schema.sql', 'utf8'));
}

/** Supports both CLI JSON envelopes and the NAME column in table output. */
export function parseCliNames(stdout: string, strict = false): Set<string> {
  const raw = stdout.trim();
  try {
    const data = JSON.parse(raw);
    const entries = Array.isArray(data) ? data : (data?.functions ?? data?.secrets);
    if (!Array.isArray(entries) || entries.some((entry) => !entry || typeof entry.name !== 'string')) {
      throw new Error('Unrecognized CLI response');
    }
    return new Set(
      entries
        .filter((entry: { name?: unknown }) => typeof entry.name === 'string')
        .map((entry: { name: string }) => entry.name),
    );
  } catch {
    if (strict)
      throw new Error('Could not parse the CLI secret inventory. Setup stopped to protect existing encryption keys.');
    const rows = raw.split(/\r?\n/).map((line) => line.split(/[|│]/).map((cell) => cell.trim()));
    const header = rows.findIndex((cells) => cells.includes('NAME'));
    if (header === -1) {
      return new Set();
    }
    const column = rows[header].indexOf('NAME');
    return new Set(
      rows
        .slice(header + 1)
        .map((cells) => cells[column])
        .filter((name) => name && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)),
    );
  }
}

// to_regprocedure returns NULL for a missing function instead of aborting the check.
export const WATCHDOG_QUERY = `
  select count(*) from pg_proc
   where oid = to_regprocedure('public.auto_digest_watchdog()')
     and pg_get_functiondef(oid) like '%auto_digest_job_entries%'
     and pg_get_functiondef(oid) like '%lease_expires_at%'
     and pg_get_functiondef(oid) like '%heartbeat_at%'
     and pg_get_functiondef(oid) like '%auto_digest_enqueue%'
     and pg_get_functiondef(oid) like '%quarantined%'
`;
