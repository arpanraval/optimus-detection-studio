import React from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PackActionsMenu } from '../PackActionsMenu';
import type { DetectionPack } from '../../../types';
vi.mock('../../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
const pack = { name: 'Demo pack' } as DetectionPack;

it('shows a single header action and opens the existing workflow only when chosen', () => {
  const deploy = vi.fn();
  render(
    <PackActionsMenu
      pack={pack}
      actions={[
        { label: 'Deploy pack', icon: 'upload', onClick: deploy },
        { label: 'Delete pack', icon: 'trash', destructive: true, onClick: vi.fn() },
      ]}
    />,
  );
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
  const menu = screen.getByRole('menu', { name: 'Pack actions' });
  expect(within(menu).getByRole('menuitem', { name: 'Export' })).toBeInTheDocument();
  expect(within(menu).getAllByRole('menuitem').at(-1)).toHaveTextContent('Delete pack');
  expect(deploy).not.toHaveBeenCalled();
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Deploy pack' }));
  expect(deploy).toHaveBeenCalledOnce();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
it('keeps export formats inside Actions and supports Escape and keyboard navigation', () => {
  render(<PackActionsMenu pack={pack} actions={[]} />);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Actions' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Export' }));
  expect(screen.getByRole('menu', { name: 'Export formats' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Sentinel ARM' })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'End' });
  expect(screen.getByRole('menuitem', { name: 'Sentinel ARM' })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Actions' })).toHaveFocus();
});
