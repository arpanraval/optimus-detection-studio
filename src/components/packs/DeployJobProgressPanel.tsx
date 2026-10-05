/**
 * DeployJobProgressPanel — sticky bottom-right panel showing an active deploy job.
 * Mounted globally via DeployJobContext so it persists across navigation.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { usePackDeployJob } from '../../hooks/usePackDeployJob';
import { cancelJob, retryFailedItems } from '../../lib/packDeployJobService';
import { useToast } from '../../hooks/useToast';

interface Props {
  jobId: string;
  onDismiss: () => void;
}

export const DeployJobProgressPanel: React.FC<Props> = ({ jobId, onDismiss }) => {
  const { job, items, error, refresh } = usePackDeployJob(jobId);
  const [busy, setBusy] = useState(false);
  const actionRef = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const notifiedRef = useRef(false);
  const { showToast } = useToast();

  // Fire a toast once when the job transitions to a terminal state
  useEffect(() => {
    if (!job || notifiedRef.current) return;
    if (job.status === 'succeeded') {
      notifiedRef.current = true;
      if (job.succeeded_count === 0 && job.skipped_count > 0) {
        // All items were skipped (e.g., pack of lab-only detections) — nothing failed, but nothing deployed either.
        showToast(
          'warning',
          'Nothing to Deploy',
          `${job.skipped_count} detection${job.skipped_count !== 1 ? 's' : ''} skipped (lab-only or blocked status)`,
        );
      } else {
        showToast(
          'success',
          'Deploy Complete',
          `${job.succeeded_count} rule${job.succeeded_count !== 1 ? 's' : ''} deployed successfully`,
        );
      }
    } else if (job.status === 'partial') {
      notifiedRef.current = true;
      showToast('warning', 'Deploy Partial', `${job.succeeded_count} succeeded, ${job.failed_count} failed`);
    } else if (job.status === 'failed') {
      notifiedRef.current = true;
      showToast('error', 'Deploy Failed', 'Review the item errors before another deployment');
    } else if (job.status === 'cancelled') {
      notifiedRef.current = true;
      showToast('info', 'Deploy Cancelled', 'Deploy was cancelled');
    }
  }, [job, showToast]);

  useEffect(() => {
    notifiedRef.current = false;
  }, [jobId]);

  if (!job)
    return error ? (
      <div role="alert" className="fixed bottom-4 right-4 z-[100] bg-surface p-4">
        {error}
        <button onClick={() => void refresh()}>Refresh</button>
      </div>
    ) : null;

  const processed = job.succeeded_count + job.failed_count + job.skipped_count;
  const pct = job.total_items > 0 ? Math.round((processed / job.total_items) * 100) : 0;
  const isActive = job.status === 'queued' || job.status === 'running';
  const isDone = !isActive;

  const currentItem = items.find((i) => i.detection_id === job.current_detection_id);

  const runAction = async (action: 'cancel' | 'retry') => {
    if (actionRef.current) return;
    actionRef.current = true;
    setBusy(true);
    try {
      if (action === 'cancel') await cancelJob(jobId);
      else {
        notifiedRef.current = false;
        await retryFailedItems(jobId);
      }
      await refresh();
    } catch (err) {
      showToast('error', 'Deployment action failed', err instanceof Error ? err.message : String(err));
    } finally {
      actionRef.current = false;
      setBusy(false);
    }
  };

  const statusColor = isActive
    ? 'bg-primary '
    : job.status === 'succeeded'
      ? 'bg-secondary'
      : job.status === 'partial'
        ? 'bg-surface-container-highest'
        : job.status === 'cancelled'
          ? 'bg-on-surface-variant/40'
          : 'bg-error';

  const progressBarColor =
    job.status === 'failed'
      ? 'bg-error'
      : job.status === 'partial'
        ? 'bg-surface-container-highest'
        : job.status === 'cancelled'
          ? 'bg-on-surface-variant/40'
          : 'bg-primary';

  const headerText = isActive
    ? 'Deploying Pack'
    : job.status === 'succeeded'
      ? 'Deploy Complete'
      : job.status === 'partial'
        ? 'Deployment partially completed'
        : job.status === 'cancelled'
          ? 'Deploy Cancelled'
          : 'Deploy Failed';

  const failedItems = items.filter((i) => i.status === 'failed');
  const retryableItems = failedItems.filter((i) => i.retryable && !i.needs_reconciliation);
  const skippedItems = items.filter((i) => i.status === 'skipped');

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-[28rem] max-w-[calc(100vw-2rem)] max-h-[80vh] overflow-auto bg-surface-container border border-outline-variant/30 rounded-xl shadow-lg text-on-surface">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/10">
        <div className={`w-2 h-2 rounded-full ${statusColor}`} />
        <span className="font-semibold text-sm text-on-surface flex-1">{headerText}</span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 hover:bg-surface-container-high rounded"
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          <Icon name={collapsed ? 'chevron-up' : 'chevron-down'} className="w-3.5 h-3.5 text-on-surface-variant" />
        </button>
        {isDone && (
          <button onClick={onDismiss} className="p-1 hover:bg-surface-container-high rounded" aria-label="Dismiss">
            <Icon name="x" className="w-3.5 h-3.5 text-on-surface-variant" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="px-4 py-3 space-y-3">
          {(job.detection_packs?.name || job.integrations?.name) && (
            <div className="text-xs text-on-surface-variant space-y-1">
              <p className="font-medium text-on-surface">{job.detection_packs?.name}</p>
              <p>{job.integrations?.name}</p>
            </div>
          )}
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between text-xs text-on-surface-variant mb-1.5">
              <span className="tabular-nums">
                {processed} / {job.total_items} processed
              </span>
              <span className="tabular-nums">{pct}%</span>
            </div>
            <div className="h-1.5 bg-surface rounded-full overflow-hidden">
              <div className={`h-full transition-all ${progressBarColor}`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div>
              <div className="font-bold tabular-nums text-on-surface">{job.succeeded_count}</div>
              <div className="text-on-surface-variant text-[10px]">Success</div>
            </div>
            <div>
              <div className="font-bold tabular-nums text-error">{job.failed_count}</div>
              <div className="text-on-surface-variant text-[10px]">Failed</div>
            </div>
            <div>
              <div className="font-bold tabular-nums text-on-surface-variant">{job.skipped_count}</div>
              <div className="text-on-surface-variant text-[10px]">Skipped</div>
            </div>
            <div>
              <div className="font-bold tabular-nums text-on-surface-variant">{job.total_items - processed}</div>
              <div className="text-on-surface-variant text-[10px]">Pending</div>
            </div>
          </div>

          {/* Current item (running only) */}
          {isActive && currentItem && (
            <div className="text-xs text-on-surface-variant truncate">
              <span className="text-on-surface-variant">Deploying: </span>
              <span className="text-on-surface">{currentItem.detection_name || currentItem.detection_id}</span>
            </div>
          )}

          {/* Failed items details */}
          {failedItems.length > 0 && (
            <div>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-error hover:underline flex items-center gap-1"
              >
                <Icon name={showDetails ? 'chevron-down' : 'chevron-right'} className="w-3 h-3" />
                {failedItems.length} failed
              </button>
              {showDetails && (
                <ul className="mt-2 space-y-3 max-h-64 overflow-auto text-xs">
                  {failedItems.map((item) => (
                    <li key={item.id} className="text-on-surface-variant">
                      <span className="text-on-surface font-medium">{item.detection_name || item.detection_id}</span>
                      {item.error_message && (
                        <details className="mt-1 text-on-surface-variant break-words">
                          <summary className="cursor-pointer">
                            {item.error_message.includes("expected format is 'T####'")
                              ? 'Sentinel rejected a sub-technique ID; its techniques field requires the parent ID.'
                              : 'View failure details'}
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap">{item.error_message}</p>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {isDone && failedItems.length > 0 && retryableItems.length === 0 && (
            <p className="text-xs text-on-surface-variant leading-relaxed">
              These failures cannot be retried automatically. Review the failed detections before a new deployment; do
              not resend successful rules.
            </p>
          )}

          {error && (
            <p role="alert" className="text-xs text-error">
              {error}
            </p>
          )}
          {job.error_message && <p className="text-xs text-error">{job.error_message}</p>}
          {skippedItems.length > 0 && (
            <details className="text-xs">
              <summary>{skippedItems.length} skipped</summary>
              <ul>
                {skippedItems.map((item) => (
                  <li key={item.id}>
                    {item.detection_name}: {item.error_message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {isActive && (
              <Button
                disabled={busy}
                onClick={() => void runAction('cancel')}
                size="sm"
                fullWidth
                variant="outlined"
                color="surface"
              >
                Cancel
              </Button>
            )}
            {(job.status === 'partial' || job.status === 'failed') && retryableItems.length > 0 && (
              <Button disabled={busy} onClick={() => void runAction('retry')} size="sm" fullWidth>
                Retry {retryableItems.length} Failed
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
