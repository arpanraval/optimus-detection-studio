/**
 * Recompute library coverage on every stored threat intel report.
 *
 * Coverage is contextual: a rule covers a TTP only when its query logic checks
 * the concrete identifiers in that TTP's evidence (see library-matcher.ts).
 * New digests do this on their own; this rewrites the reports already stored.
 *
 * It runs the digest's own `matchLibrary`, so a backfilled report is identical
 * to one produced by a Refresh on the Library Coverage panel. The detection
 * library, query text included, is read once rather than once per report.
 *
 * Dry run by default -- prints old -> new coverage per report. Pass --apply to
 * write; the overwritten columns are first saved to BACKUP_PATH (or a
 * timestamped JSON file in the working directory).
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... bun run scripts/backfill-threat-intel-coverage.ts [--apply]
 *
 * The URL comes from SUPABASE_URL, falling back to VITE_SUPABASE_URL in
 * .env.local. The service-role key is never read from a file.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parseEnvText } from './setup-input';
import { matchLibrary, type LibraryDetection } from '../supabase/functions/threat-intel-digest-v2/lib/library-matcher';

const APPLY = process.argv.includes('--apply');
const PAGE = 1000;

const localEnv = existsSync('.env.local') ? parseEnvText(readFileSync('.env.local', 'utf8')) : {};
const url = process.env.SUPABASE_URL || localEnv.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY (and SUPABASE_URL, or VITE_SUPABASE_URL in .env.local).');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function readAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

interface ReportRow {
  id: string;
  user_id: string;
  ttps: Array<{ mitreId?: string }> | null;
  mitre_mapping: { matchedTechniques?: Array<{ mitreId?: string; isValid?: boolean }> } | null;
  coverage_percent: number | null;
}

const overlap = (covered: Set<string>, ids: Set<string>) =>
  ids.size > 0 ? Math.round(([...covered].filter(id => ids.has(id)).length / ids.size) * 100) : null;

async function main() {
  const detections = await readAll<LibraryDetection>(
    'detections',
    'id, name, mitreAttackIds, linkedGroups, status, severity, user_id, visibility, detectionQuery, queryLanguage',
  );
  const reports = await readAll<ReportRow>(
    'threat_intel_reports',
    'id, user_id, ttps, mitre_mapping, coverage_percent, library_matches, library_overlap_percent, validated_overlap_percent, overlap_calculated_at',
  );
  console.log(`${detections.length} detections, ${reports.length} reports — ${APPLY ? 'APPLYING' : 'dry run'}\n`);

  // The columns this script overwrites, as they were, so --apply can be undone.
  if (APPLY) {
    const backupPath = process.env.BACKUP_PATH || `threat-intel-coverage-backup-${Date.now()}.json`;
    writeFileSync(backupPath, JSON.stringify(reports.map(({ mitre_mapping: _m, ...row }) => row)));
    console.log(`Backed up ${reports.length} reports to ${backupPath}\n`);
  }

  const log = console.log;
  const grades: Record<string, number> = {};
  let changed = 0;
  let skipped = 0;

  for (const report of reports) {
    const ttps = Array.isArray(report.ttps) ? report.ttps : [];
    if (ttps.length === 0) { skipped++; continue; }

    const result = matchLibrary(ttps as never, (report.mitre_mapping ?? {}) as never, detections, report.user_id);
    if (!result.computed) { skipped++; continue; }
    for (const t of ttps as Array<{ coverageGrade?: string }>) {
      grades[t.coverageGrade ?? 'none'] = (grades[t.coverageGrade ?? 'none'] ?? 0) + 1;
    }

    // Same arithmetic as threat-intel-digest-v2/index.ts Stage 8.
    const covered = new Set(result.matches.flatMap(m => m.matchedTTPs ?? []));
    const extracted = new Set(ttps.map(t => t.mitreId).filter((id): id is string => !!id));
    const validated = new Set((report.mitre_mapping?.matchedTechniques ?? [])
      .filter(t => t.isValid).map(t => t.mitreId).filter((id): id is string => !!id));
    const libraryOverlap = overlap(covered, extracted);

    log(`${report.id}  ${report.coverage_percent ?? '—'}% -> ${libraryOverlap ?? '—'}%  (${result.matches.length} rules)`);
    if (libraryOverlap !== report.coverage_percent) changed++;

    if (APPLY) {
      const { error } = await supabase.from('threat_intel_reports').update({
        ttps,
        library_matches: result.matches,
        coverage_percent: libraryOverlap,
        library_overlap_percent: libraryOverlap,
        validated_overlap_percent: overlap(covered, validated),
        overlap_calculated_at: new Date().toISOString(),
      }).eq('id', report.id);
      if (error) console.error(`  failed: ${error.message}`);
    }
  }

  log(`\nTTP grades: ${JSON.stringify(grades)}`);
  log(`${changed} reports change coverage, ${skipped} skipped (no TTPs).${APPLY ? '' : ' Re-run with --apply to write.'}`);
}

main().catch(err => { console.error(err); process.exit(1); });
