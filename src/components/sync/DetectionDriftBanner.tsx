import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { Button } from '../ui';
import { ConfirmDialog } from '../ui';
import { DriftBadge } from './DriftBadge';
import { ROUTES } from '../../router/routes';
import { useDetectionDrift } from '../../hooks/useDetectionDrift';
import { useToast } from '../../hooks/useToast';
import { useAppData } from '../../router/AppDataContext';
import { revertLastSync } from '../../services/drift/driftMutations';

interface DetectionDriftBannerProps {
  detectionId: string;
  className?: string;
}

/**
 * Shown on the detection detail page when the detection was imported from a
 * GitHub source: surfaces an available upstream update, or a "synced from
 * upstream" note with a one-step Revert.
 */
export const DetectionDriftBanner: React.FC<DetectionDriftBannerProps> = ({ detectionId, className = '' }) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { profile } = useAppData();
  const { drift, canRevert, lastSyncedAt, refresh } = useDetectionDrift(detectionId);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!drift) return null;
  const actionable = drift.drift_state === 'upstream_changed' || drift.drift_state === 'conflict' || drift.drift_state === 'upstream_removed';
  const synced = drift.resolution === 'accepted' || (!!lastSyncedAt && canRevert);
  if (!actionable && !synced) return null;

  const goReview = () => navigate(`${ROUTES.DATA_SYNC}#vendor-drift`);

  const doRevert = async () => {
    if (!profile?.id) { showToast('error', 'Not signed in'); return; }
    setBusy(true);
    try {
      await revertLastSync(detectionId, { actorId: profile.id });
      showToast('success', 'Reverted the last upstream sync', 'The detection was restored to its pre-sync state.');
      refresh();
    } catch (e) {
      showToast('error', 'Revert failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirmRevert(false);
    }
  };

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 text-[13px] ${actionable ? 'border-[#0284C7]/30 bg-[#0284C7]/8' : 'border-outline-variant/30 bg-surface-container/40'} ${className}`}>
      <Icon name={actionable ? 'arrow-down' : 'check-circle'} className={`w-4 h-4 shrink-0 ${actionable ? 'text-[#0284C7]' : 'text-[#4D7C6F]'}`} />
      <div className="min-w-0 flex-1">
        {actionable ? (
          <>
            <span className="text-on-surface">
              {drift.drift_state === 'upstream_removed'
                ? 'This rule no longer exists in its upstream source.'
                : drift.drift_state === 'conflict'
                  ? 'An upstream update is available — but you edited this rule locally, so review carefully.'
                  : 'An upstream update is available for this imported rule.'}
            </span>
            <DriftBadge state={drift.drift_state} size="xs" className="ml-2 align-middle" />
          </>
        ) : (
          <span className="text-on-surface-variant">
            Synced from upstream{lastSyncedAt ? ` on ${new Date(lastSyncedAt).toLocaleDateString()}` : ''}.
          </span>
        )}
      </div>
      {actionable && <Button color="secondary" size="sm" leadingIcon="external-link" onClick={goReview}>Review on Data Sync</Button>}
      {synced && canRevert && <Button color="secondary" size="sm" leadingIcon="rotate-ccw" disabled={busy} onClick={() => setConfirmRevert(true)}>Revert last sync</Button>}

      {confirmRevert && (
        <ConfirmDialog
          isOpen
          variant="warning"
          title="Revert the last upstream sync?"
          message="This restores the detection's content (query, description, severity, MITRE, tags) to what it was just before the last 'Accept upstream'. Local-only fields aren't affected."
          confirmLabel="Revert"
          cancelLabel="Cancel"
          onConfirm={doRevert}
          onClose={() => setConfirmRevert(false)}
        />
      )}
    </div>
  );
};
