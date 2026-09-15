import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { nativeSiemService, type NativePreview, type NativeDrift } from '@/services/nativeSiemService';
import { NativeLocalEditor } from './NativeLocalEditor';

export const NATIVE_DRIFT_LABELS: Record<NativeDrift, string> = {
  in_sync: 'Matches CrowdStrike',
  local_changed: 'Library changes not sent',
  remote_changed: 'Changed in CrowdStrike',
  conflict: 'Changed in both places',
  missing: 'No longer in CrowdStrike',
  no_baseline: 'Linked, not yet reconciled',
  unknown: 'Comparison unavailable',
};

export function NativeRuleReview({ bindingId, onChanged }: { bindingId: string; onChanged?: () => void }) {
  const [preview, setPreview] = useState<NativePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'update' | 'enable' | 'disable' | 'delete' | 'accept' | 'reconcile' | 'restore' | null>(
    null,
  );
  const [editing, setEditing] = useState(false);
  const [showBaseline, setShowBaseline] = useState(false);
  const [revisions, setRevisions] = useState<Awaited<ReturnType<typeof nativeSiemService.revisions>>>([]);
  const [revisionId, setRevisionId] = useState('');
  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await nativeSiemService.preview(bindingId);
      setPreview(result);
      setRevisions(await nativeSiemService.revisions(result.binding.detection_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load comparison');
    }
  }, [bindingId]);
  useEffect(() => {
    void load();
  }, [load]);
  const apply = async () => {
    if (!preview || !confirm) return;
    setBusy(true);
    setError(null);
    try {
      if (confirm === 'accept') await nativeSiemService.accept(preview);
      else if (confirm === 'reconcile') await nativeSiemService.reconcile(preview);
      else if (confirm === 'restore') await nativeSiemService.restore(preview, revisionId);
      else await nativeSiemService.apply(preview, confirm);
      setConfirm(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  };
  // The baseline pane is only rendered when a baseline exists; this keeps that guarantee local
  // rather than asserting it with a non-null assertion at five call sites.
  const withBaseline = preview?.baseline != null;
  const pane = (key: 'baseline' | 'local' | 'remote') =>
    key === 'baseline' ? (preview!.baseline ?? preview!.remote) : preview![key];
  return (
    <div className="space-y-4 py-4">
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      {!preview ? (
        <Button variant="text" onClick={load}>
          Load production comparison
        </Button>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <strong>{NATIVE_DRIFT_LABELS[preview.drift]}</strong>
            <span className="text-xs text-on-surface-variant">
              CrowdStrike last checked {new Date(preview.binding.last_seen_at).toLocaleString()}
            </span>
            <Button size="sm" variant="text" onClick={load}>
              Refresh saved comparison
            </Button>
          </div>
          {preview.drift === 'no_baseline' && (
            <div className="p-3 rounded-xl bg-surface-container-high border border-outline-variant">
              <p className="text-sm font-semibold">These two versions have never been reconciled</p>
              <p className="text-sm text-on-surface-variant mt-1">
                This library rule was linked to a CrowdStrike rule whose query already differed, so there is no
                agreed version to compare against. Until you decide, Optimus cannot tell which side changed.
              </p>
            </div>
          )}
          {/* Nothing to reveal when the two sides were never reconciled: there is no previous
              matching version, and offering the toggle would imply one exists. */}
          {withBaseline && (
            <Button size="sm" variant="text" onClick={() => setShowBaseline(!showBaseline)}>
              {showBaseline ? 'Hide previous matching version' : 'Show previous matching version'}
            </Button>
          )}
          <div className={`grid grid-cols-1 ${showBaseline && withBaseline ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-3`}>
            {(showBaseline && withBaseline
              ? (['baseline', 'local', 'remote'] as const)
              : (['local', 'remote'] as const)
            ).map((key) => (
              <section key={key} className="min-w-0 p-3 rounded-xl bg-surface-container-high">
                <h4 className="text-sm font-semibold mb-2">
                  {
                    {
                      baseline: 'Previous matching version',
                      local: 'In your library',
                      remote: 'In CrowdStrike · last fetched',
                    }[key]
                  }
                </h4>
                <p className="text-sm mb-2">
                  {pane(key).name} · {pane(key).severity} ·{' '}
                  {pane(key).enabled === null ? 'Unknown state' : pane(key).enabled ? 'Enabled' : 'Disabled'}
                </p>
                <pre className="text-xs whitespace-pre-wrap break-words max-h-72 overflow-auto font-mono">
                  {pane(key).query}
                </pre>
                <details className="mt-3 text-xs">
                  <summary>Configuration and description</summary>
                  <p className="mt-2 whitespace-pre-wrap">{pane(key).description}</p>
                  <pre className="whitespace-pre-wrap break-words mt-2">
                    {JSON.stringify(pane(key).config, null, 2)}
                  </pre>
                </details>
              </section>
            ))}
          </div>
          <p className="text-sm text-on-surface-variant">
            Library edits stay in Optimus until you send them to CrowdStrike. Fetch rules again to check for newer
            changes made in CrowdStrike.
          </p>
          {!preview.writesEnabled && (
            <p className="text-sm text-on-surface-variant">
              Sending changes to CrowdStrike is not enabled for this connection. You can edit your library copy and
              bring in changes from CrowdStrike.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="tonal" disabled={busy} onClick={() => setEditing(!editing)}>
              Edit library copy
            </Button>
            <Button
              size="sm"
              variant="tonal"
              disabled={busy || preview.binding.availability !== 'present' || preview.drift === 'in_sync'}
              onClick={() => setConfirm('accept')}
            >
              Replace library copy with CrowdStrike version
            </Button>
            {preview.drift === 'no_baseline' && (
              <Button
                size="sm"
                variant="tonal"
                disabled={busy || preview.binding.availability !== 'present'}
                onClick={() => setConfirm('reconcile')}
              >
                Keep library version and mark reconciled
              </Button>
            )}
            {preview.writesEnabled && (
              <>
                <Button
                  size="sm"
                  disabled={busy || preview.drift === 'missing' || preview.drift === 'in_sync'}
                  onClick={() => setConfirm('update')}
                >
                  Send changes to CrowdStrike
                </Button>
                <Button
                  size="sm"
                  variant="text"
                  disabled={busy || !preview.writesEnabled}
                  onClick={() => setConfirm(preview.remote.enabled ? 'disable' : 'enable')}
                >
                  {preview.remote.enabled ? 'Disable' : 'Enable'} in SIEM
                </Button>
                <Button
                  size="sm"
                  variant="text"
                  color="error"
                  disabled={busy || !preview.writesEnabled}
                  onClick={() => setConfirm('delete')}
                >
                  Delete from CrowdStrike
                </Button>
              </>
            )}
          </div>
          {editing && (
            <NativeLocalEditor
              key={preview.localVersion}
              preview={preview}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                void load();
                onChanged?.();
              }}
            />
          )}
          {!!revisions.length && (
            <details className="text-sm">
              <summary>Library version history ({revisions.length})</summary>
              <ul className="mt-2 space-y-2">
                {revisions.map((revision) => (
                  <li key={revision.id} className="flex gap-3 items-center">
                    <span>
                      Version {revision.content.version} · {new Date(revision.created_at).toLocaleString()}
                    </span>
                    <Button
                      size="sm"
                      variant="text"
                      disabled={busy}
                      onClick={() => {
                        setRevisionId(revision.id);
                        setConfirm('restore');
                      }}
                    >
                      Restore library version
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {confirm && (
            <div
              role="alertdialog"
              aria-label="Confirm production rule change"
              className="rounded-xl border border-outline-variant p-4 space-y-3"
            >
              <p className="text-sm">
                {confirm === 'restore'
                  ? 'Restore this historical query and configuration into a new local revision? Production will not change.'
                  : confirm === 'accept'
                    ? 'Replace the saved library query and supported configuration with the observed production version?'
                    : confirm === 'reconcile'
                    ? 'Keep the library version as it is and record the current CrowdStrike version as the one it diverged from? Neither the library rule nor production changes.'
                    : `${confirm === 'delete' ? 'Delete' : confirm === 'update' ? 'Update' : confirm === 'enable' ? 'Enable' : 'Disable'} production rule “${preview.remote.name}” (${preview.binding.vendor_rule_id})?`}
              </p>
              <p className="text-xs text-on-surface-variant">
                {confirm === 'reconcile'
                  ? 'Future comparisons will show your library edits as unsent changes rather than an unresolved link.'
                  : confirm === 'accept' || confirm === 'restore'
                  ? 'The previous local revision is retained in history.'
                  : 'The server will recheck production for changes before applying this action.'}
              </p>
              <Button size="sm" disabled={busy} onClick={apply}>
                {busy ? 'Applying…' : 'Confirm'}
              </Button>
              <Button size="sm" variant="text" disabled={busy} onClick={() => setConfirm(null)}>
                Cancel
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
