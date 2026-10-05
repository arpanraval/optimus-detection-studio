import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportPreCheck } from '../ImportPreCheck';
import type { PreCheckSummary } from '../../../services/bulk-import/types';

const incomingRule = {
  externalId: 'rule-1',
  title: 'Rule one',
  description: 'A sufficiently detailed detection rule description',
  query: 'process where true',
  mitreAttackIds: ['T1059'],
};

describe('ImportPreCheck', () => {
  it('imports only net-new rules and treats upstream changes as review items', () => {
    const onConfirm = vi.fn();
    const summary = {
      netNew: [{ externalId: 'new-1', category: 'net_new', incomingRule }],
      updatedUpstream: [{ externalId: 'changed-1', category: 'updated_upstream', incomingRule }],
      unchanged: [],
      hardRejects: [],
      totalScanned: 2,
    } as unknown as PreCheckSummary;

    render(
      <ImportPreCheck
        summary={summary}
        sourceName="Detection Sources"
        destinationLabel="Development Library"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Changed upstream')).toBeTruthy();
    expect(screen.getByText(/will be skipped/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 rules' }));
    expect(onConfirm).toHaveBeenCalledWith({
      importNetNew: true,
      updateExisting: false,
      forceUnchanged: false,
      embeddingStrategy: 'realtime',
    });
  });

  it('passes the chosen embedding strategy so batch imports finish without waiting on embeddings', () => {
    const onConfirm = vi.fn();
    const summary = {
      netNew: [{ externalId: 'new-1', category: 'net_new', incomingRule }],
      updatedUpstream: [],
      unchanged: [],
      hardRejects: [],
      totalScanned: 1,
    } as unknown as PreCheckSummary;

    render(
      <ImportPreCheck
        summary={summary}
        sourceName="Detection Sources"
        destinationLabel="Development Library"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /batch/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 rules' }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ embeddingStrategy: 'batch' }));
  });
});
