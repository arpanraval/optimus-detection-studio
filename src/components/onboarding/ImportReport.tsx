/**
 * ImportReport
 *
 * Post-import summary showing what was imported, updated, skipped.
 * Links to library for enrichment of low-quality rules.
 * Offers rollback option with honest verification.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ImportJobResult, PreCheckSummary } from '../../services/bulk-import/types';

interface ImportReportProps {
  result: ImportJobResult;
  preCheckSummary?: PreCheckSummary | null;
  jobId: string;
  onRollback: () => Promise<void>;
  onDone: () => void;
}

export function ImportReport({
  result,
  preCheckSummary,
  jobId,
  onRollback,
  onDone,
}: ImportReportProps): React.JSX.Element {
  const navigate = useNavigate();
  const [rolling, setRolling] = useState(false);
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);

  const shortJobId = jobId.slice(0, 8);

  const needsEnrichment = useMemo(() => {
    if (!preCheckSummary) return 0;
    return preCheckSummary.netNew.filter(r =>
      !r.incomingRule.mitreAttackIds?.length ||
      !r.incomingRule.description ||
      (r.incomingRule.description?.length || 0) < 20
    ).length;
  }, [preCheckSummary]);

  const updatedCount = (result as any).updatedCount ?? 0;
  const skippedUnchanged = (result as any).skippedUnchanged ?? 0;

  const handleRollback = async () => {
    setRolling(true);
    try {
      await onRollback();
    } finally {
      setRolling(false);
      setShowRollbackConfirm(false);
    }
  };

  return (
    <div className="max-w-md w-full p-6">
      <h3 className="font-brand text-[16px] font-medium text-on-surface mb-1">
        Import Complete
      </h3>

      {/* Stats */}
      <div className="mt-4 flex flex-col gap-2">
        {result.successCount > 0 && (
          <StatRow indicator={<GreenCheck />} label="New rules imported" value={result.successCount} />
        )}
        {updatedCount > 0 && (
          <StatRow indicator={<BlueArrow />} label="Existing rules updated" value={updatedCount} />
        )}
        {skippedUnchanged > 0 && (
          <StatRow indicator={<GraySkip />} label="Unchanged — skipped" value={skippedUnchanged} />
        )}
        {result.failureCount > 0 && (
          <StatRow indicator={<RedX />} label="Skipped (validation errors)" value={result.failureCount} />
        )}
      </div>

      {/* Enrichment nudge */}
      {needsEnrichment > 0 && (
        <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/15">
          <p className="text-[12px] text-on-surface mb-2">
            {needsEnrichment} rules need enrichment (missing MITRE, description, or references)
          </p>
          <button
            onClick={() => navigate(`/library?tags=needs-enrichment,import:${shortJobId}`)}
            className="text-[12px] px-3 py-1.5 rounded-lg cursor-pointer transition-colors bg-primary/10 text-on-primary-container hover:bg-primary/20"
          >
            Open in Studio
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex items-center gap-2">
        <button
          onClick={() => navigate('/library')}
          className="px-4 py-2 rounded-xl text-[13px] font-medium cursor-pointer transition-colors bg-primary/10 text-on-primary-container hover:bg-primary/20"
        >
          View Library
        </button>
        <button
          onClick={onDone}
          className="px-4 py-2 rounded-xl text-[13px] cursor-pointer transition-colors text-on-surface-variant hover:text-on-surface"
        >
          Done
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowRollbackConfirm(true)}
          className="text-[11px] px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-error hover:bg-error/5"
        >
          Rollback
        </button>
      </div>

      {/* Job ID */}
      <p className="mt-3 text-[10px] text-on-surface-variant">
        Job ID: {shortJobId} — Rollback available from Settings &rarr; Import History
      </p>

      {/* Rollback confirmation */}
      {showRollbackConfirm && (
        <div className="mt-3 p-3 rounded-xl bg-error/5 border border-error/20">
          <p className="text-[12px] text-on-surface mb-1">Rollback this import?</p>
          <p className="text-[11px] text-on-surface-variant mb-3">
            {result.successCount > 0 && `${result.successCount} new rules will be deleted. `}
            {updatedCount > 0 && `${updatedCount} updated rules will be reverted. `}
            This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowRollbackConfirm(false)}
              disabled={rolling}
              className="text-[11px] px-2 py-1 rounded cursor-pointer text-on-surface-variant"
            >
              Cancel
            </button>
            <button
              onClick={handleRollback}
              disabled={rolling}
              className="text-[11px] px-2 py-1 rounded cursor-pointer text-error hover:bg-error/10 disabled:opacity-50"
            >
              {rolling ? 'Rolling back...' : `Rollback ${result.successCount + updatedCount} rules`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG Indicator components (matching ImportPreCheck.tsx style)
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

function RedX() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
      <circle cx="7" cy="7" r="6" fill="rgba(239,68,68,0.15)" stroke="rgba(239,68,68,0.5)" strokeWidth="1" />
      <path d="M5 5l4 4M5 9l4-4" stroke="rgb(239,68,68)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function StatRow({
  indicator,
  label,
  value,
}: {
  indicator: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {indicator}
      <span className="text-[12px] text-on-surface-variant flex-1">{label}</span>
      <span className="text-[13px] font-medium text-on-surface tabular-nums">
        {value.toLocaleString()}
      </span>
    </div>
  );
}
