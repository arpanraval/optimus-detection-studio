import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SourceDetail } from '../SourceOverlay';
import type { SourceState } from '../types';

function makeSource(): SourceState {
  return {
    source: {
      id: 'test-source',
      name: 'Test Detection Source',
      shortName: 'Test',
      description: 'Progress fixture',
      repoOwner: 'test',
      repoName: 'rules',
      basePath: 'rules',
      vendor: 'sigma',
      format: 'sigma',
      estimatedRules: 100,
      color: '#123456',
    },
    selected: true,
    status: 'fetching',
    folders: [],
    progress: {
      phase: 'fetching',
      totalFiles: 100,
      processedFiles: 25,
      totalRules: 0,
      validRules: 0,
      warningRules: 0,
      errorRules: 0,
      duplicateRules: 0,
      insertedRules: 0,
      failedInserts: 0,
      skippedRules: 0,
      currentFile: 'rules/windows/file-25.yml',
    },
    errors: [],
    importedCount: 0,
    duplicateCount: 0,
  };
}

describe('the rendered source detail', () => {
  it('shows phase, exact counts, and the current file', () => {
    render(
      <SourceDetail
        state={makeSource()}
        expanded
        controlsLocked
        activePhase="processing"
        onToggleExpand={vi.fn()}
        onToggleFolder={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('fetching')).toBeTruthy();
    expect(screen.getByText('25/100')).toBeTruthy();
    expect(screen.getByText('rules/windows/file-25.yml')).toBeTruthy();
  });

  it('keeps expand and collapse available while an import is locked', () => {
    const onToggleExpand = vi.fn();
    render(
      <SourceDetail
        state={makeSource()}
        expanded
        controlsLocked
        activePhase="processing"
        onToggleExpand={onToggleExpand}
        onToggleFolder={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /test/i }));
    expect(onToggleExpand).toHaveBeenCalledOnce();
  });
});
