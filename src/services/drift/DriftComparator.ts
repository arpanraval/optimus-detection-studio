/**
 * DriftComparator — the pure, storage-agnostic engine that compares the rules
 * currently in a GitHub vendor source against the locally-imported detections.
 *
 * It depends only on `fetch` (via an injected GitHubFetcher-shaped object) plus
 * a parser and a field-comparison function — no `supabase`, no DOM — so it can
 * be reused unchanged from a future scheduled edge function.
 *
 * The caller (driftService in the browser) supplies the "known state" maps
 * (baselines, existing detections, sibling groups) loaded from the DB, runs the
 * comparison, then persists the result into the `detection_drift` table.
 */

import type {
  ParsedRule,
  ParseResult,
  FieldDiff,
  ReconReport,
  FetchResult,
} from '../bulk-import/types';
import type { GitHubFetchOptions } from '../bulk-import/fetchers/GitHubFetcher';
import { getImportExtensions } from '../bulk-import/extensions';
import type { Detection } from '../../types';
import { sha256Hex } from './hash';
import type {
  DriftSource,
  DriftCheckResult,
  DriftCheckProgress,
  DriftItem,
  NewUpstreamRule,
  DriftCheckCounts,
  SourceReachability,
} from './types';

// ---------------------------------------------------------------------------
// Dependencies (injected — keeps the engine testable & runtime-agnostic)
// ---------------------------------------------------------------------------

export interface DriftFetcher {
  parseUrl(url: string): { owner: string; repo: string; path?: string; branch?: string } | null;
  scanRepository(url: string, options?: { token?: string; extensions?: string[] }): Promise<ReconReport>;
  fetch(url: string, options?: GitHubFetchOptions): Promise<FetchResult>;
}

export interface DriftComparatorDeps {
  fetcher: DriftFetcher;
  /** parserFactory.parse — auto-detects vendor format. */
  parse: (content: string, fileName: string, filePath?: string) => ParseResult | null;
  /** duplicateDetector.compareFields — human-readable field diffs. */
  compareFields: (incoming: ParsedRule, existing: Partial<Detection>) => FieldDiff[];
}

// ---------------------------------------------------------------------------
// Per-detection known state (loaded from the DB by the caller)
// ---------------------------------------------------------------------------

export interface KnownBaseline {
  detectionId: string;
  /** Mirrors detections.user_id — used when persisting the drift row. */
  userId: string;
  detectionName: string;
  /** vendor_metadata.rawContent — the baseline content. */
  baselineRaw?: string;
  /** sha256(normalised baselineRaw), precomputed by the caller. Null = no baseline yet. */
  baselineHash?: string | null;
  /** detections.detectionQuery — the current primary query body. */
  localQuery?: string;
  /** Current re-serialisable rule body, where derivable (used for precise conflict detection). */
  localContent?: string;
  /** vendor_metadata.importedAt. */
  importedAt?: string;
  /** detections.version. */
  version?: number;
  /** detections.updatedDate. */
  updatedAt?: string;
  /** detections.updated_by. */
  updatedBy?: string | null;
  /** detection_drift.upstream_path from the prior check (kept if the rule is now removed). */
  lastUpstreamPath?: string | null;
  /** detection_drift.upstream_blob_sha from the prior check. */
  lastBlobSha?: string | null;
  /** detection_drift.upstream_hash from the prior check (for dismissal re-surfacing). */
  lastUpstreamHash?: string | null;
  /** True when the prior drift row is in state 'dismissed'. */
  dismissed?: boolean;
}

export interface CompareSourceOptions {
  token?: string;
  /** Keyed by external_id. */
  knownBaselines: Map<string, KnownBaseline>;
  /** Keyed by external_id — the subset of Detection fields compareFields reads. */
  existingDetections: Map<string, Partial<Detection>>;
  /** external_id -> [detectionId, ...] when more than one local detection shares it. */
  siblingsByExternalId?: Map<string, string[]>;
  /** Local detections in this source with no external_id (can't be tracked). */
  untrackableCount?: number;
  onProgress?: (p: DriftCheckProgress) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Best-effort id extraction for YAML files our parser couldn't claim — covers
 * the common case of vendor "migration stubs" (e.g. Azure-Sentinel rules that
 * were relocated and replaced with a breadcrumb file containing the original
 * id but no `query:` block). Without this fallback the comparator would
 * misclassify those rules as `upstream_removed` because the parser dropped
 * them on the floor.
 *
 * Only YAML is covered — TOML/Chronicle YARA-L use very different id syntax,
 * and parser failure on those is more likely a real format problem than a stub.
 */
function isYamlFile(name: string): boolean {
  return /\.(ya?ml)$/i.test(name);
}

const YAML_ID_LINE = /^id\s*:\s*['"]?([0-9a-f-]+)['"]?\s*$/im;

function recoverYamlId(content: string): string | null {
  const m = content.match(YAML_ID_LINE);
  return m ? m[1] : null;
}

/** Heuristic: does this ref look like an immutable tag or commit SHA? */
export function isPinnedRef(ref: string | undefined | null): boolean {
  if (!ref) return false;
  if (/^[0-9a-f]{40}$/i.test(ref)) return true;          // full commit SHA
  if (/^v?\d+\.\d+([.\d-].*)?$/i.test(ref)) return true;  // v1.2.3, 2024.1, 1.0.0-rc1, ...
  return false;
}

function emptyCounts(): DriftCheckCounts {
  return {
    tracked: 0,
    inSync: 0,
    changed: 0,
    conflict: 0,
    removed: 0,
    dismissed: 0,
    newUpstream: 0,
    untrackable: 0,
    baselineEstablished: 0,
  };
}

function reachabilityFromReport(report: ReconReport): SourceReachability {
  if (!report.errorStatus) return 'ok';
  if (report.errorStatus === 404) return 'not_found';
  if (report.errorStatus === 403) {
    const remaining = report.rateLimitInfo?.remaining;
    if (remaining === 0) return 'rate_limited';
    return 'needs_token';
  }
  return 'not_found';
}

/** Reconstruct the bare repo URL (no /tree/...) so a re-scan uses the default branch. */
function bareRepoUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}`;
}

// ---------------------------------------------------------------------------
// DriftComparator
// ---------------------------------------------------------------------------

/**
 * Pure engine. Has no `supabase` / DOM dependency, so a future scheduled
 * `github-drift-checker` edge function can construct it the same way the
 * browser does (with a Deno-built `fetch`-only fetcher and the same parsers
 * + compareFields) and reuse this code unchanged.
 */
export class DriftComparator {
  constructor(private readonly deps: DriftComparatorDeps) {}

  async compareSource(source: DriftSource, opts: CompareSourceOptions): Promise<DriftCheckResult> {
    const { fetcher, parse, compareFields } = this.deps;
    const checkedAt = new Date().toISOString();
    const warnings: string[] = [];
    const counts = emptyCounts();
    counts.tracked = opts.knownBaselines.size;
    counts.untrackable = opts.untrackableCount ?? 0;
    const progress = opts.onProgress ?? (() => {});

    const parsed = fetcher.parseUrl(source.sourceUrl);
    if (!parsed) {
      return {
        source,
        reachability: 'not_found',
        checkedAt,
        items: [],
        newUpstream: [],
        counts,
        warnings: ['Invalid GitHub URL — cannot check for upstream updates.'],
      };
    }
    const { owner, repo } = parsed;
    const ref = parsed.branch;
    const subdir = parsed.path;

    // --- Pinned refs (tags / commit SHAs) never drift ---
    if (isPinnedRef(ref)) {
      return {
        source: { ...source, owner, repo, ref, subdir, pinned: true },
        reachability: 'pinned',
        checkedAt,
        items: [],
        newUpstream: [],
        counts,
        warnings: [`Source is pinned to "${ref}" — an immutable tag/commit, so it can't drift.`],
      };
    }

    // --- Scan the repo tree (1 API call) ---
    progress({ phase: 'scanning', current: 0, total: 0, message: `Scanning ${owner}/${repo}…` });
    const extensions = getImportExtensions([source.vendor]);
    let report = await fetcher.scanRepository(source.sourceUrl, { token: opts.token, extensions });

    // 404 on a specific branch but the repo exists → retry against the default branch.
    if (report.errorStatus === 404 && ref && report.repoInfo) {
      const fallback = await fetcher.scanRepository(bareRepoUrl(owner, repo), { token: opts.token, extensions });
      if (!fallback.errorStatus) {
        warnings.push(`Branch "${ref}" no longer exists upstream — checked the default branch "${fallback.repoInfo?.defaultBranch ?? '?'}" instead. Consider re-importing.`);
        report = fallback;
      }
    }

    const reachability = reachabilityFromReport(report);
    if (reachability !== 'ok') {
      const msg =
        reachability === 'not_found'
          ? `Repository or branch not found (${owner}/${repo}${ref ? ` @ ${ref}` : ''}). It may have been deleted, renamed, or made private.`
          : reachability === 'needs_token'
            ? `Access denied — this repo appears to be private. Provide a GitHub token to check it.`
            : `GitHub API rate limit reached. Wait for the limit to reset or provide a GitHub token.`;
      return {
        source: { ...source, owner, repo, ref, subdir },
        reachability,
        checkedAt,
        items: [],
        newUpstream: [],
        counts,
        rateLimit: report.rateLimitInfo,
        warnings: [...warnings, msg],
      };
    }

    // --- Download the matching files (re-scans the tree internally; cheap) ---
    progress({ phase: 'fetching', current: 0, total: report.matchingFiles, message: `Downloading ${report.matchingFiles} rule files…` });
    const fetchResult = await fetcher.fetch(source.sourceUrl, {
      extensions,
      token: opts.token,
      onlyPaths: report.filePaths,
      onProgress: (current, total, fileName) =>
        progress({ phase: 'fetching', current, total, message: `Downloaded ${current}/${total} — ${fileName}` }),
    });
    if (!fetchResult.success) {
      return {
        source: { ...source, owner, repo, ref, subdir },
        reachability: 'not_found',
        checkedAt,
        items: [],
        newUpstream: [],
        counts,
        rateLimit: report.rateLimitInfo,
        warnings: [...warnings, fetchResult.error || 'Failed to download rule files from GitHub.'],
      };
    }

    // --- Parse downloaded files, keyed by upstream rule id (external_id) ---
    progress({ phase: 'parsing', current: 0, total: fetchResult.files.length, message: 'Parsing rules…' });
    const upstreamByExternalId = new Map<string, { rule: ParsedRule; path: string; content: string; blobSha?: string }>();
    /** YAML files we couldn't parse but whose id we recovered via regex (vendor stubs, schema breaks, …). */
    const upstreamUnparseableByExternalId = new Map<string, { path: string; content: string; blobSha?: string }>();
    const unparseableByPath = new Map<string, { path: string; content: string; blobSha?: string }>();
    let unparseable = 0;
    let unparseableRecovered = 0;
    let idless = 0;
    for (let i = 0; i < fetchResult.files.length; i++) {
      const file = fetchResult.files[i];
      let result: ParseResult | null;
      try {
        result = parse(file.content, file.name, file.path);
      } catch {
        result = null;
      }
      if (!result?.success || !result.rule) {
        unparseable++;
        unparseableByPath.set(file.path, file);
        // Last-ditch YAML id recovery — keeps relocated/stubbed upstream rules
        // from being misclassified as `upstream_removed`.
        if (isYamlFile(file.name)) {
          const id = recoverYamlId(file.content);
          if (id && !upstreamByExternalId.has(id) && !upstreamUnparseableByExternalId.has(id)) {
            upstreamUnparseableByExternalId.set(id, { path: file.path, content: file.content, blobSha: file.blobSha });
            unparseableRecovered++;
          }
        }
        continue;
      }
      const id = result.rule.sourceId;
      if (!id) {
        idless++;
        continue;
      }
      // First file wins if two upstream files share an id.
      if (!upstreamByExternalId.has(id)) {
        upstreamByExternalId.set(id, { rule: result.rule, path: file.path, content: file.content, blobSha: file.blobSha });
      } else {
        warnings.push(`Upstream has two rules with id "${id}" — using the first (${upstreamByExternalId.get(id)!.path}).`);
      }
      if ((i & 0x3f) === 0) {
        progress({ phase: 'parsing', current: i + 1, total: fetchResult.files.length, message: 'Parsing rules…' });
      }
    }
    if (unparseable > 0) {
      warnings.push(
        unparseableRecovered > 0
          ? `${unparseable} upstream file(s) could not be fully parsed (${unparseableRecovered} recovered by id — likely vendor stubs or schema changes).`
          : `${unparseable} upstream file(s) could not be parsed and were skipped.`,
      );
    }
    if (idless > 0) warnings.push(`${idless} upstream rule(s) have no stable id and can't be matched.`);

    // --- Compare each tracked local detection against upstream ---
    progress({ phase: 'comparing', current: 0, total: opts.knownBaselines.size, message: 'Comparing against upstream…' });
    const items: DriftItem[] = [];
    const siblings = opts.siblingsByExternalId ?? new Map<string, string[]>();
    let compared = 0;
    for (const [externalId, baseline] of opts.knownBaselines) {
      compared++;
      if ((compared & 0x3f) === 0) {
        progress({ phase: 'comparing', current: compared, total: opts.knownBaselines.size, message: 'Comparing against upstream…' });
      }
      const upstream = upstreamByExternalId.get(externalId);
      const siblingIds = siblings.get(externalId);

      // Fallback: upstream file with this id exists but couldn't be parsed
      // (vendor migration stub, schema change, etc.). Treat as upstream_changed
      // with an `upstreamUnparseable` flag so the UI can show a useful message
      // and disable Accept Upstream — *not* upstream_removed.
      if (!upstream) {
        const stub = upstreamUnparseableByExternalId.get(externalId) ??
          (baseline.lastUpstreamPath ? unparseableByPath.get(baseline.lastUpstreamPath) : undefined);
        if (stub) {
          const upstreamHash = await sha256Hex(stub.content);
          counts.changed++;
          items.push({
            detectionId: baseline.detectionId,
            externalId,
            detectionName: baseline.detectionName,
            driftState: 'upstream_changed',
            isConflict: false,
            fieldDiffs: [],
            upstreamRaw: stub.content,
            baselineRaw: baseline.baselineRaw,
            localQuery: baseline.localQuery,
            upstreamParsed: undefined,
            upstreamPath: stub.path,
            siblingDetectionIds: siblingIds,
            cosmeticOnly: false,
            upstreamUnparseable: true,
            lastCheckedAt: checkedAt,
            upstreamHash,
            upstreamBlobSha: stub.blobSha ?? null,
            baselineHash: baseline.baselineHash ?? null,
          });
          continue;
        }
        // Preserve a prior dismissal — otherwise dismissed-removed rules would
        // resurface as actionable on every re-check.
        const removedState: DriftItem['driftState'] = baseline.dismissed ? 'dismissed' : 'upstream_removed';
        if (removedState === 'dismissed') counts.dismissed++; else counts.removed++;
        items.push({
          detectionId: baseline.detectionId,
          externalId,
          detectionName: baseline.detectionName,
          driftState: removedState,
          isConflict: false,
          fieldDiffs: [],
          upstreamRaw: undefined,
          baselineRaw: baseline.baselineRaw,
          localQuery: baseline.localQuery,
          upstreamParsed: undefined,
          upstreamPath: baseline.lastUpstreamPath ?? undefined,
          siblingDetectionIds: siblingIds,
          cosmeticOnly: false,
          lastCheckedAt: checkedAt,
          upstreamHash: null,
          upstreamBlobSha: baseline.lastBlobSha ?? null,
          baselineHash: baseline.baselineHash ?? null,
        });
        continue;
      }

      const upstreamHash = await sha256Hex(upstream.content);
      const baseItem: DriftItem = {
        detectionId: baseline.detectionId,
        externalId,
        detectionName: baseline.detectionName,
        driftState: 'in_sync',
        isConflict: false,
        fieldDiffs: [],
        upstreamRaw: upstream.content,
        baselineRaw: baseline.baselineRaw,
        localQuery: baseline.localQuery,
        upstreamParsed: upstream.rule,
        upstreamPath: upstream.path,
        siblingDetectionIds: siblingIds,
        cosmeticOnly: false,
        lastCheckedAt: checkedAt,
        upstreamHash,
        upstreamBlobSha: upstream.blobSha ?? null,
        baselineHash: baseline.baselineHash ?? null,
      };

      // No baseline yet (imported before vendor_metadata plumbing, or rawContent
      // missing). Naïvely setting in_sync here would silently overwrite local
      // edits on the next Accept; but blindly trusting compareFields produces
      // spurious conflicts because ancillary fields (severity casing, MITRE
      // resolution, description normalisation) often diverge through the import
      // pipeline even when the user hasn't touched anything.
      //
      // Two complementary signals tell us the rule was customised since import:
      //   (a) detectionQuery diverges from upstream — the most reliable signal
      //       that the user actually edited the rule body;
      //   (b) version > 1, OR (updatedDate > importedAt AND updated_by is set)
      //       — covers customisations to OTHER fields (severity, tags, MITRE,
      //       description) that the user made via the detection editor without
      //       touching the query. Without (b), an upstream Accept would silently
      //       overwrite those tag/severity edits.
      //
      // Either signal triggers a conflict. Only when BOTH are false do we
      // silently establish the baseline as in_sync.
      if (baseline.baselineHash == null) {
        const localQuery = ((opts.existingDetections.get(externalId)?.detectionQuery ?? '') as string).trim();
        const upstreamQuery = (upstream.rule.query ?? '').trim();
        const queryDiverges = !!localQuery && !!upstreamQuery && localQuery !== upstreamQuery;
        const editedAfterImport =
          !!baseline.updatedAt && !!baseline.importedAt && baseline.updatedAt > baseline.importedAt && !!baseline.updatedBy;
        const looksCustomised = (baseline.version != null && baseline.version > 1) || editedAfterImport;

        if (queryDiverges || looksCustomised) {
          counts.baselineEstablished++;
          counts.conflict++;
          const reason = queryDiverges
            ? 'its local query differs from upstream'
            : `it was customised after import (version=${baseline.version ?? '?'}, edited=${editedAfterImport})`;
          warnings.push(
            `No baseline was stored for "${baseline.detectionName}" — ${reason}, so it's flagged as a conflict for review (won't auto-accept).`,
          );
          items.push({
            ...baseItem,
            driftState: 'conflict',
            isConflict: true,
            fieldDiffs: compareFields(upstream.rule, opts.existingDetections.get(externalId) ?? {}),
            cosmeticOnly: false,
            // baseline_hash stays null until the user resolves; on Accept it advances to upstreamHash.
          });
          continue;
        }
        counts.baselineEstablished++;
        counts.inSync++;
        items.push({ ...baseItem, driftState: 'in_sync', baselineHash: upstreamHash });
        continue;
      }

      if (upstreamHash === baseline.baselineHash) {
        counts.inSync++;
        items.push(baseItem);
        continue;
      }

      // Upstream content differs from the baseline.
      const fieldDiffs = compareFields(upstream.rule, opts.existingDetections.get(externalId) ?? {});
      const cosmeticOnly = fieldDiffs.length === 0;

      // Was this exact upstream version already dismissed by a reviewer?
      if (baseline.dismissed && baseline.lastUpstreamHash && baseline.lastUpstreamHash === upstreamHash) {
        counts.dismissed++;
        items.push({ ...baseItem, driftState: 'dismissed', fieldDiffs, cosmeticOnly });
        continue;
      }

      // Conflict = the local copy was edited after import.
      let isConflict: boolean;
      if (baseline.localContent != null) {
        const localHash = await sha256Hex(baseline.localContent);
        isConflict = localHash !== baseline.baselineHash;
      } else {
        const editedAfterImport =
          !!baseline.updatedAt && !!baseline.importedAt && baseline.updatedAt > baseline.importedAt && !!baseline.updatedBy;
        isConflict = (baseline.version != null && baseline.version > 1) || editedAfterImport;
      }

      if (isConflict) counts.conflict++;
      else counts.changed++;
      items.push({
        ...baseItem,
        driftState: isConflict ? 'conflict' : 'upstream_changed',
        isConflict,
        fieldDiffs,
        cosmeticOnly,
      });
    }

    // --- New upstream rules with no matching local detection ---
    const newUpstream: NewUpstreamRule[] = [];
    for (const [externalId, u] of upstreamByExternalId) {
      if (opts.knownBaselines.has(externalId)) continue;
      counts.newUpstream++;
      newUpstream.push({
        externalId,
        title: u.rule.title,
        path: u.path,
        vendor: u.rule.sourceFormat,
        parsed: u.rule,
      });
    }

    if (counts.baselineEstablished > 0) {
      warnings.push(`Established a fresh baseline for ${counts.baselineEstablished} rule(s) that had none — they aren't shown as drifted.`);
    }

    progress({ phase: 'done', current: items.length, total: items.length, message: 'Done.' });
    return {
      source: { ...source, owner, repo, ref, subdir, pinned: false },
      reachability: 'ok',
      checkedAt,
      items,
      newUpstream,
      counts,
      rateLimit: report.rateLimitInfo,
      warnings,
    };
  }
}
