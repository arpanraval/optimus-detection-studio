import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BulkActionBar } from '../BulkActionBar';
import { LIBRARY_DEVELOPMENT, LIBRARY_PRODUCTION } from '../../../constants/library';
import type { DeletePreflight } from '../../../context/LibraryContext';

const SELECTED = ['rule-a', 'rule-b', 'rule-c'];

const preflightWith = (over: Partial<DeletePreflight>): DeletePreflight => ({
  requested: SELECTED.length,
  deletableIds: SELECTED,
  blocked: [],
  warnings: [],
  ...over,
});

function renderBar(opts: {
  preflight?: DeletePreflight;
  libraryType?: typeof LIBRARY_PRODUCTION | typeof LIBRARY_DEVELOPMENT;
} = {}) {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const onPreflightDelete = vi.fn().mockResolvedValue(opts.preflight ?? preflightWith({}));
  render(
    <BulkActionBar
      selectedCount={SELECTED.length}
      selectedIds={SELECTED}
      libraryType={opts.libraryType ?? LIBRARY_PRODUCTION}
      onClearSelection={vi.fn()}
      onSelectAll={vi.fn()}
      totalCount={SELECTED.length}
      onDelete={onDelete}
      onPreflightDelete={onPreflightDelete}
    />
  );
  return { onDelete, onPreflightDelete };
}

const openDeleteDialog = () => {
  fireEvent.click(screen.getByRole('button', { name: 'More bulk actions' }));
  fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
};

describe('BulkActionBar delete guardrails', () => {
  it('runs the preflight before showing the confirmation', async () => {
    const { onPreflightDelete } = renderBar();

    openDeleteDialog();

    await waitFor(() => expect(onPreflightDelete).toHaveBeenCalledWith(SELECTED));
  });

  it('deletes only the rows the preflight cleared', async () => {
    // siem_rule_bindings and siem_local_revisions are ON DELETE RESTRICT, so sending a protected
    // id would make Postgres reject the whole statement and take the other rows down with it.
    const { onDelete } = renderBar({
      preflight: preflightWith({
        deletableIds: ['rule-a'],
        blocked: [
          { id: 'rule-b', name: 'Bound rule', reason: 'Deployed to Splunk Prod' },
          { id: 'rule-c', name: 'Revised rule', reason: 'Has SIEM revision history' },
        ],
      }),
    });

    openDeleteDialog();
    await screen.findByText(/2 will be kept/);
    fireEvent.click(screen.getByRole('button', { name: /Delete 1/ }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(['rule-a']));
  });

  it('names each blocked rule and why it was kept', async () => {
    renderBar({
      preflight: preflightWith({
        deletableIds: ['rule-a'],
        blocked: [{ id: 'rule-b', name: 'Bound rule', reason: 'Deployed to Splunk Prod' }],
      }),
    });

    openDeleteDialog();

    expect(await screen.findByText('Bound rule')).toBeTruthy();
    expect(screen.getByText(/Deployed to Splunk Prod/)).toBeTruthy();
  });

  it('warns when deleting breaks a link without blocking it', async () => {
    const { onDelete } = renderBar({
      preflight: preflightWith({
        warnings: [{ id: 'rule-a', name: 'Promoted rule', reason: 'A linked rule will lose its link' }],
      }),
    });

    openDeleteDialog();
    expect(await screen.findByText(/1 linked to other rules/)).toBeTruthy();

    // A warning informs, it does not block. (Two buttons read "Delete" once the dialog is
    // open — the bar's trigger and the dialog's confirm; take the confirm.)
    const confirm = screen.getAllByRole('button', { name: /^Delete$/ }).at(-1)!;
    fireEvent.click(confirm);
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(SELECTED));
  });

  it('refuses to delete when every selected rule is protected', async () => {
    const { onDelete } = renderBar({
      preflight: preflightWith({
        deletableIds: [],
        blocked: SELECTED.map(id => ({ id, name: id, reason: 'Deployed to Splunk Prod' })),
      }),
    });

    openDeleteDialog();

    expect(await screen.findByText('Nothing can be deleted')).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('does not delete when the preflight itself failed', async () => {
    const { onDelete } = renderBar({
      preflight: preflightWith({ deletableIds: [], error: 'network down' }),
    });

    openDeleteDialog();

    expect(await screen.findByText(/Could not check these detections/)).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('offers status, severity and delete in the Development library too', () => {
    const onDelete = vi.fn();
    render(
      <BulkActionBar
        selectedCount={1}
        selectedIds={['rule-a']}
        libraryType={LIBRARY_DEVELOPMENT}
        onClearSelection={vi.fn()}
        onSelectAll={vi.fn()}
        totalCount={1}
        onDelete={onDelete}
        onChangeStatus={vi.fn()}
        onChangeSeverity={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'More bulk actions' }));
    expect(screen.getByRole('button', { name: /^Delete$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Status/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Severity/ })).toBeTruthy();
  });
});
