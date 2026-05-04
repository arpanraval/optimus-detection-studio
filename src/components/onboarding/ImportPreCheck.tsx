/**
 * ImportPreCheck
 *
 * Glass morphism confirmation dialog over the pipeline canvas.
 * Displays: net new, updated, unchanged, hard rejects.
 * User confirms what to import, then import begins.
 */

import { useState, useMemo, useEffect } from 'react';
import { Button } from '../ui/Button';
import type { PreCheckSummary } from '../../services/bulk-import/types';

interface ImportPreCheckProps {
  summary: PreCheckSummary;
  sourceName: string;
  onConfirm: (config: {
    importNetNew: boolean;
    updateExisting: boolean;
    forceUnchanged: boolean;
  }) => void;
  onCancel: () => void;
}

export function ImportPreCheck({
  summary,
  sourceName,
  onConfirm,
  onCancel,
}: ImportPreCheckProps): React.JSX.Element {
  const [forceAll, setForceAll] = useState(false);
  const [visible, setVisible] = useState(false);

  // Trigger slide-up on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // ESC dismisses the modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const actionCount = summary.netNew.length + summary.updatedUpstream.length;
  const unchangedCount = summary.unchanged.length;
  const rejectCount = summary.hardRejects.length;

  // Diff breakdown for updated rules
  const updateFieldCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of summary.updatedUpstream) {
      for (const d of r.diffs || []) {
        counts[d.field] = (counts[d.field] || 0) + 1;
      }
    }
    return counts;
  }, [summary.updatedUpstream]);

  const handleConfirm = () => {
    onConfirm({
      importNetNew: true,
      updateExisting: true,
      forceUnchanged: forceAll,
    });
  };

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-scrim/30"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 250ms ease-out',
      }}
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="max-w-md w-full mx-4 flex flex-col overflow-hidden bg-surface-container/80 backdrop-blur-xl rounded-xl border border-outline-variant/20 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.98)',
          transition: 'opacity 250ms ease-out, transform 250ms ease-out',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0">
          <h3 className="text-[13px] font-medium text-on-surface">
            Import Pre-Check
          </h3>
          <span className="text-[10px] text-on-surface-variant">
            {summary.totalScanned.toLocaleString()} scanned
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-3" style={{ maxHeight: '40vh' }}>
          {/* Two-column grid */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="p-2 rounded-lg bg-surface-container-high/50">
              <span className="text-[9px] tracking-[0.15em] uppercase text-on-surface-variant block mb-1">
                Duplicates
              </span>
              <div className="flex flex-col gap-0.5">
                <Row label="Net new" count={summary.netNew.length} indicator={<GreenCheck />} />
                <Row
                  label="Updated"
                  count={summary.updatedUpstream.length}
                  indicator={<BlueArrow />}
                  detail={Object.entries(updateFieldCounts)
                    .map(([f, c]) => `${f} (${c})`)
                    .join(', ') || 'Will update in-place'}
                />
                <Row label="Unchanged" count={unchangedCount} indicator={<GraySkip />} />
              </div>
            </div>

            <div className="p-2 rounded-lg bg-surface-container-high/50">
              <span className="text-[9px] tracking-[0.15em] uppercase text-on-surface-variant block mb-1">
                Validation
              </span>
              <div className="flex flex-col gap-0.5">
                <Row label="Ready" count={actionCount} indicator={<GreenCheck />} />
                {summary.netNew.length > 0 && (
                  <Row
                    label="Quality warnings"
                    count={summary.netNew.filter(r =>
                      !r.incomingRule.mitreAttackIds?.length ||
                      !r.incomingRule.description ||
                      (r.incomingRule.description?.length || 0) < 20
                    ).length}
                    indicator={<AmberWarning />}
                  />
                )}
                <Row label="Rejected" count={rejectCount} indicator={<RedX />} />
              </div>
            </div>
          </div>

          {/* Info messages */}
          {unchangedCount > 0 && actionCount > 0 && (
            <p className="text-[10px] text-on-surface-variant mb-1">
              {unchangedCount.toLocaleString()} identical skipped. {actionCount.toLocaleString()} need action.
            </p>
          )}
          {unchangedCount > 0 && actionCount === 0 && (
            <div className="mb-1 p-2 rounded-lg bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)]">
              <p className="text-[10px] text-on-surface">
                All {unchangedCount.toLocaleString()} rules already exist. Nothing new to import.
              </p>
            </div>
          )}
          {rejectCount > 0 && (
            <p className="text-[10px] text-on-surface-variant mb-1">
              {rejectCount} rejected (no detection query).
            </p>
          )}

          {/* Force import option */}
          {unchangedCount > 0 && (
            <div className="pt-1.5 border-t border-outline-variant/10">
              {!forceAll ? (
                <button
                  onClick={() => setForceAll(true)}
                  className="text-[10px] text-on-surface-variant hover:text-on-surface cursor-pointer transition-colors"
                >
                  Force import all {summary.totalScanned.toLocaleString()} including duplicates...
                </button>
              ) : (
                <div className="p-2 rounded-lg bg-error/5 border border-error/20">
                  <p className="text-[10px] text-error mb-1.5">
                    Creates {unchangedCount.toLocaleString()} duplicates. Rollback available.
                  </p>
                  <div className="flex gap-2">
                    <Button color="surface" variant="text" size="sm" onClick={() => setForceAll(false)}>
                      Cancel
                    </Button>
                    <Button color="error" variant="text" size="sm" onClick={handleConfirm}>
                      Import all {summary.totalScanned.toLocaleString()}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-outline-variant/10 shrink-0">
          <Button color="surface" variant="text" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          {actionCount > 0 && (
            <Button color="primary" variant="filled" size="sm" leadingIcon="download" onClick={handleConfirm}>
              Import {actionCount.toLocaleString()} rules
            </Button>
          )}
          {actionCount === 0 && unchangedCount > 0 && !forceAll && (
            <Button color="primary" variant="filled" size="sm" leadingIcon="check" onClick={onCancel}>
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG Indicator components
// ---------------------------------------------------------------------------

function GreenCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
      <circle cx="7" cy="7" r="6" fill="rgba(16,185,129,0.15)" stroke="rgba(16,185,129,0.5)" strokeWidth="1" />
      <path d="M4 7l2 2 4-4" stroke="rgb(16,185,129)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BlueArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
      <circle cx="7" cy="7" r="6" fill="rgba(59,130,246,0.15)" stroke="rgba(59,130,246,0.5)" strokeWidth="1" />
      <path d="M5 9V5h4M5 5l4 4" stroke="rgb(59,130,246)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GraySkip() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
      <circle cx="7" cy="7" r="6" fill="rgba(107,114,128,0.15)" stroke="rgba(107,114,128,0.5)" strokeWidth="1" />
      <path d="M5 5l4 4M5 9l4-4" stroke="rgb(107,114,128)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function AmberWarning() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
      <path d="M7 1.5L13 12H1L7 1.5z" fill="rgba(245,158,11,0.15)" stroke="rgba(245,158,11,0.5)" strokeWidth="1" strokeLinejoin="round" />
      <path d="M7 6v2.5" stroke="rgb(245,158,11)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="10.5" r="0.75" fill="rgb(245,158,11)" />
    </svg>
  );
}

function RedX() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
      <circle cx="7" cy="7" r="6" fill="rgba(239,68,68,0.15)" stroke="rgba(239,68,68,0.5)" strokeWidth="1" />
      <path d="M5 5l4 4M5 9l4-4" stroke="rgb(239,68,68)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Helper row component
function Row({
  label,
  count,
  indicator,
  detail,
}: {
  label: string;
  count: number;
  indicator: React.ReactNode;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {indicator}
      <span className="text-[11px] text-on-surface">{count.toLocaleString()}</span>
      <span className="text-[11px] text-on-surface-variant truncate">{label}</span>
      {detail && (
        <span className="text-[9px] text-on-surface-variant/70 truncate ml-auto hidden lg:block">
          {detail}
        </span>
      )}
    </div>
  );
}
