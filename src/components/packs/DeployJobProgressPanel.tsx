/**
 * DeployJobProgressPanel — sticky bottom-right panel showing an active deploy job.
 * Mounted globally via DeployJobContext so it persists across navigation.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../Icon';
import { usePackDeployJob } from '../../hooks/usePackDeployJob';
import { cancelJob, retryFailedItems } from '../../lib/packDeployJobService';
import { useToast } from '../../hooks/useToast';

interface Props {
  jobId: string;
  onDismiss: () => void;
}

export const DeployJobProgressPanel: React.FC<Props> = ({ jobId, onDismiss }) => {
  const { job, items } = usePackDeployJob(jobId);
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
        showToast('warning', 'Nothing to Deploy', `${job.skipped_count} detection${job.skipped_count !== 1 ? 's' : ''} skipped (lab-only or blocked status)`);
      } else {
        showToast('success', 'Deploy Complete', `${job.succeeded_count} rule${job.succeeded_count !== 1 ? 's' : ''} deployed successfully`);
      }
    } else if (job.status === 'partial') {
      notifiedRef.current = true;
      showToast('warning', 'Deploy Partial', `${job.succeeded_count} succeeded, ${job.failed_count} failed`);
    } else if (job.status === 'failed') {
      notifiedRef.current = true;
      showToast('error', 'Deploy Failed', 'All detections failed to deploy — click the progress panel to retry');
    } else if (job.status === 'cancelled') {
      notifiedRef.current = true;
      showToast('info', 'Deploy Cancelled', 'Deploy was cancelled');
    }
  }, [job?.status, showToast, job?.succeeded_count, job?.failed_count, job?.skipped_count]);

  if (!job) return null;

  const processed = job.succeeded_count + job.failed_count + job.skipped_count;
  const pct = job.total_items > 0 ? Math.round((processed / job.total_items) * 100) : 0;
  const isActive = job.status === 'queued' || job.status === 'running';
  const isDone = !isActive;

  const currentItem = items.find(i => i.detection_id === job.current_detection_id);

  const handleCancel = async () => {
    await cancelJob(jobId);
  };

  const handleRetry = async () => {
    notifiedRef.current = false;
    await retryFailedItems(jobId);
    showToast('info', 'Retrying', `${job.failed_count} failed item${job.failed_count !== 1 ? 's' : ''} queued for retry`);
  };

  const statusColor = isActive
    ? 'bg-blue-400 animate-pulse'
    : job.status === 'succeeded'
    ? 'bg-emerald-400'
    : job.status === 'partial'
    ? 'bg-yellow-400'
    : job.status === 'cancelled'
    ? 'bg-on-surface-variant/40'
    : 'bg-red-400';

  const progressBarColor = job.status === 'failed'
    ? 'bg-red-400'
    : job.status === 'partial'
    ? 'bg-yellow-400'
    : job.status === 'cancelled'
    ? 'bg-on-surface-variant/40'
    : 'bg-primary';

  const headerText = isActive
    ? 'Deploying Pack'
    : job.status === 'succeeded'
    ? 'Deploy Complete'
    : job.status === 'partial'
    ? 'Deploy Partial'
    : job.status === 'cancelled'
    ? 'Deploy Cancelled'
    : 'Deploy Failed';

  const failedItems = items.filter(i => i.status === 'failed');

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-96 bg-surface-container border border-outline-variant/30 rounded-xl shadow-2xl overflow-hidden">
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
          <button
            onClick={onDismiss}
            className="p-1 hover:bg-surface-container-high rounded"
            aria-label="Dismiss"
          >
            <Icon name="x" className="w-3.5 h-3.5 text-on-surface-variant" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="px-4 py-3 space-y-3">
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between text-xs text-on-surface-variant mb-1.5">
              <span className="tabular-nums">{processed} / {job.total_items}</span>
              <span className="tabular-nums">{pct}%</span>
            </div>
            <div className="h-1.5 bg-surface rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${progressBarColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div>
              <div className="font-bold tabular-nums text-emerald-400">{job.succeeded_count}</div>
              <div className="text-on-surface-variant/60 text-[10px]">Success</div>
            </div>
            <div>
              <div className="font-bold tabular-nums text-red-400">{job.failed_count}</div>
              <div className="text-on-surface-variant/60 text-[10px]">Failed</div>
            </div>
            <div>
              <div className="font-bold tabular-nums text-on-surface-variant">{job.skipped_count}</div>
              <div className="text-on-surface-variant/60 text-[10px]">Skipped</div>
            </div>
            <div>
              <div className="font-bold tabular-nums text-on-surface-variant">{job.total_items - processed}</div>
              <div className="text-on-surface-variant/60 text-[10px]">Pending</div>
            </div>
          </div>

          {/* Current item (running only) */}
          {isActive && currentItem && (
            <div className="text-xs text-on-surface-variant truncate">
              <span className="text-on-surface-variant/60">Deploying: </span>
              <span className="text-on-surface">{currentItem.detection_name || currentItem.detection_id}</span>
            </div>
          )}

          {/* Failed items details */}
          {failedItems.length > 0 && (
            <div>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-red-400 hover:underline flex items-center gap-1"
              >
                <Icon name={showDetails ? 'chevron-down' : 'chevron-right'} className="w-3 h-3" />
                {failedItems.length} failed
              </button>
              {showDetails && (
                <ul className="mt-2 space-y-1 max-h-32 overflow-auto text-[11px]">
                  {failedItems.map(item => (
                    <li key={item.id} className="text-on-surface-variant">
                      <span className="text-on-surface font-medium">{item.detection_name || item.detection_id}</span>
                      {item.error_message && <span className="text-red-400/80"> — {item.error_message}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {isActive && (
              <button
                onClick={handleCancel}
                className="flex-1 px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-surface rounded transition-colors"
              >
                Cancel
              </button>
            )}
            {(job.status === 'partial' || job.status === 'failed') && failedItems.length > 0 && (
              <button
                onClick={handleRetry}
                className="flex-1 px-3 py-1.5 text-xs font-medium bg-primary text-on-primary rounded hover:brightness-110 transition-all"
              >
                Retry {failedItems.length} Failed
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
