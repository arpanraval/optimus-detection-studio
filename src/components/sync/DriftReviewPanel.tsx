import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DiffEditor, Editor } from '@monaco-editor/react';
import { Icon } from '../Icon';
import { Button } from '../ui';
import { ConfirmDialog } from '../ui';
import { DriftBadge } from './DriftBadge';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../hooks/useToast';
import { useAppData } from '../../router/AppDataContext';
import { supabase } from '../../lib/supabaseClient';
import { parserFactory } from '../../services/bulk-import/parsers/ParserFactory';
import { applyUpstream, applyUpstreamWithEdits, keepMine, dismissDrift, acknowledgeRemoved } from '../../services/drift/driftMutations';
import type { DriftItem } from '../../services/drift/types';
import type { FieldDiff } from '../../services/bulk-import/types';

type CompareView = 'upstream-vs-baseline' | 'yours-vs-baseline' | 'yours-vs-upstream';

interface DriftReviewPanelProps {
  item: DriftItem;
  sourceUrl?: string;
  onClose: () => void;
  /** Called after a successful action so the caller can refresh. */
  onResolved: () => void;
}

const OVERWRITTEN_FIELDS = [
  'name (unless you renamed it locally)',
  'description', 'severity', 'detection query', 'MITRE techniques & tactics',
  'tags', 'references', 'associated CVEs', 'data sources', 'platforms',
  'false-positive guidance', 'source URL',
];
const PRESERVED_FIELDS = [
  'status & maturity', 'library (Development/Production)', 'assignments & reviews',
  'comments & notes', 'deployments', 'scoring overrides', 'test cases',
  'threat-intel links', 'investigation steps you added',
];

function monacoLang(lang?: string): string {
  const n = (lang || '').toLowerCase();
  if (n.includes('spl') || n.includes('splunk')) return 'spl';
  if (n.includes('kql') || n.includes('kusto') || n.includes('sentinel')) return 'kql';
  if (n.includes('sql')) return 'sql';
  if (n.includes('yaml') || n.includes('sigma') || n.includes('yara')) return 'yaml';
  if (n.includes('toml')) return 'ini';
  if (n.includes('python')) return 'python';
  if (n.includes('json') || n.includes('elastic') || n.includes('eql')) return 'json';
  return 'plaintext';
}

interface LoadedContext {
  currentQuery: string;
  baselineQuery: string;
  upstreamQuery: string;
  baselineRaw: string;
  upstreamRaw: string;
  queryLanguage: string;
  /** True when the upstream raw exists but our parser can't extract a rule from it. */
  upstreamUnparseable: boolean;
}

/** Approximate value length to decide whether to stack the diff vertically. */
function valueLen(v: unknown): number {
  if (v == null || v === '') return 0;
  if (Array.isArray(v)) return v.join(', ').length;
  return String(v).length;
}

const SideBadge: React.FC<{ side: 'yours' | 'upstream' }> = ({ side }) => (
  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mr-2 ${
    side === 'yours' ? 'bg-[#A63D40]/15 text-[#A63D40] dark:text-rose-400' : 'bg-[#4D7C6F]/15 text-[#4D7C6F]'
  }`}>
    <span className={`w-1.5 h-1.5 rounded-full ${side === 'yours' ? 'bg-[#A63D40] dark:bg-rose-400' : 'bg-[#4D7C6F]'}`} />
    {side}
  </span>
);

const FieldDiffRow: React.FC<{ diff: FieldDiff }> = ({ diff }) => {
  const renderVal = (v: unknown) => {
    if (Array.isArray(v)) return v.length ? v.join(', ') : <span className="text-on-surface-variant/50 italic">none</span>;
    if (v === '' || v == null) return <span className="text-on-surface-variant/50 italic">empty</span>;
    return String(v);
  };
  const label = ({ detectionQuery: 'Detection query', severity: 'Severity', description: 'Description', mitreTechniques: 'MITRE techniques', tags: 'Tags' } as Record<string, string>)[diff.field] ?? diff.field;
  // Stack vertically for long values; otherwise keep the compact label/value grid.
  const longValue = valueLen(diff.oldValue) > 80 || valueLen(diff.newValue) > 80;
  if (longValue) {
    return (
      <div className="py-2.5 border-b border-outline-variant/15 last:border-0 text-[13px]">
        <div className="font-semibold text-on-surface mb-1.5">{label}</div>
        <div className="space-y-1.5">
          <div className="text-on-surface-variant"><SideBadge side="yours" />{renderVal(diff.oldValue)}</div>
          <div className="text-on-surface"><SideBadge side="upstream" />{renderVal(diff.newValue)}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 py-2 border-b border-outline-variant/15 last:border-0 text-[13px]">
      <div className="font-semibold text-on-surface">{label}</div>
      <div className="space-y-1">
        <div className="text-on-surface-variant"><SideBadge side="yours" />{renderVal(diff.oldValue)}</div>
        <div className="text-on-surface"><SideBadge side="upstream" />{renderVal(diff.newValue)}</div>
      </div>
    </div>
  );
};

/**
 * Detect persisted field_diffs that were computed by the *old* buggy comparator
 * (compared incoming.mitreAttackIds against existing.mitreTechniques NAMES).
 * Heuristic: a `mitreTechniques` diff where one side is technique IDs (T1234)
 * and the other side is human names (capitalised words). The rule didn't
 * actually drift — re-check the source to refresh.
 */
const TID = /^T\d+(\.\d+)?$/;
function looksLikeStaleMitreDiff(diffs: FieldDiff[]): boolean {
  const mitre = diffs.find((d) => d.field === 'mitreTechniques');
  if (!mitre) return false;
  const oldArr = Array.isArray(mitre.oldValue) ? mitre.oldValue.map(String) : [];
  const newArr = Array.isArray(mitre.newValue) ? mitre.newValue.map(String) : [];
  if (oldArr.length === 0 || newArr.length === 0) return false;
  const oldAllIds = oldArr.every((s) => TID.test(s));
  const newAllIds = newArr.every((s) => TID.test(s));
  // Stale pattern: exactly one side is all IDs and the other is mixed/names.
  return oldAllIds !== newAllIds;
}

export const DriftReviewPanel: React.FC<DriftReviewPanelProps> = ({ item, sourceUrl, onClose, onResolved }) => {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const { profile } = useAppData();
  const actorId = profile?.id ?? '';
  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'light';

  const [ctx, setCtx] = useState<LoadedContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showFullDiff, setShowFullDiff] = useState(false);
  const [showWhatChanges, setShowWhatChanges] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmAccept, setConfirmAccept] = useState(false);

  const isRemoved = item.driftState === 'upstream_removed';
  const isConflict = item.driftState === 'conflict';
  // Either flagged by the comparator (fresh check) or detected on load (persisted row).
  const isUnparseable = !!item.upstreamUnparseable || !!ctx?.upstreamUnparseable;

  // Compare view default — conflicts start with yours-vs-upstream so the user
  // sees both sides immediately; non-conflicts start with upstream-vs-baseline.
  const [view, setView] = useState<CompareView>(isConflict ? 'yours-vs-upstream' : 'upstream-vs-baseline');

  // Edit & Accept mode (conflicts only) — pre-filled with the upstream query.
  const [mergeMode, setMergeMode] = useState(false);
  const [mergedQuery, setMergedQuery] = useState('');

  // Esc closes — basic modal a11y.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmAccept) setConfirmAccept(false);
        else if (mergeMode) setMergeMode(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmAccept, mergeMode, onClose]);

  const staleMitreDiff = looksLikeStaleMitreDiff(item.fieldDiffs);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await parserFactory.initialize();
        const { data: det, error } = await supabase
          .from('detections')
          .select('"detectionQuery", "queryLanguage", vendor_metadata')
          .eq('id', item.detectionId)
          .maybeSingle();
        if (error) throw error;
        const currentQuery = (det as { detectionQuery?: string } | null)?.detectionQuery ?? '';
        const queryLanguage = (det as { queryLanguage?: string } | null)?.queryLanguage ?? 'plaintext';
        const vm = ((det as { vendor_metadata?: { rawContent?: string } } | null)?.vendor_metadata ?? {}) as { rawContent?: string };
        const baselineRaw = vm.rawContent ?? '';
        const upstreamRaw = item.upstreamRaw ?? '';

        let upstreamUnparseable = false;
        const parseQuery = (raw: string, fallback: string, recordUnparseable = false): string => {
          if (!raw) return fallback;
          try {
            const r = parserFactory.parse(raw, `${item.externalId}.yml`, item.upstreamPath ?? undefined);
            if (r?.success && r.rule) return r.rule.query;
            if (recordUnparseable) upstreamUnparseable = true;
            return fallback;
          } catch {
            if (recordUnparseable) upstreamUnparseable = true;
            return fallback;
          }
        };
        const baselineQuery = parseQuery(baselineRaw, currentQuery);
        const upstreamQuery = parseQuery(upstreamRaw, currentQuery, true);

        if (!cancelled) {
          setCtx({ currentQuery, baselineQuery, upstreamQuery, baselineRaw, upstreamRaw, queryLanguage, upstreamUnparseable });
          setMergedQuery(upstreamQuery);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [item.detectionId, item.externalId, item.upstreamRaw, item.upstreamPath]);

  const sourceFileUrl = useMemo(() => {
    if (!sourceUrl || !item.upstreamPath) return null;
    const m = sourceUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\/tree\/([^/]+)(?:\/.*)?)?$/);
    if (!m) return null;
    const ref = m[3] || 'HEAD';
    return `https://github.com/${m[1]}/${m[2]}/blob/${ref}/${item.upstreamPath}`;
  }, [sourceUrl, item.upstreamPath]);

  const runAction = useCallback(async (fn: () => Promise<void>, successMsg: string) => {
    if (!actorId) { showToast('error', 'Not signed in', 'Could not determine the acting user.'); return; }
    setBusy(true);
    try {
      await fn();
      showToast('success', successMsg, item.detectionName);
      onResolved();
      onClose();
    } catch (e) {
      showToast('error', 'Action failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [actorId, showToast, item.detectionName, onResolved, onClose]);

  const diffOpts = { readOnly: true, renderSideBySide: true, minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 12 } as const;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Review drift: ${item.detectionName}`}
    >
      <div className="bg-surface dark:bg-surface-container w-full max-w-7xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant/30 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-bold text-on-surface truncate">{item.detectionName}</h2>
              <DriftBadge state={item.driftState} size="sm" />
            </div>
            <div className="mt-1 flex items-center gap-3 text-[12px] text-on-surface-variant/70 flex-wrap">
              <span className="font-mono">{item.externalId}</span>
              {item.upstreamPath && <span className="font-mono">{item.upstreamPath}</span>}
              {sourceFileUrl && (
                <a href={sourceFileUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                  <Icon name="external-link" className="w-3 h-3" /> view on GitHub
                </a>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-container-highest text-on-surface-variant" aria-label="Close">
            <Icon name="x-circle" className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {isUnparseable && (
            <div className="rounded-xl border border-[#A6750D]/40 bg-[#A6750D]/10 px-4 py-3 text-[13px] text-on-surface flex items-start gap-2.5">
              <Icon name="alert-triangle" className="w-4 h-4 mt-0.5 text-[#A6750D] dark:text-amber-400 shrink-0" />
              <span>
                The upstream file at <span className="font-mono">{item.upstreamPath ?? 'this path'}</span> still exists and matches this rule's id, but our parser can no longer read it — typically a vendor migration stub (e.g. Azure-Sentinel relocated the rule to <em>Solutions/.../Analytic Rules/</em>) or a schema change. Your local copy is unchanged. <strong>Accept upstream is disabled</strong> because there's no parsed rule to apply; consider re-importing from the rule's new location, or dismissing this notice.
              </span>
            </div>
          )}
          {isConflict && (
            <div className="rounded-xl border border-[#A6750D]/40 bg-[#A6750D]/10 px-4 py-3 text-[13px] text-on-surface flex items-start gap-2.5">
              <Icon name="alert-triangle" className="w-4 h-4 mt-0.5 text-[#A6750D] dark:text-amber-400 shrink-0" />
              <span>You edited this rule locally after importing it. Review the 3-way diff below before accepting — <strong>Accept upstream</strong> will overwrite your edits to the detection content (local-only fields like status, notes and assignments are preserved).</span>
            </div>
          )}

          {loadError && <div className="text-[13px] text-error">Could not load comparison: {loadError}</div>}

          {isRemoved ? (
            <div className="rounded-xl border border-outline-variant/30 bg-surface-container/50 px-4 py-4 text-[13px] text-on-surface-variant">
              This rule no longer appears upstream{item.upstreamPath ? <> (last seen at <span className="font-mono">{item.upstreamPath}</span>)</> : ''}. It may have been deprecated, deleted, or moved to a path outside the imported scope. Your local copy is unchanged — you can mark it deprecated or dismiss this notice.
            </div>
          ) : !ctx ? (
            <div className="flex items-center gap-2 text-[13px] text-on-surface-variant/60 py-8 justify-center">
              <Icon name="refresh-cw" className="w-4 h-4 animate-spin" /> Loading comparison…
            </div>
          ) : (
            <>
              {/* Query diff — single pane driven by the view toggle (Monaco needs the full width) */}
              <div>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <div className="text-[13px] font-semibold text-on-surface">
                    {mergeMode ? 'Edit merged query' : 'Detection query'}
                  </div>
                  {!mergeMode && (
                    <div className="inline-flex rounded-lg bg-surface-container-highest p-0.5 text-[11.5px] font-semibold min-w-[420px]">
                      {([
                        ['upstream-vs-baseline', 'Upstream vs imported'],
                        ['yours-vs-baseline',    'Yours vs imported'],
                        ['yours-vs-upstream',    'Yours vs upstream'],
                      ] as const).map(([k, label]) => (
                        <button
                          key={k}
                          onClick={() => setView(k)}
                          className={`flex-1 px-2.5 py-1 rounded-md transition text-center ${view === k ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {mergeMode ? (
                  <div className="h-72 border border-outline-variant/30 rounded-lg overflow-hidden">
                    <Editor
                      value={mergedQuery}
                      onChange={(v) => setMergedQuery(v ?? '')}
                      language={monacoLang(ctx.queryLanguage)}
                      theme={monacoTheme}
                      options={{ minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 12, wordWrap: 'on' }}
                    />
                  </div>
                ) : (() => {
                  const [original, modified] =
                    view === 'upstream-vs-baseline' ? [ctx.baselineQuery, ctx.upstreamQuery]
                    : view === 'yours-vs-baseline'  ? [ctx.baselineQuery, ctx.currentQuery]
                    :                                 [ctx.currentQuery, ctx.upstreamQuery];
                  return (
                    <div className="h-72 border border-outline-variant/30 rounded-lg overflow-hidden">
                      <DiffEditor original={original} modified={modified} language={monacoLang(ctx.queryLanguage)} theme={monacoTheme} options={diffOpts} />
                    </div>
                  );
                })()}
              </div>

              {/* Field diffs */}
              {item.fieldDiffs.length > 0 ? (
                <div>
                  <div className="text-[13px] font-semibold text-on-surface mb-1">Field changes</div>
                  {staleMitreDiff && (
                    <div className="rounded-lg border border-[#A6750D]/40 bg-[#A6750D]/10 px-3.5 py-2.5 mb-2 text-[12.5px] text-on-surface flex items-start gap-2">
                      <Icon name="info" className="w-3.5 h-3.5 mt-0.5 text-[#A6750D] dark:text-amber-400 shrink-0" />
                      <span>
                        These differences look like they were computed by an older version of the drift checker (MITRE technique IDs vs human-readable names). The rule probably hasn't actually drifted — <strong>re-check this source</strong> from the source row to refresh.
                      </span>
                    </div>
                  )}
                  <div className="rounded-xl border border-outline-variant/20 bg-surface-container/40 px-4">
                    {item.fieldDiffs.map((d, i) => <FieldDiffRow key={`${d.field}-${i}`} diff={d} />)}
                  </div>
                </div>
              ) : (
                <div className="text-[13px] text-on-surface-variant/70">
                  No structured field changes — the upstream file changed cosmetically (comments, formatting, or fields we don't track). Accepting just refreshes the baseline.
                </div>
              )}

              {/* Full file diff (collapsible) */}
              {(ctx.baselineRaw || ctx.upstreamRaw) && (
                <div>
                  <button onClick={() => setShowFullDiff((v) => !v)} className="text-[13px] font-semibold text-on-surface inline-flex items-center gap-1.5 hover:text-primary">
                    <Icon name={showFullDiff ? 'chevron-down' : 'chevron-right'} className="w-4 h-4" />
                    Full upstream file diff
                  </button>
                  {showFullDiff && (
                    <div className="mt-2 h-72 border border-outline-variant/30 rounded-lg overflow-hidden">
                      <DiffEditor original={ctx.baselineRaw || '(no baseline stored)'} modified={ctx.upstreamRaw || '(upstream snapshot unavailable)'} language="yaml" theme={monacoTheme} options={diffOpts} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* What "Accept upstream" changes (collapsible) */}
          {!isRemoved && (
            <div>
              <button onClick={() => setShowWhatChanges((v) => !v)} className="text-[13px] font-semibold text-on-surface inline-flex items-center gap-1.5 hover:text-primary">
                <Icon name={showWhatChanges ? 'chevron-down' : 'chevron-right'} className="w-4 h-4" />
                What "Accept upstream" will change
              </button>
              {showWhatChanges && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[12.5px]">
                  <div>
                    <div className="font-semibold text-[#0284C7] mb-1">Overwritten from upstream</div>
                    <ul className="list-disc list-inside space-y-0.5 text-on-surface-variant">
                      {OVERWRITTEN_FIELDS.map((f) => <li key={f}>{f}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div className="font-semibold text-[#4D7C6F] mb-1">Preserved (untouched)</div>
                    <ul className="list-disc list-inside space-y-0.5 text-on-surface-variant">
                      {PRESERVED_FIELDS.map((f) => <li key={f}>{f}</li>)}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-outline-variant/30 flex items-center justify-end gap-2 flex-wrap bg-surface-container-lowest/40">
          {isRemoved ? (
            <>
              <Button color="secondary" size="sm" onClick={onClose} disabled={busy}>Close</Button>
              <Button color="secondary" size="sm" leadingIcon="shield-check" disabled={busy}
                onClick={() => runAction(() => acknowledgeRemoved(item.detectionId, { actorId, markDeprecated: true }), 'Marked deprecated')}>
                Mark deprecated
              </Button>
              <Button color="primary" size="sm" leadingIcon="x-circle" disabled={busy}
                onClick={() => runAction(() => acknowledgeRemoved(item.detectionId, { actorId }), 'Dismissed')}>
                Dismiss
              </Button>
            </>
          ) : mergeMode ? (
            <>
              <Button color="secondary" size="sm" onClick={() => setMergeMode(false)} disabled={busy}>Back to diff</Button>
              <Button color="primary" size="sm" leadingIcon="check-circle" disabled={busy || !ctx || !mergedQuery.trim()}
                onClick={() => runAction(() => applyUpstreamWithEdits(item.detectionId, mergedQuery, { actorId }), 'Saved merged version')}>
                Save merged
              </Button>
            </>
          ) : (
            <>
              <Button color="secondary" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button color="secondary" size="sm" leadingIcon="x-circle" disabled={busy}
                onClick={() => runAction(() => dismissDrift(item.detectionId, { actorId }), 'Dismissed for now')}>
                Dismiss
              </Button>
              <Button color="secondary" size="sm" leadingIcon="shield-check" disabled={busy}
                onClick={() => runAction(() => keepMine(item.detectionId, { actorId }), 'Kept your version')}>
                Keep mine
              </Button>
              {isConflict && (
                <Button color="secondary" size="sm" leadingIcon="edit" disabled={busy || !ctx || isUnparseable}
                  onClick={() => setMergeMode(true)}>
                  Edit &amp; Accept
                </Button>
              )}
              <Button color="primary" size="sm" leadingIcon="arrow-down" disabled={busy || !ctx || isUnparseable}
                title={isUnparseable ? 'Upstream file is no longer parseable — nothing to apply' : undefined}
                onClick={() => { if (isConflict) setConfirmAccept(true); else runAction(() => applyUpstream(item.detectionId, { actorId }), 'Synced from upstream'); }}>
                Accept upstream
              </Button>
            </>
          )}
        </div>
      </div>

      {confirmAccept && (
        <ConfirmDialog
          isOpen
          variant="warning"
          title="Overwrite your local edits?"
          message={`You edited "${item.detectionName}" after importing it. Accepting upstream replaces the detection content (query, description, severity, MITRE, tags, …). Local-only fields like status, notes, assignments and deployments are kept. This can be reverted afterwards.`}
          confirmLabel="Accept upstream"
          cancelLabel="Cancel"
          onConfirm={() => { setConfirmAccept(false); runAction(() => applyUpstream(item.detectionId, { actorId }), 'Synced from upstream'); }}
          onClose={() => setConfirmAccept(false)}
        />
      )}
    </div>
  );
};

export default DriftReviewPanel;
