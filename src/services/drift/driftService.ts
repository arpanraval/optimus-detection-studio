/**
 * driftService — browser-side orchestration + persistence for upstream drift.
 *
 * Wraps the pure {@link DriftComparator} engine: loads the "known state" for a
 * source from the DB, runs the comparison, and persists the result into the
 * `detection_drift` table. Also provides the read queries that power the badges
 * (library button, sidebar, Data Sync header) and the per-source / per-detection
 * views.
 *
 * Admin-gated in practice (the Data Sync page is admin-only); the read queries
 * are RLS-scoped so non-admins still see drift badges for detections they can
 * see.
 */

import { supabase } from '../../lib/supabaseClient';
import { githubFetcher } from '../bulk-import/fetchers/GitHubFetcher';
import { parserFactory } from '../bulk-import/parsers/ParserFactory';
import { duplicateDetector } from '../bulk-import/validators/DuplicateDetector';
import type { Detection } from '../../types';
import type { VendorMetadata, VendorFormat } from '../bulk-import/types';
import type { LibraryType } from '../../constants/library';
import { DriftComparator, isPinnedRef, type KnownBaseline } from './DriftComparator';
import { sha256HexOrNull } from './hash';
import type {
  DriftSource,
  DriftSourceWithStats,
  DriftCheckResult,
  DriftCheckProgress,
  DriftItem,
  DriftRow,
  DriftState,
  DriftResolution,
  DriftSummary,
  SourceReachability,
  DriftCard,
  DriftVendorCard,
} from './types';

// ---------------------------------------------------------------------------
// Source discovery
// ---------------------------------------------------------------------------

interface GithubImportJobRow {
  id: string;
  source_url: string | null;
  source_vendor: string | null;
  target_library: string;
}

/** Parse a github URL into the display bits + a "pinned" flag. */
function describeSource(sourceUrl: string, vendor: string, targetLibrary: string): DriftSource {
  const parsed = githubFetcher.parseUrl(sourceUrl);
  return {
    sourceUrl,
    vendor: (vendor as VendorFormat) ?? 'sigma',
    targetLibrary: targetLibrary as LibraryType,
    owner: parsed?.owner,
    repo: parsed?.repo,
    ref: parsed?.branch,
    subdir: parsed?.path,
    pinned: isPinnedRef(parsed?.branch),
  };
}

/**
 * All drift-trackable sources: distinct (source_url, target_library) across
 * *completed* GitHub import jobs that have a URL we can re-fetch. Re-imports
 * collapse to one source. Vendor is the job's source_vendor (often 'mixed').
 */
export async function listDriftSources(): Promise<DriftSourceWithStats[]> {
  const { data: jobs, error } = await supabase
    .from('bulk_import_jobs')
    .select('id, source_url, source_vendor, target_library')
    .eq('source_type', 'github')
    .eq('status', 'completed')
    .not('source_url', 'is', null);
  if (error) throw new Error(`Failed to list import sources: ${error.message}`);

  // Collapse to distinct (source_url, target_library)
  const byKey = new Map<string, { source: DriftSource; jobIds: string[] }>();
  for (const job of (jobs ?? []) as GithubImportJobRow[]) {
    if (!job.source_url) continue;
    const key = `${job.source_url}::${job.target_library}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.jobIds.push(job.id);
    } else {
      byKey.set(key, {
        source: describeSource(job.source_url, job.source_vendor ?? 'sigma', job.target_library),
        jobIds: [job.id],
      });
    }
  }

  // Pull persisted drift stats per (source_url, target_library) in one query.
  const { data: driftRows, error: dErr } = await supabase
    .from('detection_drift')
    .select('source_url, target_library, drift_state, last_checked_at');
  if (dErr) throw new Error(`Failed to load drift stats: ${dErr.message}`);

  const statsByKey = new Map<string, { tracked: number; drifted: number; conflicts: number; removed: number; dismissed: number; lastCheckedAt: string | null }>();
  for (const row of (driftRows ?? []) as Array<{ source_url: string; target_library: string; drift_state: DriftState; last_checked_at: string | null }>) {
    const key = `${row.source_url}::${row.target_library}`;
    const s = statsByKey.get(key) ?? { tracked: 0, drifted: 0, conflicts: 0, removed: 0, dismissed: 0, lastCheckedAt: null };
    s.tracked++;
    if (row.drift_state === 'upstream_changed') s.drifted++;
    if (row.drift_state === 'conflict') { s.drifted++; s.conflicts++; }
    if (row.drift_state === 'upstream_removed') s.removed++;
    if (row.drift_state === 'dismissed') s.dismissed++;
    if (row.last_checked_at && (!s.lastCheckedAt || row.last_checked_at > s.lastCheckedAt)) s.lastCheckedAt = row.last_checked_at;
    statsByKey.set(key, s);
  }

  const out: DriftSourceWithStats[] = [];
  for (const [key, { source }] of byKey) {
    const s = statsByKey.get(key);
    out.push({
      ...source,
      tracked: s?.tracked ?? 0,
      drifted: s?.drifted ?? 0,
      conflicts: s?.conflicts ?? 0,
      removed: s?.removed ?? 0,
      newUpstream: 0,        // only known after a check; not persisted in v1
      dismissed: s?.dismissed ?? 0,
      untrackable: 0,        // computed during a check
      reachability: source.pinned ? 'pinned' : 'ok',
      lastCheckedAt: s?.lastCheckedAt ?? null,
    });
  }
  // Stable order: most-recently-checked first, then by repo name.
  out.sort((a, b) => {
    if (a.lastCheckedAt && b.lastCheckedAt) return b.lastCheckedAt.localeCompare(a.lastCheckedAt);
    if (a.lastCheckedAt) return -1;
    if (b.lastCheckedAt) return 1;
    return `${a.owner}/${a.repo}`.localeCompare(`${b.owner}/${b.repo}`);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Grouped vendor cards (1 card per known vendor with subdir entries inside)
// ---------------------------------------------------------------------------

/** Owners we treat as "known canonical vendors" — their subdirs collapse into a single card. */
const CANONICAL_OWNERS = new Set([
  'sigmahq', 'splunk', 'elastic', 'azure', 'chronicle', 'crowdstrike', 'mitre-attack', 'google',
]);

function isCanonicalOwner(owner?: string): boolean {
  return !!owner && CANONICAL_OWNERS.has(owner.toLowerCase());
}

/**
 * Group `listDriftSources()` into vendor cards. Each card collapses every
 * imported subdir of the same `(owner, repo, target_library)` for known
 * vendors. Forks/non-canonical sources stay as single-source cards.
 */
export async function listDriftCards(): Promise<DriftCard[]> {
  const sources = await listDriftSources();
  const vendorMap = new Map<string, DriftVendorCard>();
  const out: DriftCard[] = [];

  for (const s of sources) {
    if (!s.owner || !s.repo || !isCanonicalOwner(s.owner)) {
      out.push({ kind: 'custom', source: s });
      continue;
    }
    // One card per (owner, repo) regardless of library — subdir rows still
    // carry their own library badge so the destination is visible per row.
    const key = `${s.owner.toLowerCase()}/${s.repo.toLowerCase()}`;
    let card = vendorMap.get(key);
    if (!card) {
      card = {
        kind: 'vendor',
        key,
        owner: s.owner,
        repo: s.repo,
        vendor: s.vendor,
        totalTracked: 0,
        totalDrifted: 0,
        totalConflicts: 0,
        totalRemoved: 0,
        totalNewUpstream: 0,
        totalUntrackable: 0,
        lastCheckedAt: null,
        subdirs: [],
      };
      vendorMap.set(key, card);
      out.push(card);
    }
    card.subdirs.push(s);
    card.totalTracked    += s.tracked;
    card.totalDrifted    += s.drifted;
    card.totalConflicts  += s.conflicts;
    card.totalRemoved    += s.removed;
    card.totalNewUpstream += s.newUpstream;
    card.totalUntrackable += s.untrackable;
    if (s.lastCheckedAt && (!card.lastCheckedAt || s.lastCheckedAt > card.lastCheckedAt)) {
      card.lastCheckedAt = s.lastCheckedAt;
    }
  }

  // Within each vendor card, order subdirs by recently-checked then by subdir path.
  for (const card of vendorMap.values()) {
    card.subdirs.sort((a, b) => {
      if (a.lastCheckedAt && b.lastCheckedAt) return b.lastCheckedAt.localeCompare(a.lastCheckedAt);
      if (a.lastCheckedAt) return -1;
      if (b.lastCheckedAt) return 1;
      return (a.subdir ?? '').localeCompare(b.subdir ?? '');
    });
  }

  // Order cards: most recently active first, then alphabetic by owner/repo (vendor) or owner (custom).
  out.sort((a, b) => {
    const aChecked = a.kind === 'vendor' ? a.lastCheckedAt : a.source.lastCheckedAt;
    const bChecked = b.kind === 'vendor' ? b.lastCheckedAt : b.source.lastCheckedAt;
    if (aChecked && bChecked) return bChecked.localeCompare(aChecked);
    if (aChecked) return -1;
    if (bChecked) return 1;
    const aLabel = a.kind === 'vendor' ? `${a.owner}/${a.repo}` : `${a.source.owner ?? ''}/${a.source.repo ?? ''}`;
    const bLabel = b.kind === 'vendor' ? `${b.owner}/${b.repo}` : `${b.source.owner ?? ''}/${b.source.repo ?? ''}`;
    return aLabel.localeCompare(bLabel);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Known-state loading (source-scoped)
// ---------------------------------------------------------------------------

interface DetectionRowForDrift {
  id: string;
  external_id: string | null;
  version: number | null;
  updatedDate: string | null;
  updated_by: string | null;
  detectionQuery: string | null;
  severity: string | null;
  description: string | null;
  mitreAttackIds: string[] | null;
  mitreTactics: string[] | null;
  mitreTechniques: string[] | null;
  references: string[] | null;
  tags: string[] | null;
  vendor_metadata: VendorMetadata | Record<string, unknown> | null;
  user_id: string;
  name: string | null;
}

interface PriorDriftRow {
  detection_id: string;
  drift_state: DriftState;
  upstream_path: string | null;
  upstream_blob_sha: string | null;
  baseline_hash: string | null;
  upstream_hash: string | null;
  upstream_raw_snapshot: string | null;
  field_diffs: unknown;
  resolution: DriftResolution | null;
  resolved_at: string | null;
  resolved_by: string | null;
}

interface KnownState {
  knownBaselines: Map<string, KnownBaseline>;
  existingDetections: Map<string, Partial<Detection>>;
  siblingsByExternalId: Map<string, string[]>;
  untrackableCount: number;
  priorRows: Map<string, PriorDriftRow>;
}

/** Job ids backing a (source_url, target_library) source. */
async function jobIdsForSource(source: DriftSource): Promise<string[]> {
  const { data, error } = await supabase
    .from('bulk_import_jobs')
    .select('id')
    .eq('source_type', 'github')
    .eq('status', 'completed')
    .eq('source_url', source.sourceUrl)
    .eq('target_library', source.targetLibrary);
  if (error) throw new Error(`Failed to resolve import jobs: ${error.message}`);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

export async function loadKnownState(source: DriftSource): Promise<KnownState> {
  const jobIds = await jobIdsForSource(source);
  if (jobIds.length === 0) {
    return { knownBaselines: new Map(), existingDetections: new Map(), siblingsByExternalId: new Map(), untrackableCount: 0, priorRows: new Map() };
  }

  const { data: rows, error } = await supabase
    .from('detections')
    .select('id, external_id, version, "updatedDate", updated_by, "detectionQuery", severity, description, "mitreAttackIds", "mitreTactics", "mitreTechniques", references, tags, vendor_metadata, user_id, name')
    .in('bulk_import_id', jobIds)
    .eq('library_type', source.targetLibrary);
  if (error) throw new Error(`Failed to load detections for source: ${error.message}`);

  const detRows = (rows ?? []) as DetectionRowForDrift[];

  // Prior drift rows for these detections (carry-forward + dismissal awareness).
  const detIds = detRows.map((r) => r.id);
  const priorRows = new Map<string, PriorDriftRow>();
  // Supabase .in() handles large lists; chunk to be safe.
  for (let i = 0; i < detIds.length; i += 500) {
    const chunk = detIds.slice(i, i + 500);
    const { data: pr, error: pErr } = await supabase
      .from('detection_drift')
      .select('detection_id, drift_state, upstream_path, upstream_blob_sha, baseline_hash, upstream_hash, upstream_raw_snapshot, field_diffs, resolution, resolved_at, resolved_by')
      .in('detection_id', chunk);
    if (pErr) throw new Error(`Failed to load prior drift rows: ${pErr.message}`);
    for (const row of (pr ?? []) as PriorDriftRow[]) priorRows.set(row.detection_id, row);
  }

  // Group by external_id; first (id-sorted) is tracked, rest are siblings.
  const byExternalId = new Map<string, DetectionRowForDrift[]>();
  let untrackableCount = 0;
  for (const r of detRows) {
    if (!r.external_id) { untrackableCount++; continue; }
    const arr = byExternalId.get(r.external_id) ?? [];
    arr.push(r);
    byExternalId.set(r.external_id, arr);
  }

  const knownBaselines = new Map<string, KnownBaseline>();
  const existingDetections = new Map<string, Partial<Detection>>();
  const siblingsByExternalId = new Map<string, string[]>();

  for (const [externalId, group] of byExternalId) {
    group.sort((a, b) => a.id.localeCompare(b.id));
    const primary = group[0];
    if (group.length > 1) siblingsByExternalId.set(externalId, group.map((g) => g.id));

    const vm = (primary.vendor_metadata ?? {}) as Partial<VendorMetadata>;
    const baselineRaw = typeof vm.rawContent === 'string' ? vm.rawContent : undefined;
    const baselineHash = await sha256HexOrNull(baselineRaw);
    const prior = priorRows.get(primary.id);

    knownBaselines.set(externalId, {
      detectionId: primary.id,
      userId: primary.user_id,
      detectionName: primary.name ?? externalId,
      baselineRaw,
      baselineHash,
      localQuery: primary.detectionQuery ?? undefined,
      localContent: undefined, // not re-serialised in v1; conflict falls back to version/updatedDate
      importedAt: typeof vm.importedAt === 'string' ? vm.importedAt : undefined,
      version: primary.version ?? undefined,
      updatedAt: primary.updatedDate ?? undefined,
      updatedBy: primary.updated_by ?? null,
      lastUpstreamPath: prior?.upstream_path ?? null,
      lastBlobSha: prior?.upstream_blob_sha ?? null,
      lastUpstreamHash: prior?.upstream_hash ?? null,
      dismissed: prior?.drift_state === 'dismissed',
    });

    existingDetections.set(externalId, {
      detectionQuery: primary.detectionQuery ?? '',
      severity: (primary.severity ?? undefined) as Detection['severity'] | undefined,
      description: primary.description ?? '',
      // ATT&CK IDs (canonical), not the resolver's NAME column.
      mitreAttackIds: primary.mitreAttackIds ?? [],
      mitreTechniques: primary.mitreTechniques ?? [],
      tags: primary.tags ?? [],
    } as Partial<Detection>);
  }

  return { knownBaselines, existingDetections, siblingsByExternalId, untrackableCount, priorRows };
}

// ---------------------------------------------------------------------------
// Run a drift check + persist
// ---------------------------------------------------------------------------

/** drift states for which the upstream snapshot is worth keeping (review needs it). */
const SNAPSHOT_RETAINING_STATES: DriftState[] = ['upstream_changed', 'conflict', 'dismissed'];

function fieldDiffsEqual(a: unknown, b: unknown): boolean {
  // Cheap structural equality — field_diffs is a small JSONB array.
  try { return JSON.stringify(a ?? []) === JSON.stringify(b ?? []); } catch { return false; }
}

function buildDriftRows(result: DriftCheckResult, known: KnownState): DriftRow[] {
  const baselineByDetectionId = new Map<string, KnownBaseline>();
  for (const b of known.knownBaselines.values()) baselineByDetectionId.set(b.detectionId, b);

  const rows: DriftRow[] = [];
  for (const item of result.items) {
    const baseline = baselineByDetectionId.get(item.detectionId);
    const prior = known.priorRows.get(item.detectionId);
    if (!baseline) continue; // shouldn't happen

    // resolution / resolved_* handling on a re-check:
    //  - dismissed       → keep the prior dismissal bookkeeping
    //  - in_sync         → keep prior resolution (could be 'accepted'/'kept_mine'/null)
    //  - actionable      → clear (it's drifted again)
    let resolution: DriftResolution | null;
    let resolvedAt: string | null;
    let resolvedBy: string | null;
    if (item.driftState === 'dismissed') {
      resolution = 'dismissed';
      resolvedAt = prior?.resolved_at ?? null;
      resolvedBy = prior?.resolved_by ?? null;
    } else if (item.driftState === 'in_sync') {
      resolution = prior?.resolution ?? null;
      resolvedAt = prior?.resolved_at ?? null;
      resolvedBy = prior?.resolved_by ?? null;
    } else {
      resolution = null;
      resolvedAt = null;
      resolvedBy = null;
    }

    // Only keep the (potentially large) upstream raw snapshot when the row is
    // actionable — in_sync rows don't need it, and storing it for thousands of
    // unchanged rules wastes table + WAL space.
    const retainSnapshot = SNAPSHOT_RETAINING_STATES.includes(item.driftState);
    const upstreamRawSnapshot = retainSnapshot
      ? (item.upstreamRaw ?? prior?.upstream_raw_snapshot ?? null)
      : null;

    // Skip the upsert when nothing relevant has changed since the last check.
    // Avoids rewriting thousands of identical rows on every re-check
    // (PostgreSQL WAL bloat / dead-tuple pressure). last_checked_at is updated
    // at the source level via getDriftSummary aggregations.
    if (
      prior &&
      prior.drift_state === item.driftState &&
      (prior.baseline_hash ?? null) === ((item.baselineHash ?? prior.baseline_hash) ?? null) &&
      (prior.upstream_hash ?? null) === ((item.upstreamHash ?? prior.upstream_hash) ?? null) &&
      fieldDiffsEqual(prior.field_diffs, item.fieldDiffs ?? [])
    ) {
      continue;
    }

    rows.push({
      detection_id: item.detectionId,
      user_id: baseline.userId,
      source_url: result.source.sourceUrl,
      source_vendor: result.source.vendor,
      target_library: result.source.targetLibrary,
      external_id: item.externalId,
      upstream_path: item.upstreamPath ?? prior?.upstream_path ?? null,
      upstream_blob_sha: item.upstreamBlobSha ?? prior?.upstream_blob_sha ?? null,
      baseline_hash: item.baselineHash ?? prior?.baseline_hash ?? null,
      upstream_hash: item.upstreamHash ?? prior?.upstream_hash ?? null,
      upstream_raw_snapshot: upstreamRawSnapshot,
      drift_state: item.driftState,
      field_diffs: item.fieldDiffs ?? [],
      last_checked_at: result.checkedAt,
      resolved_at: resolvedAt,
      resolved_by: resolvedBy,
      resolution,
    });
  }
  return rows;
}

export interface RunDriftCheckOptions {
  token?: string;
  onProgress?: (p: DriftCheckProgress) => void;
}

/**
 * Run a drift check for one source and persist the result. On an unreachable
 * source the persisted rows are left untouched (only stats reflect the failure).
 */
export async function runDriftCheck(source: DriftSource, opts: RunDriftCheckOptions = {}): Promise<DriftCheckResult> {
  await parserFactory.initialize();
  const known = await loadKnownState(source);

  const comparator = new DriftComparator({
    fetcher: githubFetcher,
    parse: (content, fileName, filePath) => parserFactory.parse(content, fileName, filePath),
    compareFields: (incoming, existing) => duplicateDetector.compareFields(incoming, existing),
  });

  const result = await comparator.compareSource(source, {
    token: opts.token,
    knownBaselines: known.knownBaselines,
    existingDetections: known.existingDetections,
    siblingsByExternalId: known.siblingsByExternalId,
    untrackableCount: known.untrackableCount,
    onProgress: opts.onProgress,
  });
  result.counts.untrackable = known.untrackableCount;

  if (result.reachability === 'ok') {
    opts.onProgress?.({ phase: 'persisting', current: 0, total: result.items.length, message: 'Saving results…' });
    const rows = buildDriftRows(result, known);
    if (rows.length > 0) {
      // Upsert in chunks to stay well under request-size limits.
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase.from('detection_drift').upsert(chunk, { onConflict: 'detection_id' });
        if (error) throw new Error(`Failed to persist drift rows: ${error.message}`);
      }
    }
    opts.onProgress?.({ phase: 'done', current: result.items.length, total: result.items.length, message: 'Done.' });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Read queries (badges + views)
// ---------------------------------------------------------------------------

const ACTIONABLE_STATES: DriftState[] = ['upstream_changed', 'conflict', 'upstream_removed'];

export async function getDriftSummary(): Promise<DriftSummary> {
  const { data, error } = await supabase
    .from('detection_drift')
    .select('source_url, source_vendor, target_library, drift_state, last_checked_at');
  if (error) throw new Error(`Failed to load drift summary: ${error.message}`);

  const rows = (data ?? []) as Array<{ source_url: string; source_vendor: string; target_library: string; drift_state: DriftState; last_checked_at: string | null }>;
  let totalTracked = 0, totalChanged = 0, totalConflict = 0, totalRemoved = 0;
  const bySourceMap = new Map<string, { sourceUrl: string; vendor: string; targetLibrary: string; actionable: number; lastCheckedAt: string | null }>();
  for (const r of rows) {
    totalTracked++;
    if (r.drift_state === 'upstream_changed') totalChanged++;
    if (r.drift_state === 'conflict') totalConflict++;
    if (r.drift_state === 'upstream_removed') totalRemoved++;
    const key = `${r.source_url}::${r.target_library}`;
    const e = bySourceMap.get(key) ?? { sourceUrl: r.source_url, vendor: r.source_vendor, targetLibrary: r.target_library, actionable: 0, lastCheckedAt: null };
    if (ACTIONABLE_STATES.includes(r.drift_state)) e.actionable++;
    if (r.last_checked_at && (!e.lastCheckedAt || r.last_checked_at > e.lastCheckedAt)) e.lastCheckedAt = r.last_checked_at;
    bySourceMap.set(key, e);
  }
  return {
    totalTracked,
    totalChanged,
    totalConflict,
    totalRemoved,
    totalNewUpstream: 0,
    totalActionable: totalChanged + totalConflict + totalRemoved,
    bySource: [...bySourceMap.values()],
  };
}

/** detectionId -> drift state, only for states worth badging in the library. */
export async function getDriftMap(): Promise<Record<string, DriftState>> {
  const { data, error } = await supabase
    .from('detection_drift')
    .select('detection_id, drift_state')
    .in('drift_state', ACTIONABLE_STATES);
  if (error) throw new Error(`Failed to load drift map: ${error.message}`);
  const out: Record<string, DriftState> = {};
  for (const r of (data ?? []) as Array<{ detection_id: string; drift_state: DriftState }>) out[r.detection_id] = r.drift_state;
  return out;
}

export async function getDriftForDetection(detectionId: string): Promise<DriftRow | null> {
  const { data, error } = await supabase
    .from('detection_drift')
    .select('*')
    .eq('detection_id', detectionId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load drift row: ${error.message}`);
  return (data as DriftRow | null) ?? null;
}

/** Persisted drift items for one source (no network) — powers an expanded source row. */
export async function getSourceDriftItems(source: DriftSource): Promise<{ items: DriftItem[]; reachability: SourceReachability; lastCheckedAt: string | null }> {
  const { data, error } = await supabase
    .from('detection_drift')
    .select('detection_id, external_id, drift_state, field_diffs, upstream_path, upstream_raw_snapshot, baseline_hash, upstream_hash, upstream_blob_sha, last_checked_at, resolution')
    .eq('source_url', source.sourceUrl)
    .eq('target_library', source.targetLibrary);
  if (error) throw new Error(`Failed to load source drift: ${error.message}`);

  // Names: fetch in one go for the detections we have rows for.
  const rows = (data ?? []) as Array<Record<string, any>>;
  const detIds = rows.map((r) => r.detection_id);
  const names = new Map<string, string>();
  for (let i = 0; i < detIds.length; i += 500) {
    const chunk = detIds.slice(i, i + 500);
    const { data: nm } = await supabase.from('detections').select('id, name, "detectionQuery"').in('id', chunk);
    for (const d of (nm ?? []) as Array<{ id: string; name: string | null; detectionQuery: string | null }>) {
      names.set(d.id, d.name ?? d.id);
    }
  }

  let lastCheckedAt: string | null = null;
  const items: DriftItem[] = rows.map((r) => {
    if (r.last_checked_at && (!lastCheckedAt || r.last_checked_at > lastCheckedAt)) lastCheckedAt = r.last_checked_at;
    return {
      detectionId: r.detection_id,
      externalId: r.external_id,
      detectionName: names.get(r.detection_id) ?? r.external_id,
      driftState: r.drift_state as DriftState,
      isConflict: r.drift_state === 'conflict',
      fieldDiffs: Array.isArray(r.field_diffs) ? r.field_diffs : [],
      upstreamRaw: r.upstream_raw_snapshot ?? undefined,
      baselineRaw: undefined,
      localQuery: undefined,
      upstreamPath: r.upstream_path ?? undefined,
      cosmeticOnly: r.drift_state === 'upstream_changed' && (!Array.isArray(r.field_diffs) || r.field_diffs.length === 0),
      lastCheckedAt: r.last_checked_at ?? null,
      resolution: (r.resolution ?? null) as DriftResolution | null,
      upstreamHash: r.upstream_hash ?? null,
      upstreamBlobSha: r.upstream_blob_sha ?? null,
      baselineHash: r.baseline_hash ?? null,
    };
  });
  // Order: conflicts, then changed, then removed, then the rest.
  const rank: Record<DriftState, number> = { conflict: 0, upstream_changed: 1, upstream_removed: 2, dismissed: 3, in_sync: 4, unknown: 5 };
  items.sort((a, b) => (rank[a.driftState] - rank[b.driftState]) || a.detectionName.localeCompare(b.detectionName));
  return { items, reachability: source.pinned ? 'pinned' : 'ok', lastCheckedAt };
}
