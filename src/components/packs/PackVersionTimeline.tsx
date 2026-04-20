/**
 * PackVersionTimeline — chronological list of pack versions with rollback action.
 */

import React, { useState } from 'react';
import { Icon } from '../Icon';
import { usePackVersions } from '../../hooks/usePackVersions';
import { rollbackToVersion } from '../../hooks/useDetectionPacks';
import { useToast } from '../../hooks/useToast';
import { hasActiveDeployments } from '../../hooks/usePackDeploymentStatus';

interface Props {
  packId: string;
  onRestored: () => void;
}

interface VersionSnapshot {
  detections?: Array<{ id: string; name?: string }>;
  pack?: { name?: string };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const PackVersionTimeline: React.FC<Props> = ({ packId, onRestored }) => {
  const { versions, loading, refresh } = usePackVersions(packId);
  const [rollbackingId, setRollbackingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmHasDeploys, setConfirmHasDeploys] = useState<boolean>(false);
  const { showToast } = useToast();

  const handleRequestRollback = async (versionId: string) => {
    setConfirmId(versionId);
    try {
      const hasDeploys = await hasActiveDeployments(packId);
      setConfirmHasDeploys(hasDeploys);
    } catch {
      // If the status check fails, default to false — user still sees the
      // standard confirmation. Better to let them through than to block on
      // a transient check failure.
      setConfirmHasDeploys(false);
    }
  };

  const handleRollback = async (versionId: string, versionNumber: number) => {
    setRollbackingId(versionId);
    setConfirmId(null);
    setConfirmHasDeploys(false);
    try {
      await rollbackToVersion(packId, versionId);
      showToast('success', 'Rolled Back', `Pack restored to v${versionNumber}`);
      onRestored();
      refresh();
    } catch (err) {
      showToast('error', 'Rollback Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRollbackingId(null);
    }
  };

  if (loading) {
    return <div className="text-sm text-on-surface-variant py-4">Loading version history...</div>;
  }

  if (versions.length === 0) {
    return (
      <div className="text-center py-12">
        <Icon name="tag" className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
        <p className="text-on-surface-variant font-medium">No versions published yet</p>
        <p className="text-xs text-on-surface-variant/60 mt-1">
          Click "Publish" to create the first immutable snapshot
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {versions.map((v, idx) => {
        const snapshot = v.snapshot as VersionSnapshot;
        const detectionCount = snapshot.detections?.length || 0;
        const isLatest = idx === 0;
        const isRollingBack = rollbackingId === v.id;
        const showConfirm = confirmId === v.id;

        return (
          <div key={v.id} className="relative pl-10 pb-6 last:pb-0">
            {/* Timeline line */}
            {idx < versions.length - 1 && (
              <div className="absolute left-[15px] top-6 bottom-0 w-px bg-outline-variant/20" />
            )}

            {/* Dot */}
            <div
              className={`absolute left-2 top-2 w-4 h-4 rounded-full border-2 ${
                isLatest
                  ? 'bg-primary border-primary'
                  : 'bg-surface border-outline-variant'
              }`}
            />

            {/* Content card */}
            <div className="bg-surface-container rounded-lg p-4 border border-outline-variant/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-on-surface truncate">
                    {v.label || `v${v.version_number}`}
                  </span>
                  {isLatest && (
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded uppercase tracking-wider flex-shrink-0">
                      Latest
                    </span>
                  )}
                </div>
                <span className="text-xs text-on-surface-variant flex-shrink-0 ml-2">
                  {formatDate(v.created_at)}
                </span>
              </div>

              <div className="text-xs text-on-surface-variant mb-2 flex items-center gap-1">
                <Icon name="file-text" className="w-3 h-3" />
                {detectionCount} detection{detectionCount !== 1 ? 's' : ''} snapshotted
              </div>

              {v.notes && (
                <p className="text-sm text-on-surface/80 whitespace-pre-wrap mb-3">
                  {v.notes}
                </p>
              )}

              {!isLatest && (
                <div className="flex items-center gap-2">
                  {showConfirm ? (
                    <div className="flex flex-col gap-2 w-full">
                      {confirmHasDeploys && (
                        <div role="alert" className="flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                          <Icon name="alert-triangle" className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                          <div className="text-xs text-amber-200">
                            <div className="font-semibold mb-0.5">This pack has active SIEM deployments</div>
                            <div>
                              Rollback only changes the pack's local detection list. Rules already deployed to SIEMs
                              will stay active until you deploy the pack again.
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRollback(v.id, v.version_number)}
                          disabled={isRollingBack}
                          className="text-xs font-semibold px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30 transition-colors"
                        >
                          {isRollingBack ? 'Rolling back...' : 'Confirm rollback'}
                        </button>
                        <button
                          onClick={() => { setConfirmId(null); setConfirmHasDeploys(false); }}
                          disabled={isRollingBack}
                          className="text-xs text-on-surface-variant hover:text-on-surface"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleRequestRollback(v.id)}
                      className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                    >
                      <Icon name="undo" className="w-3 h-3" />
                      Rollback to v{v.version_number}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
