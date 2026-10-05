import { useMemo, useState } from 'react';
import type { EmbeddingStrategy, ImportJobResult, ImportProgress, PreCheckSummary } from '../../services/bulk-import/types';
import { ROUTES } from '../../router/routes';

export interface ImportSelectionSummary {
  netNewImported: number;
  forcedDuplicates: number;
  unchangedSkipped: number;
  changedUpstreamSkipped: number;
}

interface ImportReportProps {
  result: ImportJobResult;
  progress?: ImportProgress | null;
  preCheckSummary?: PreCheckSummary | null;
  selection: ImportSelectionSummary;
  destinationLabel: string;
  jobId: string;
  /** Strategy the user picked on the pre-check; drives the embedding outcome notice. */
  embeddingStrategy?: EmbeddingStrategy;
  /** Recoverable embedding-phase message from the job (e.g. batch submit refused). */
  embeddingNotice?: string;
  onRollback: () => Promise<void>;
  onDone: (destination?: string) => void;
}

export function ImportReport({
  result,
  progress,
  preCheckSummary,
  selection,
  destinationLabel,
  jobId,
  embeddingStrategy = 'realtime',
  embeddingNotice,
  onRollback,
  onDone,
}: ImportReportProps): React.JSX.Element {
  const [rolling, setRolling] = useState(false);
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const shortJobId = jobId.slice(0, 8);
  const embeddingErrors = progress?.embeddingErrors ?? 0;

  const needsEnrichment = useMemo(() => {
    if (!preCheckSummary) return 0;
    return preCheckSummary.netNew.filter(
      (rule) =>
        !rule.incomingRule.mitreAttackIds?.length ||
        !rule.incomingRule.description ||
        (rule.incomingRule.description?.length || 0) < 20,
    ).length;
  }, [preCheckSummary]);

  async function handleRollback(): Promise<void> {
    setRolling(true);
    setRollbackError(null);
    try {
      await onRollback();
      setShowRollbackConfirm(false);
    } catch (error) {
      setRollbackError(error instanceof Error ? error.message : 'Rollback failed');
    } finally {
      setRolling(false);
    }
  }

  const hasIssues = result.failureCount > 0 || embeddingErrors > 0;

  const batchQueued = embeddingStrategy === 'batch' && Boolean(progress?.embeddingBatchJobId);
  const embeddingOutcome: { text: string; tone: 'info' | 'warn' } | null =
    embeddingStrategy === 'batch'
      ? batchQueued
        ? {
            text: `Batch embedding job queued (${(progress?.embeddingTotal ?? 0).toLocaleString()} items). Search embeddings appear when it finishes, typically within minutes to hours.`,
            tone: 'info',
          }
        : {
            text: embeddingNotice ?? 'Batch embedding job was not submitted. Generate embeddings from Data Sync.',
            tone: 'warn',
          }
      : embeddingStrategy === 'skip'
        ? { text: 'Embeddings skipped. Generate them later from Data Sync.', tone: 'info' }
        : null;

  return (
    <div className="max-w-md w-full p-6" role="status" aria-live="polite">
      <h3 className="font-brand text-[16px] font-medium text-on-surface mb-1">
        {hasIssues ? 'Import completed with issues' : 'Import complete'}
      </h3>

      <div className="mt-4 flex flex-col gap-2">
        <StatRow label={`Rules stored in ${destinationLabel}`} value={result.successCount} tone="success" />
        <StatRow label="Net-new rules selected" value={selection.netNewImported} />
        <StatRow label="Unchanged duplicates selected" value={selection.forcedDuplicates} />
        <StatRow label="Unchanged rules skipped" value={selection.unchangedSkipped} />
        <StatRow label="Changed upstream, skipped for review" value={selection.changedUpstreamSkipped} />
        <StatRow label="Insertion failures" value={result.failureCount} tone="error" />
        {progress?.embeddingGenerated !== undefined && (
          <StatRow label="Search embeddings generated" value={progress.embeddingGenerated} tone="success" />
        )}
        <StatRow label="Embedding failures" value={embeddingErrors} tone="error" />
      </div>

      {embeddingOutcome && (
        <div
          className={
            embeddingOutcome.tone === 'warn'
              ? 'mt-4 p-3 rounded-xl bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.25)]'
              : 'mt-4 p-3 rounded-xl bg-tertiary-container/15 border border-tertiary/20'
          }
        >
          <p className="text-[12px] text-on-surface mb-2">{embeddingOutcome.text}</p>
          <button
            type="button"
            onClick={() => onDone(ROUTES.DATA_SYNC)}
            className="text-[12px] px-3 py-1.5 rounded-lg cursor-pointer bg-primary/10 text-on-primary-container hover:bg-primary/20"
          >
            {batchQueued ? 'Track on Data Sync' : 'Open Data Sync'}
          </button>
        </div>
      )}

      {needsEnrichment > 0 && (
        <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/15">
          <p className="text-[12px] text-on-surface mb-2">
            {needsEnrichment} imported rules may need MITRE or description enrichment.
          </p>
          <button
            type="button"
            onClick={() => onDone(`/library?tags=needs-enrichment,import:${shortJobId}`)}
            className="text-[12px] px-3 py-1.5 rounded-lg cursor-pointer bg-primary/10 text-on-primary-container hover:bg-primary/20"
          >
            Open in Studio
          </button>
        </div>
      )}

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onDone('/library')}
          className="px-4 py-2 rounded-xl text-[13px] font-medium bg-primary/10 text-on-primary-container hover:bg-primary/20"
        >
          View {destinationLabel}
        </button>
        <button
          type="button"
          onClick={() => onDone()}
          className="px-4 py-2 rounded-xl text-[13px] text-on-surface-variant"
        >
          Done
        </button>
        <div className="flex-1" />
        {result.successCount > 0 && (
          <button
            type="button"
            onClick={() => setShowRollbackConfirm(true)}
            className="text-[11px] px-3 py-1.5 rounded-lg text-error hover:bg-error/5"
          >
            Rollback
          </button>
        )}
      </div>

      <p className="mt-3 text-[10px] text-on-surface-variant">
        Job ID: {shortJobId} — rollback removes only rows created by this job.
      </p>

      {showRollbackConfirm && (
        <div className="mt-3 p-3 rounded-xl bg-error/5 border border-error/20" role="alert">
          <p className="text-[12px] text-on-surface mb-1">Rollback this import?</p>
          <p className="text-[11px] text-on-surface-variant mb-3">
            Up to {result.successCount.toLocaleString()} detections created by this job will be deleted. This cannot be
            undone.
          </p>
          {rollbackError && <p className="text-[11px] text-error mb-2">{rollbackError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowRollbackConfirm(false)}
              disabled={rolling}
              className="text-[11px] px-2 py-1 text-on-surface-variant"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRollback}
              disabled={rolling}
              className="text-[11px] px-2 py-1 text-error hover:bg-error/10 disabled:opacity-50"
            >
              {rolling ? 'Rolling back...' : `Rollback ${result.successCount.toLocaleString()} rules`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'error';
}): React.JSX.Element | null {
  if (value <= 0) return null;
  const marker = tone === 'success' ? '✓' : tone === 'error' ? '!' : '—';
  const color = tone === 'success' ? 'text-emerald-500' : tone === 'error' ? 'text-error' : 'text-on-surface-variant';
  return (
    <div className="flex items-center gap-2">
      <span className={color} aria-hidden="true">
        {marker}
      </span>
      <span className="text-[12px] text-on-surface-variant flex-1">{label}</span>
      <span className="text-[13px] font-medium text-on-surface tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}
