import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportReport } from '../ImportReport';
import type { ImportJobResult, ImportProgress } from '../../../services/bulk-import/types';

const result: ImportJobResult = {
  success: true,
  totalProcessed: 19,
  successCount: 19,
  failureCount: 0,
  skipCount: 0,
  warningCount: 0,
  importedDetectionIds: [],
  failedRules: [],
  skippedRules: [],
  duration: 1000,
  mitreCoverageAdded: 0,
};

const baseProgress: ImportProgress = {
  phase: 'completed',
  totalFiles: 19,
  processedFiles: 19,
  totalRules: 19,
  validRules: 19,
  warningRules: 0,
  errorRules: 0,
  duplicateRules: 0,
  insertedRules: 19,
  failedInserts: 0,
  skippedRules: 0,
};

const selection = { netNewImported: 19, forcedDuplicates: 0, unchangedSkipped: 0, changedUpstreamSkipped: 0 };

function renderReport(props: Partial<React.ComponentProps<typeof ImportReport>>) {
  const onDone = vi.fn();
  render(
    <ImportReport
      result={result}
      progress={baseProgress}
      selection={selection}
      destinationLabel="Development Library"
      jobId="abcdef12-0000"
      onRollback={vi.fn()}
      onDone={onDone}
      {...props}
    />,
  );
  return { onDone };
}

describe('ImportReport embedding outcome', () => {
  it('tells the user a batch job was queued and links to Data Sync', () => {
    const { onDone } = renderReport({
      embeddingStrategy: 'batch',
      progress: { ...baseProgress, embeddingBatchJobId: 'job-1', embeddingTotal: 19, embeddingGenerated: 0 },
    });

    expect(screen.getByText(/batch embedding job queued/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /data sync/i }));
    expect(onDone).toHaveBeenCalledWith('/settings/data-sync');
  });

  it('surfaces the server refusal when the batch job could not be submitted', () => {
    renderReport({
      embeddingStrategy: 'batch',
      embeddingNotice: 'Batch embedding submission failed: A batch job is already active. Use Data Sync page to create embeddings.',
    });

    expect(screen.getByText(/already active/i)).toBeTruthy();
    expect(screen.queryByText(/batch embedding job queued/i)).toBeNull();
  });

  it('says embeddings were skipped when the user chose skip', () => {
    renderReport({ embeddingStrategy: 'skip' });
    expect(screen.getByText(/embeddings skipped/i)).toBeTruthy();
  });
});
