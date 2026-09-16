import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/Icon';
import { routeHelpers } from '@/router/routes';
import { importOutcomeLabel } from '../../../supabase/functions/_shared/native-siem-model';
import type { NativeSyncRun, ImportResult } from '@/services/nativeSiemService';

const SUCCESS_STATUSES = new Set(['imported', 'linked', 'unchanged', 'changed']);
const ALREADY_PRESENT_STATUSES = new Set(['linked', 'unchanged', 'changed']);
const SKIPPED_STATUSES = new Set(['skipped', 'ignored', 'ambiguous']);
const PAGE_SIZE = 25;

export interface ImportResultsPanelProps {
  run: NativeSyncRun | null;
  results: ImportResult[];
  displayNames: Record<string, string>;
  /** Which SIEM this run's rules came from, for the 'observed' outcome label. Defaults to
   *  CrowdStrike wording (unchanged) when omitted, for callers that predate multi-provider
   *  support. */
  providerName?: string;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}

/** Durable per-rule outcome view for a submitted import run. Rendered from `siem_sync_items`
 *  rows (read by the caller over PostgREST), so it survives a remount without re-submitting
 *  anything. Outcome vocabulary comes from IMPORT_OUTCOME_LABELS — deliberately disjoint from
 *  the library-membership vocabulary rendered elsewhere in this workspace. */
export function ImportResultsPanel({
  run,
  results,
  displayNames,
  providerName,
  onCancel,
  onRetry,
  onDismiss,
}: ImportResultsPanelProps): React.JSX.Element | null {
  const [page, setPage] = React.useState(0);
  const [problemsOnly, setProblemsOnly] = React.useState(false);
  // A new run is a new result set; leaving the reader on page 7 of the previous import would show
  // an empty table with no explanation.
  React.useEffect(() => {
    setPage(0);
    setProblemsOnly(false);
  }, [run?.id]);

  if (!run) return null;

  const running = ['queued', 'running'].includes(run.status);
  const total = results.length;
  const done = results.filter((item) => item.status !== 'pending').length;
  const importedCount = results.filter((item) => item.status === 'imported').length;
  const alreadyPresentCount = results.filter((item) => ALREADY_PRESENT_STATUSES.has(item.status)).length;
  const skippedCount = results.filter((item) => SKIPPED_STATUSES.has(item.status)).length;
  const failedCount = results.filter((item) => item.status === 'failed').length;
  const changedSincePreviewCount = results.filter((item) => item.status === 'changed_since_preview').length;
  const unsupportedCount = results.filter((item) => item.status === 'unsupported').length;
  const notImportableCount = failedCount + changedSincePreviewCount + unsupportedCount;
  const hasAnySuccess = importedCount + alreadyPresentCount > 0;

  // A 2,000-rule import used to render 2,000 rows. Counters answer "what happened" without
  // scrolling; the table below is for looking up a specific rule, so it pages.
  const counters: Array<{ label: string; value: number }> = [
    { label: 'Newly imported', value: importedCount },
    { label: 'Already present', value: alreadyPresentCount },
    { label: 'Skipped', value: skippedCount },
    { label: 'Changed since you reviewed', value: changedSincePreviewCount },
    { label: 'Not supported', value: unsupportedCount },
    { label: 'Failed', value: failedCount },
  ].filter((counter) => counter.value > 0);

  const needsAttention = results.filter((item) => !SUCCESS_STATUSES.has(item.status) && item.status !== 'pending');
  const visible = problemsOnly ? needsAttention : results;
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  let situationCopy: string;
  if (running) {
    situationCopy = `Importing ${done} of ${total} rules. You can leave this page — the import continues.`;
  } else if (run.status === 'cancelled') {
    situationCopy = `Import cancelled. ${importedCount} rules were already imported and remain in your library.`;
  } else if (!hasAnySuccess) {
    situationCopy = 'None of the selected rules can be imported right now.';
  } else if (notImportableCount > 0) {
    situationCopy = `Imported ${importedCount} rules. ${notImportableCount} could not be imported.`;
  } else if (skippedCount > 0) {
    situationCopy = `Imported ${importedCount} rules. ${skippedCount} were skipped.`;
  } else {
    situationCopy = `Imported ${importedCount} rules into the Production Library.`;
  }

  // Retry only ever resets `failed` items (siem_retry_import's contract). changed_since_preview
  // deliberately cannot be retried — that content differs from what the user reviewed, so it
  // needs a fresh inventory check and a new selection instead.
  const showRetry = !running && failedCount > 0;
  const nonSuccessResults = results.filter((item) => !SUCCESS_STATUSES.has(item.status));
  const showFetchAgain =
    !running &&
    !showRetry &&
    nonSuccessResults.length > 0 &&
    nonSuccessResults.every((item) => item.status === 'changed_since_preview');

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5 space-y-4">
      <div role="status" className="space-y-2">
        <p className="text-sm text-on-surface">{situationCopy}</p>
        {running && total > 0 && <progress className="w-full" value={done} max={total} aria-label="Import progress" />}
      </div>
      {run.error_message && (
        <p role="alert" className="text-xs text-error">
          {run.error_message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {running && (
          <Button size="sm" variant="outlined" color="error" leadingIcon="x" onClick={onCancel}>
            Stop importing
          </Button>
        )}
        {showRetry && (
          <Button size="sm" leadingIcon="refresh-cw" onClick={onRetry}>
            {`Retry ${failedCount} failed`}
          </Button>
        )}
        {!running && (
          <Button size="sm" variant="text" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
      {showFetchAgain && (
        <p className="text-xs text-on-surface-variant">Fetch rules again to review what changed.</p>
      )}
      {counters.length > 0 && (
        <dl aria-label="Import summary" className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
          {counters.map((counter) => (
            <div key={counter.label} className="flex items-baseline gap-1.5">
              <dt className="text-on-surface-variant">{counter.label}</dt>
              <dd className="font-semibold text-on-surface">{counter.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {needsAttention.length > 0 && results.length > PAGE_SIZE && (
        <label className="flex items-center gap-2 text-xs text-on-surface-variant">
          <input
            type="checkbox"
            checked={problemsOnly}
            onChange={() => {
              setProblemsOnly(!problemsOnly);
              setPage(0);
            }}
          />
          {`Show only the ${needsAttention.length} rules that need attention`}
        </label>
      )}
      {results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-on-surface-variant">
                <th className="py-1.5 pr-3 font-medium">Rule</th>
                <th className="py-1.5 pr-3 font-medium">Result</th>
                <th className="py-1.5 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((item) => {
                const name = displayNames[item.vendor_rule_id] ?? item.vendor_rule_id;
                const label = importOutcomeLabel(item.status, providerName);
                const iconName =
                  item.status === 'imported' || ALREADY_PRESENT_STATUSES.has(item.status)
                    ? 'check-circle'
                    : item.status === 'failed'
                      ? 'alert-triangle'
                      : 'info';
                return (
                  <tr key={item.vendor_rule_id} className="border-t border-outline-variant/20">
                    <td className="py-1.5 pr-3 break-all">
                      {item.detection_id ? (
                        <Link className="text-primary hover:underline" to={routeHelpers.detectionDetail(item.detection_id)}>
                          {name}
                        </Link>
                      ) : (
                        <span>{name}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className="inline-flex items-center gap-1">
                        <Icon name={iconName} className="h-3.5 w-3.5" />
                        {label}
                      </span>
                    </td>
                    <td className="py-1.5 text-on-surface-variant">{item.error_message ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 text-xs text-on-surface-variant">
          <span>
            {`Showing ${safePage * PAGE_SIZE + 1}\u2013${Math.min((safePage + 1) * PAGE_SIZE, visible.length)} of ${visible.length}`}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="text" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              Previous
            </Button>
            <Button
              size="sm"
              variant="text"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
