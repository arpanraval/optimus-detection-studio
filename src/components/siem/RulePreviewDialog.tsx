import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { nativeSiemService, type RuleContent } from '@/services/nativeSiemService';
import type { InventoryRow } from '../../../supabase/functions/_shared/native-siem-model';
import { ruleSettingRows } from './ruleSettings';

const TABS = ['overview', 'query', 'configuration', 'dependencies'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  query: 'Query',
  configuration: 'Configuration',
  dependencies: 'Dependencies',
};

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
  connectionName,
}: {
  row: InventoryRow;
  onClose: () => void;
  providerName?: string;
  connectionName?: string;
}): React.JSX.Element {
  const [content, setContent] = React.useState<RuleContent | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>('overview');
  const [showRaw, setShowRaw] = React.useState(false);
  const [rawPayload, setRawPayload] = React.useState<string | null>(null);
  const [rawError, setRawError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setShowRaw(false);
    setRawPayload(null);
    setRawError(null);
  }, [row.latest_snapshot_id]);

  React.useEffect(() => {
    if (!showRaw || !row.latest_snapshot_id) return;
    let cancelled = false;
    setRawError(null);
    void nativeSiemService.remoteSnapshotPayload(row.latest_snapshot_id).then((payload) => {
      if (!cancelled) setRawPayload(JSON.stringify(payload, null, 2));
    }).catch((err: unknown) => {
      if (!cancelled) setRawError(err instanceof Error ? err.message : 'Could not load the source payload');
    });
    return () => { cancelled = true; };
  }, [showRaw, row.latest_snapshot_id]);

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
            <div role="tablist" aria-label="Rule preview" className="flex gap-1 border-b border-outline-variant/30">
              {TABS.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  role="tab"
                  aria-selected={tab === candidate}
                  className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-t ${
                    tab === candidate
                      ? 'border-primary text-primary'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                  onClick={() => setTab(candidate)}
                >
                  {TAB_LABELS[candidate]}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <div role="tabpanel" className="space-y-3">
                <p className="text-sm">
                  {content.severity} ·{' '}
                  {content.enabled === null ? 'Unknown state' : content.enabled ? 'Enabled' : 'Disabled'} ·{' '}
                  {content.language}
                </p>
                {content.description && (
                  <p className="whitespace-pre-wrap text-sm text-on-surface-variant">{content.description}</p>
                )}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-on-surface-variant">Source connection</dt>
                  <dd className="text-on-surface">{connectionName ?? providerName}</dd>
                  <dt className="text-on-surface-variant">Rule family</dt>
                  <dd className="text-on-surface">{row.rule_family}</dd>
                  {row.provider_scope && <>
                    <dt className="text-on-surface-variant">Scope</dt>
                    <dd className="text-on-surface break-all">{row.provider_scope}</dd>
                  </>}
                  <dt className="text-on-surface-variant">Observed</dt>
                  <dd className="text-on-surface">
                    <time dateTime={row.last_seen_at}>{new Date(row.last_seen_at).toLocaleString()}</time>
                  </dd>
                </dl>
                {/* Importing copies this revision into the library as a Draft. It is not a
                    deployment, and it does not change anything in the connected SIEM — the only
                    supported local action here is Import; nothing else is offered from a
                    read-only preview. */}
                <p className="text-xs text-on-surface-variant">
                  Supported local action: Import as a Draft. Nothing in {providerName} changes.
                </p>
              </div>
            )}

            {tab === 'query' && (
              <div role="tabpanel">
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-container-high p-3 font-mono text-xs">
                  {content.query}
                </pre>
              </div>
            )}

            {tab === 'configuration' && (
              <div role="tabpanel" className="space-y-3">
                {/* Every field this comparison recognizes, in a fixed order, with an explicit
                    "—" for whatever this provider's normalizer could not map — omitted fields
                    are recorded, never silently hidden. */}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  {ruleSettingRows(content).map((setting) => (
                    <React.Fragment key={setting.label}>
                      <dt className="text-on-surface-variant">{setting.label}</dt>
                      <dd className="text-on-surface break-words">{setting.value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
                <details className="text-xs">
                  <summary className="cursor-pointer">Normalized configuration</summary>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-container-high p-3">
                    {JSON.stringify(content.config, null, 2)}
                  </pre>
                </details>
                <details className="text-xs" open={showRaw} onToggle={(event) => setShowRaw(event.currentTarget.open)}>
                  <summary className="cursor-pointer">Source payload</summary>
                  <p className="mt-2 text-on-surface-variant">Stored provider response, with sensitive fields removed.</p>
                  {rawError ? <p role="alert" className="text-error">{rawError}</p> :
                    rawPayload === null ? <p role="status">Loading source payload</p> :
                      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-container-high p-3">
                        {rawPayload}
                      </pre>}
                </details>
              </div>
            )}

            {tab === 'dependencies' && (
              <div role="tabpanel" className="space-y-2 text-sm">
                <p className="text-on-surface-variant">
                  Dependencies have not been validated. Review referenced tables, lists, functions, and actions in {providerName} before deployment.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
