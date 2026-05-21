/**
 * driftMutations — the review actions for upstream drift:
 *   - applyUpstream      pull the upstream version into the local detection
 *   - keepMine           keep the local detection, advance the baseline
 *   - dismissDrift       soft-snooze the current upstream change
 *   - revertLastSync     undo the most recent applyUpstream
 *   - acknowledgeRemoved acknowledge a rule that no longer exists upstream
 *
 * Each writes an audit_events entry (via the audit-log edge function) and
 * updates the detection_drift row. Admin-gated in practice.
 */

import { supabase } from '../../lib/supabaseClient';
import { parserFactory } from '../bulk-import/parsers/ParserFactory';
import { duplicateDetector } from '../bulk-import/validators/DuplicateDetector';
import { logAuditEvent } from '../../lib/audit/auditLogger';
import { scoreDetection } from '../../lib/quality/scoringEngine';
import type { Detection, DetectionQuery } from '../../types';
import type { ParsedRule, VendorMetadata } from '../bulk-import/types';
import { mapSeverity } from '../bulk-import/types';
import { getDriftForDetection } from './driftService';

interface ActorOpt {
  actorId: string;
}

/** Detection rows carry a vendor_metadata JSONB column that isn't on the base type. */
type DetectionRow = Detection & { vendor_metadata?: VendorMetadata | null };

function fileNameFor(path: string | null, externalId: string): string {
  if (path) return path.split('/').pop() || `${externalId}.yml`;
  return `${externalId}.yml`;
}

async function parseRule(content: string, path: string | null, externalId: string): Promise<ParsedRule> {
  await parserFactory.initialize();
  const result = parserFactory.parse(content, fileNameFor(path, externalId), path ?? undefined);
  if (!result?.success || !result.rule) {
    throw new Error('Could not parse the rule content.');
  }
  return result.rule;
}

/**
 * Build the subset of Detection fields that an upstream rule should overwrite.
 * Everything not returned here is preserved (status, library, assignments,
 * notes, deployments, scoring overrides, test cases, threat-intel links, ...).
 */
function buildOverwriteFromRule(
  rule: ParsedRule,
  detection: Detection,
  opts: { keepName: boolean },
): Partial<Detection> {
  const now = new Date().toISOString();

  // Reuse the existing primary query's id/createdDate; replace its body.
  const existingQueries: DetectionQuery[] = Array.isArray(detection.queries) ? detection.queries : [];
  const primary = existingQueries.find((q) => q.isPrimary) ?? existingQueries[0];
  const newPrimary: DetectionQuery = {
    id: primary?.id ?? crypto.randomUUID(),
    language: rule.queryLanguage,
    query: rule.query,
    explanation: primary?.explanation ?? '',
    isPrimary: true,
    createdDate: primary?.createdDate ?? now,
    updatedDate: now,
  };
  const otherQueries = existingQueries.filter((q) => q !== primary && q !== newPrimary);

  const overwrite: Partial<Detection> = {
    description: rule.description,
    severity: mapSeverity(rule.level, rule.riskScore),
    detectionQuery: rule.query,
    queryLanguage: rule.queryLanguage,
    queries: [newPrimary, ...otherQueries],
    queryExplanation: detection.queryExplanation ?? '',
    mitreAttackIds: rule.mitreAttackIds,
    mitreTactics: rule.mitreTactics,
    mitreTechniques: rule.mitreAttackIds, // technique ids; resolver runs on next sync/refresh
    tags: rule.tags,
    references: rule.references,
    associatedCVEs: rule.cves,
    dataSources: rule.dataSources,
    platforms: rule.platforms,
    falsePositiveGuidance: rule.falsePositives.join('\n\n'),
    source_url: rule.sourceUrl ?? detection.source_url ?? null,
  };
  if (!opts.keepName) overwrite.name = rule.title;
  return overwrite;
}

/**
 * Apply the upstream version of a drifted detection.
 */
export async function applyUpstream(detectionId: string, opts: ActorOpt): Promise<void> {
  const drift = await getDriftForDetection(detectionId);
  if (!drift) throw new Error('No drift record for this detection — run a drift check first.');
  if (drift.drift_state === 'upstream_removed') throw new Error('This rule no longer exists upstream — there is nothing to pull.');
  if (!drift.upstream_raw_snapshot) throw new Error('No upstream snapshot stored — re-run the drift check first.');

  // Idempotency guard — if this rule is already in_sync with the same upstream
  // hash we'd be applying, this is either a duplicate click or a retry after a
  // drift-update failure. Returning early avoids: (a) a duplicate audit_event,
  // (b) an unnecessary version bump, (c) overwriting any user edits made since
  // the original successful apply.
  if (drift.drift_state === 'in_sync' && drift.upstream_hash && drift.baseline_hash === drift.upstream_hash) {
    return;
  }

  const { data: det, error } = await supabase.from('detections').select('*').eq('id', detectionId).single();
  if (error || !det) throw new Error('Detection not found.');
  const detection = det as DetectionRow;

  const rule = await parseRule(drift.upstream_raw_snapshot, drift.upstream_path, drift.external_id);

  const overwrite = buildOverwriteFromRule(rule, detection, { keepName: drift.drift_state === 'conflict' });

  const oldVm = (detection.vendor_metadata ?? {}) as Partial<VendorMetadata>;
  const now = new Date().toISOString();
  const newVm: VendorMetadata = {
    sourceFormat: rule.sourceFormat,
    rawContent: drift.upstream_raw_snapshot,
    vendorFields: (oldVm.vendorFields as Record<string, unknown>) ?? {},
    importedAt: oldVm.importedAt ?? now,
    importJobId: oldVm.importJobId,
    lastSyncedAt: now,
    previousRawContent: oldVm.rawContent,
  };

  const merged: Partial<Detection> = { ...detection, ...overwrite };
  const qualityScore = scoreDetection(merged).score;

  const payload: Record<string, unknown> = {
    ...overwrite,
    qualityScore,
    vendor_metadata: newVm,
    version: (detection.version ?? 1) + 1,
    updatedDate: now,
    updated_by: opts.actorId,
  };

  const { error: upErr } = await supabase.from('detections').update(payload).eq('id', detectionId);
  if (upErr) throw new Error(`Failed to update detection: ${upErr.message}`);

  const changedFields = Object.keys(overwrite);
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  const detectionAsRecord = detection as unknown as Record<string, unknown>;
  const overwriteAsRecord = overwrite as unknown as Record<string, unknown>;
  for (const f of changedFields) {
    oldValues[f] = detectionAsRecord[f];
    newValues[f] = overwriteAsRecord[f];
  }
  await logAuditEvent({
    action: 'detection.upstream_synced',
    entity_type: 'detection',
    entity_id: detectionId,
    entity_name: detection.name,
    old_values: oldValues,
    new_values: newValues,
    details: { externalId: drift.external_id, sourceUrl: drift.source_url, upstreamPath: drift.upstream_path },
  });

  const { error: dErr } = await supabase
    .from('detection_drift')
    .update({
      drift_state: 'in_sync',
      baseline_hash: drift.upstream_hash,
      field_diffs: [],
      resolution: 'accepted',
      resolved_at: now,
      resolved_by: opts.actorId,
    })
    .eq('detection_id', detectionId);
  if (dErr) {
    // Detection update succeeded but the drift-state update didn't. The next
    // drift check will self-heal (vendor_metadata.rawContent now matches
    // upstream → in_sync), or the user can retry — applyUpstream is idempotent.
    throw new Error(`Synced the detection successfully, but the drift indicator didn't refresh: ${dErr.message}. Retry the action or re-check the source — neither will duplicate the work.`);
  }
}

/**
 * Keep the local detection as-is, but advance the baseline to the current
 * upstream version so this change stops resurfacing (until upstream changes
 * again to something different).
 */
export async function keepMine(detectionId: string, opts: ActorOpt): Promise<void> {
  const drift = await getDriftForDetection(detectionId);
  if (!drift) throw new Error('No drift record for this detection.');
  if (!drift.upstream_raw_snapshot) throw new Error('No upstream snapshot stored — re-run the drift check first.');

  const { data: det, error } = await supabase.from('detections').select('id, name, vendor_metadata').eq('id', detectionId).single();
  if (error || !det) throw new Error('Detection not found.');
  const oldVm = ((det as { vendor_metadata?: unknown }).vendor_metadata ?? {}) as Partial<VendorMetadata>;
  const now = new Date().toISOString();
  // Clear previousRawContent — KeepMine is an explicit "I'm satisfied with my
  // local version" decision; there is no sync to revert. Leaving it set would
  // let a later revertLastSync restore content from BEFORE the original
  // applyUpstream, skipping over the user's KeepMine intent.
  const newVm: Partial<VendorMetadata> = {
    ...oldVm,
    rawContent: drift.upstream_raw_snapshot,
    lastSyncedAt: now,
    previousRawContent: undefined,
  };

  const { error: upErr } = await supabase.from('detections').update({ vendor_metadata: newVm }).eq('id', detectionId);
  if (upErr) throw new Error(`Failed to update detection metadata: ${upErr.message}`);

  await logAuditEvent({
    action: 'detection.drift_kept_local',
    entity_type: 'detection',
    entity_id: detectionId,
    entity_name: (det as { name?: string }).name,
    details: { externalId: drift.external_id, sourceUrl: drift.source_url },
  });

  const { error: dErr } = await supabase
    .from('detection_drift')
    .update({
      drift_state: 'in_sync',
      baseline_hash: drift.upstream_hash,
      field_diffs: [],
      resolution: 'kept_mine',
      resolved_at: now,
      resolved_by: opts.actorId,
    })
    .eq('detection_id', detectionId);
  if (dErr) throw new Error(`Failed to update drift record: ${dErr.message}`);
}

/**
 * Soft-snooze the current upstream change. It resurfaces only if upstream
 * changes again to a different version (handled by the comparator).
 */
export async function dismissDrift(detectionId: string, opts: ActorOpt): Promise<void> {
  const drift = await getDriftForDetection(detectionId);
  if (!drift) throw new Error('No drift record for this detection.');
  const now = new Date().toISOString();

  await logAuditEvent({
    action: 'detection.drift_dismissed',
    entity_type: 'detection',
    entity_id: detectionId,
    details: { externalId: drift.external_id, sourceUrl: drift.source_url, priorState: drift.drift_state },
  });

  const { error } = await supabase
    .from('detection_drift')
    .update({ drift_state: 'dismissed', resolution: 'dismissed', resolved_at: now, resolved_by: opts.actorId })
    .eq('detection_id', detectionId);
  if (error) throw new Error(`Failed to dismiss drift: ${error.message}`);
}

/**
 * Acknowledge a rule that no longer exists upstream. Optionally mark the local
 * detection deprecated. Either way the drift row is moved to 'dismissed'.
 */
export async function acknowledgeRemoved(detectionId: string, opts: ActorOpt & { markDeprecated?: boolean }): Promise<void> {
  const drift = await getDriftForDetection(detectionId);
  if (!drift) throw new Error('No drift record for this detection.');
  const now = new Date().toISOString();

  if (opts.markDeprecated) {
    const { data: det } = await supabase.from('detections').select('status, name').eq('id', detectionId).single();
    const oldStatus = (det as { status?: string } | null)?.status;
    const { error: upErr } = await supabase
      .from('detections')
      .update({ status: 'Deprecated', updatedDate: now, updated_by: opts.actorId })
      .eq('id', detectionId);
    if (upErr) throw new Error(`Failed to mark detection deprecated: ${upErr.message}`);
    await logAuditEvent({
      action: 'detection.status_changed',
      entity_type: 'detection',
      entity_id: detectionId,
      entity_name: (det as { name?: string } | null)?.name,
      old_values: { status: oldStatus },
      new_values: { status: 'Deprecated' },
      details: { reason: 'removed_upstream', externalId: drift.external_id, sourceUrl: drift.source_url },
    });
  }

  await logAuditEvent({
    action: 'detection.drift_dismissed',
    entity_type: 'detection',
    entity_id: detectionId,
    details: { externalId: drift.external_id, sourceUrl: drift.source_url, removedUpstream: true, markedDeprecated: !!opts.markDeprecated },
  });

  const { error } = await supabase
    .from('detection_drift')
    .update({ drift_state: 'dismissed', resolution: 'dismissed', resolved_at: now, resolved_by: opts.actorId })
    .eq('detection_id', detectionId);
  if (error) throw new Error(`Failed to acknowledge removed rule: ${error.message}`);
}

/** Grace window — applyUpstream stamps updatedDate ≈ lastSyncedAt; tolerate small clock skew. */
const REVERT_EDIT_GRACE_MS = 5_000;

/**
 * Undo the most recent applyUpstream: restore the detection from
 * vendor_metadata.previousRawContent. Only available when that field is set
 * AND the detection hasn't been edited by a user since the sync (otherwise the
 * blind revert would silently destroy that follow-up edit).
 */
export async function revertLastSync(detectionId: string, opts: ActorOpt): Promise<void> {
  const { data: det, error } = await supabase.from('detections').select('*').eq('id', detectionId).single();
  if (error || !det) throw new Error('Detection not found.');
  const detection = det as DetectionRow;
  const oldVm = (detection.vendor_metadata ?? {}) as Partial<VendorMetadata>;
  if (!oldVm.previousRawContent) throw new Error('No previous version stored — this detection has no sync to revert.');

  // Refuse to revert if the detection was modified after the sync that created
  // previousRawContent — otherwise we'd silently throw away that local edit.
  if (oldVm.lastSyncedAt && detection.updatedDate) {
    const editedAfterSyncMs = new Date(detection.updatedDate).getTime() - new Date(oldVm.lastSyncedAt).getTime();
    if (editedAfterSyncMs > REVERT_EDIT_GRACE_MS) {
      throw new Error('This detection was edited after the upstream sync. Revert is disabled to avoid losing those edits.');
    }
  }

  const drift = await getDriftForDetection(detectionId);
  const externalId = drift?.external_id ?? detection.external_id ?? 'rule';
  const path = drift?.upstream_path ?? null;

  const rule = await parseRule(oldVm.previousRawContent, path, externalId);
  const overwrite = buildOverwriteFromRule(rule, detection, { keepName: false });

  const now = new Date().toISOString();
  const newVm: VendorMetadata = {
    sourceFormat: rule.sourceFormat,
    rawContent: oldVm.previousRawContent,
    vendorFields: (oldVm.vendorFields as Record<string, unknown>) ?? {},
    importedAt: oldVm.importedAt ?? now,
    importJobId: oldVm.importJobId,
    // lastSyncedAt cleared; previousRawContent cleared (one level of undo)
  };

  const merged: Partial<Detection> = { ...detection, ...overwrite };
  const qualityScore = scoreDetection(merged).score;

  const { error: upErr } = await supabase
    .from('detections')
    .update({ ...overwrite, qualityScore, vendor_metadata: newVm, version: (detection.version ?? 1) + 1, updatedDate: now, updated_by: opts.actorId })
    .eq('id', detectionId);
  if (upErr) throw new Error(`Failed to revert detection: ${upErr.message}`);

  await logAuditEvent({
    action: 'detection.sync_reverted',
    entity_type: 'detection',
    entity_id: detectionId,
    entity_name: detection.name,
    details: { externalId },
  });

  // The detection is now drifted again versus the current upstream snapshot.
  if (drift) {
    let fieldDiffs: unknown[] = [];
    if (drift.upstream_raw_snapshot) {
      try {
        const upstreamRule = await parseRule(drift.upstream_raw_snapshot, path, externalId);
        fieldDiffs = duplicateDetector.compareFields(upstreamRule, {
          detectionQuery: rule.query,
          severity: undefined,
          description: rule.description,
          mitreTechniques: rule.mitreAttackIds,
          tags: rule.tags,
        } as Partial<Detection>);
      } catch { /* leave empty */ }
    }
    await supabase
      .from('detection_drift')
      .update({
        drift_state: drift.upstream_raw_snapshot ? 'upstream_changed' : 'unknown',
        baseline_hash: null, // will be recomputed from vendor_metadata.rawContent on next check
        field_diffs: fieldDiffs,
        resolution: 'reverted',
        resolved_at: now,
        resolved_by: opts.actorId,
      })
      .eq('detection_id', detectionId);
  }
}

// ---------------------------------------------------------------------------
// Bulk + merge actions
// ---------------------------------------------------------------------------

export interface BulkResult {
  succeeded: string[];
  failed: Array<{ detectionId: string; error: string }>;
}

/**
 * Apply upstream to many detections, in series so that one failure doesn't
 * abort the rest. Conflict detections are skipped — the caller should only
 * pass non-conflict ids (the bulk-action UI enforces this). Returns per-id
 * outcomes for the toast/summary.
 */
export async function bulkApplyUpstream(detectionIds: string[], opts: ActorOpt): Promise<BulkResult> {
  const result: BulkResult = { succeeded: [], failed: [] };
  for (const id of detectionIds) {
    try {
      await applyUpstream(id, opts);
      result.succeeded.push(id);
    } catch (e) {
      result.failed.push({ detectionId: id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}

/**
 * Mark many detections (typically conflicts) as Keep mine, in series. Mirrors
 * bulkApplyUpstream's per-id error tolerance. Used after a global comparator
 * fix to clear false-conflict noise without going through each rule by hand.
 */
export async function bulkKeepMine(detectionIds: string[], opts: ActorOpt): Promise<BulkResult> {
  const result: BulkResult = { succeeded: [], failed: [] };
  for (const id of detectionIds) {
    try {
      await keepMine(id, opts);
      result.succeeded.push(id);
    } catch (e) {
      result.failed.push({ detectionId: id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}

/**
 * Pull every cosmetic-only upstream change for one source — those whose hash
 * shifted but whose parsed fields didn't. Frees the user from clicking through
 * hundreds of "vendor added a comment" diffs.
 */
export async function bulkAcceptCosmetic(
  sourceUrl: string,
  targetLibrary: string,
  opts: ActorOpt,
): Promise<BulkResult> {
  const { data, error } = await supabase
    .from('detection_drift')
    .select('detection_id, field_diffs, drift_state')
    .eq('source_url', sourceUrl)
    .eq('target_library', targetLibrary)
    .eq('drift_state', 'upstream_changed');
  if (error) throw new Error(`Failed to load cosmetic candidates: ${error.message}`);

  const ids: string[] = [];
  for (const r of (data ?? []) as Array<{ detection_id: string; field_diffs: unknown }>) {
    if (Array.isArray(r.field_diffs) && r.field_diffs.length === 0) ids.push(r.detection_id);
  }
  if (ids.length === 0) return { succeeded: [], failed: [] };
  return bulkApplyUpstream(ids, opts);
}

/**
 * Merge variant of applyUpstream — overlays the user's hand-edited query body
 * on top of the upstream rule. Used by the conflict view's "Edit & Accept" mode
 * so reviewers can keep some of their local query while still pulling upstream
 * field updates (severity/MITRE/tags/description/…).
 */
export async function applyUpstreamWithEdits(
  detectionId: string,
  editedQuery: string,
  opts: ActorOpt,
): Promise<void> {
  const drift = await getDriftForDetection(detectionId);
  if (!drift) throw new Error('No drift record for this detection — run a drift check first.');
  if (drift.drift_state === 'upstream_removed') throw new Error('This rule no longer exists upstream — there is nothing to pull.');
  if (!drift.upstream_raw_snapshot) throw new Error('No upstream snapshot stored — re-run the drift check first.');

  const { data: det, error } = await supabase.from('detections').select('*').eq('id', detectionId).single();
  if (error || !det) throw new Error('Detection not found.');
  const detection = det as DetectionRow;

  const rule = await parseRule(drift.upstream_raw_snapshot, drift.upstream_path, drift.external_id);
  const ruleWithEditedQuery: ParsedRule = { ...rule, query: editedQuery };
  const overwrite = buildOverwriteFromRule(ruleWithEditedQuery, detection, { keepName: true });

  const oldVm = (detection.vendor_metadata ?? {}) as Partial<VendorMetadata>;
  const now = new Date().toISOString();
  const newVm: VendorMetadata = {
    sourceFormat: rule.sourceFormat,
    rawContent: drift.upstream_raw_snapshot,
    vendorFields: (oldVm.vendorFields as Record<string, unknown>) ?? {},
    importedAt: oldVm.importedAt ?? now,
    importJobId: oldVm.importJobId,
    lastSyncedAt: now,
    previousRawContent: oldVm.rawContent,
  };

  const merged: Partial<Detection> = { ...detection, ...overwrite };
  const qualityScore = scoreDetection(merged).score;

  const { error: upErr } = await supabase
    .from('detections')
    .update({ ...overwrite, qualityScore, vendor_metadata: newVm, version: (detection.version ?? 1) + 1, updatedDate: now, updated_by: opts.actorId })
    .eq('id', detectionId);
  if (upErr) throw new Error(`Failed to update detection: ${upErr.message}`);

  await logAuditEvent({
    action: 'detection.upstream_synced',
    entity_type: 'detection',
    entity_id: detectionId,
    entity_name: detection.name,
    details: { externalId: drift.external_id, sourceUrl: drift.source_url, upstreamPath: drift.upstream_path, mergedEdits: true },
  });

  const { error: dErr } = await supabase
    .from('detection_drift')
    .update({
      drift_state: 'in_sync',
      baseline_hash: drift.upstream_hash,
      field_diffs: [],
      resolution: 'accepted',
      resolved_at: now,
      resolved_by: opts.actorId,
    })
    .eq('detection_id', detectionId);
  if (dErr) throw new Error(`Failed to update drift record: ${dErr.message}`);
}
