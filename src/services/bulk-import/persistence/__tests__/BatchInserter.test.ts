import { describe, expect, it } from 'vitest';
import { BatchInserter } from '../BatchInserter';

describe('BatchInserter cancellation', () => {
  it('stops before the next batch without reporting unprocessed rows as processed', async () => {
    const inserter = new BatchInserter();
    const result = await inserter.insertAll([{ name: 'Never inserted' }], {
      shouldAbort: () => true,
      batchDelay: 0,
    });

    expect(result.cancelled).toBe(true);
    expect(result.success).toBe(false);
    expect(result.totalProcessed).toBe(0);
    expect(result.successCount).toBe(0);
    expect(result.importedDetectionIds).toEqual([]);
  });
});
