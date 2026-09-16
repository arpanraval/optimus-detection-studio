import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { nativeSiemService, type RuleContent } from '@/services/nativeSiemService';
import type { InventoryRow } from '../../../supabase/functions/_shared/native-siem-model';

/**
 * Read-only look at a remote SIEM rule that is not in the library yet.
 *
 * Selecting rules for import without being able to read them first meant choosing by name alone.
 * This shows the observation the last scan recorded — deliberately the stored snapshot, not a
 * fresh vendor read: the import freezes that same revision, so previewing anything else would
 * show the user content the import would then refuse as changed.
 */
export function RulePreviewDialog({
  row,
  onClose,
  providerName = 'the connected SIEM',
}: {
  row: InventoryRow;
  onClose: () => void;
  providerName?: string;
}): React.JSX.Element {
  const [content, setContent] = React.useState<RuleContent | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    if (!row.latest_snapshot_id) {
      setError(`This rule has not been read from ${providerName} yet. Fetch rules to read it.`);
      return;
    }
    void nativeSiemService
      .remoteSnapshot(row.latest_snapshot_id)
      .then((result) => {
        if (!cancelled) setContent(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this rule');
      });
    return () => {
      cancelled = true;
    };
  }, [row.latest_snapshot_id, providerName]);

  return (
    <Modal
      title={`Rule in ${providerName}`}
      subject={{ label: 'Rule', value: row.display_name }}
      size="lg"
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <Button size="sm" variant="text" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-on-surface-variant break-all">
          {providerName} ID: <span className="font-mono">{row.vendor_rule_id}</span> · {row.rule_family} · last checked{' '}
          {new Date(row.last_seen_at).toLocaleString()}
        </p>
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        {!content && !error && (
          <div role="status" className="space-y-2">
            <span className="sr-only">Loading rule</span>
            <div className="h-4 w-1/3 animate-pulse rounded bg-surface-container-high" />
            <div className="h-24 animate-pulse rounded bg-surface-container-high" />
          </div>
        )}
        {content && (
          <>
            <p className="text-sm">
              {content.severity} ·{' '}
              {content.enabled === null ? 'Unknown state' : content.enabled ? 'Enabled' : 'Disabled'} ·{' '}
              {content.language}
            </p>
            {content.description && (
              <p className="whitespace-pre-wrap text-sm text-on-surface-variant">{content.description}</p>
            )}
            <section>
              <h3 className="mb-1.5 text-sm font-semibold">Query</h3>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-container-high p-3 font-mono text-xs">
                {content.query}
              </pre>
            </section>
            <details className="text-xs">
              <summary className="cursor-pointer">Configuration</summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-container-high p-3">
                {JSON.stringify(content.config, null, 2)}
              </pre>
            </details>
            {/* Importing copies this revision into the library as a Draft. It is not a deployment,
                and it does not change anything in the connected SIEM. */}
            <p className="text-xs text-on-surface-variant">
              Importing copies this version into your Production Library as a Draft. Nothing in {providerName} changes.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
