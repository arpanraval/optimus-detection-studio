import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BulkActionBar } from '../BulkActionBar';
import { LIBRARY_DEVELOPMENT } from '../../../constants/library';

afterEach(cleanup);
it.each([false, true])('passes the exact selection and all-matching mode (%s) to AI mapping', (allMatching) => {
  const resolve = vi.fn();
  render(
    <BulkActionBar
      selectedCount={2}
      selectedIds={['a', 'b']}
      totalCount={2}
      libraryType={LIBRARY_DEVELOPMENT}
      totalFilteredCount={240}
      externalSelectAllMatching={allMatching}
      onClearSelection={vi.fn()}
      onSelectAll={vi.fn()}
      onResolveMitre={resolve}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Resolve MITRE with AI' }));
  expect(resolve).toHaveBeenCalledWith(['a', 'b'], allMatching);
});
