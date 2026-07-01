/**
 * Types for the upstream drift detection & sync feature.
 *
 * "Drift" = a detection imported from a GitHub vendor repo has diverged from
 * its upstream source. We track it per local detection (see the
 * `detection_drift` table) and reconcile via a review-only workflow.
 */

import type { ParsedRule, FieldDiff, VendorFormat } from '../bulk-import/types';
import type { RateLimitInfo } from '../bulk-import/types';
import type { LibraryType } from '../../constants/library';

// ---------------------------------------------------------------------------
// Core enums
// ---------------------------------------------------------------------------

/** State of a tracked detection relative to its upstream source. */
export type DriftState =
  | 'unknown'           // not yet checked
  | 'in_sync'           // local content matches the upstream baseline
  | 'upstream_changed'  // upstream changed; local NOT edited since import
  | 'upstream_removed'  // the rule no longer appears upstream (deprecated/deleted/moved)
  | 'conflict'          // upstream changed AND local was edited since import
  | 'dismissed';        // a reviewer chose to ignore the current upstream change

/** Why a re-check could not (fully) talk to the source repo. */
export type SourceReachability =
  | 'ok'
  | 'not_found'      // repo / branch 404
  | 'needs_token'    // 403, looks like a private repo
  | 'rate_limited'   // 403, GitHub API rate limit
  | 'pinned';        // imported from a tag / commit SHA — immutable, never drifts

/** Review decision recorded on a drift row. */
export type DriftResolution = 'accepted' | 'kept_mine' | 'dismissed' | 'reverted';

// ---------------------------------------------------------------------------
// A drift-trackable source (one imported GitHub repo / branch / subdir)
// ---------------------------------------------------------------------------

export interface DriftSource {
  /** The GitHub URL the rules were imported from (may include /tree/<ref>/<subdir>). */
  sourceUrl: string;
  vendor: VendorFormat;
  targetLibrary: LibraryType;
  /** Parsed from sourceUrl for display. */
  owner?: string;
  repo?: string;
  /** Branch, tag, or commit SHA portion of the URL. */
  ref?: string;
  /** Subdirectory within the repo, if the import was scoped to one. */
  subdir?: string;
  /** True when `ref` looks like a tag or 40-hex commit SHA → can't drift. */
  pinned?: boolean;
}

/** A source plus its last-known persisted drift stats (no network). */
export interface DriftSourceWithStats extends DriftSource {
  tracked: number;
  drifted: number;       // upstream_changed + conflict
  conflicts: number;
  removed: number;
  newUpstream: number;
  dismissed: number;
  untrackable: number;   // local detections with no external_id
  reachability: SourceReachability;
  lastCheckedAt: string | null;
}

// ---------------------------------------------------------------------------
// Grouped drift cards (the structure the UI renders)
//
// One *card* per logical vendor entry:
//   - VendorCard: groups every imported subdirectory of a known vendor's repo
//     (e.g. all 4 imports from Azure/Azure-Sentinel) under a single header.
//   - CustomSourceCard: a single row for fork/mirror/non-canonical owners.
//
// This collapses what was previously one row per (source_url, target_library)
// for known vendors — most users have several subdir imports per vendor, and
// rendering each as a peer top-level row created visual noise.
// ---------------------------------------------------------------------------

export type DriftSubdirEntry = DriftSourceWithStats;

export interface DriftVendorCard {
  kind: 'vendor';
  /** Lowercased canonical key, e.g. 'sigmahq/sigma'. */
  key: string;
  owner: string;
  repo: string;
  vendor: VendorFormat;
  /** Aggregate stats across all subdirs (sum). */
  totalTracked: number;
  totalDrifted: number;
  totalConflicts: number;
  totalRemoved: number;
  totalNewUpstream: number;
  totalUntrackable: number;
  /** Most recent of the subdirs' lastCheckedAt. */
  lastCheckedAt: string | null;
  /** Per-subdir × library breakdown rendered as compact table rows. */
  subdirs: DriftSubdirEntry[];
}

export interface DriftCustomSourceCard {
  kind: 'custom';
  source: DriftSourceWithStats;
}

export type DriftCard = DriftVendorCard | DriftCustomSourceCard;

// ---------------------------------------------------------------------------
// Per-rule drift result
// ---------------------------------------------------------------------------

export interface DriftItem {
  detectionId: string;
  externalId: string;
  detectionName: string;
  driftState: DriftState;
  /** True for `conflict` — the local copy was edited after import. */
  isConflict: boolean;
  /** Human-readable field-level diffs (query / severity / description / mitre / tags). */
  fieldDiffs: FieldDiff[];
  /** Latest upstream raw file content (for the diff view). */
  upstreamRaw?: string;
  /** The stored baseline raw content (= vendor_metadata.rawContent). */
  baselineRaw?: string;
  /** The detection's current primary query body (for the 3-way diff). */
  localQuery?: string;
  /** Parsed upstream rule (for Accept-upstream). */
  upstreamParsed?: ParsedRule;
  /** Last-known upstream file path within the repo. */
  upstreamPath?: string;
  /** Other local detections that share this external_id (warning). */
  siblingDetectionIds?: string[];
  /** True when the raw content differs but no parsed field changed. */
  cosmeticOnly?: boolean;
  /**
   * True when the upstream file at this id exists but our parser can't read
   * it (e.g. an Azure-Sentinel migration stub: same id, no `query:` block).
   * Treated as upstream_changed for triage but Accept Upstream is disabled —
   * we have no parsed rule to overwrite the local detection with.
   */
  upstreamUnparseable?: boolean;
  lastCheckedAt?: string | null;
  resolution?: DriftResolution | null;
  // --- raw values used to build the persisted detection_drift row ---
  /** sha256(normalised upstreamRaw). */
  upstreamHash?: string | null;
  /** git blob SHA of the upstream file at this check. */
  upstreamBlobSha?: string | null;
  /** The baseline hash this comparison used (carried forward, or newly established). */
  baselineHash?: string | null;
}

/** An upstream rule that has no matching local detection in this source. */
export interface NewUpstreamRule {
  externalId: string;
  title: string;
  path: string;
  vendor: VendorFormat;
  parsed: ParsedRule;
}

// ---------------------------------------------------------------------------
// Check result + progress
// ---------------------------------------------------------------------------

export interface DriftCheckCounts {
  tracked: number;
  inSync: number;
  changed: number;       // upstream_changed (excludes conflicts)
  conflict: number;
  removed: number;
  dismissed: number;
  newUpstream: number;
  untrackable: number;
  baselineEstablished: number;  // rows that had no baseline and got one this run
}

export interface DriftCheckResult {
  source: DriftSource;
  reachability: SourceReachability;
  checkedAt: string;
  items: DriftItem[];
  newUpstream: NewUpstreamRule[];
  counts: DriftCheckCounts;
  rateLimit?: RateLimitInfo;
  warnings: string[];
}

export type DriftCheckPhase =
  | 'scanning'
  | 'fetching'
  | 'parsing'
  | 'comparing'
  | 'persisting'
  | 'done';

export interface DriftCheckProgress {
  phase: DriftCheckPhase;
  current: number;
  total: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Persistence row (mirrors the `detection_drift` table)
// ---------------------------------------------------------------------------

export interface DriftRow {
  id?: string;
  detection_id: string;
  user_id: string;
  source_url: string;
  source_vendor: string;
  target_library: string;
  external_id: string;
  upstream_path: string | null;
  upstream_blob_sha: string | null;
  baseline_hash: string | null;
  upstream_hash: string | null;
  upstream_raw_snapshot: string | null;
  drift_state: DriftState;
  field_diffs: FieldDiff[];
  last_checked_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution: DriftResolution | null;
  created_at?: string;
  updated_at?: string;
}

/** Aggregate counts for badges (library button, sidebar, Data Sync header). */
export interface DriftSummary {
  totalTracked: number;
  totalChanged: number;   // upstream_changed
  totalConflict: number;
  totalRemoved: number;
  totalNewUpstream: number;
  /** Anything a reviewer should act on: changed + conflict + removed. */
  totalActionable: number;
  bySource: Array<{ sourceUrl: string; vendor: string; targetLibrary: string; actionable: number; lastCheckedAt: string | null }>;
}
