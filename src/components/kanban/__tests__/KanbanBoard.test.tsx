import React from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from '../KanbanBoard';
import type { Detection } from '@/types';

const libraryState = vi.hoisted(() => ({ productionLoading: false, productionLoaded: true, productionError: null as string | null }));

vi.mock('@/context/LibraryContext', () => ({
  useLibrary: () => ({
    ...libraryState,
    productionDetections: [
      { id: '1', name: 'Zulu', status: 'Draft', severity: 'Low', updatedDate: '2026-01-02', queries: [] },
      { id: '2', name: 'Alpha', status: 'Draft', severity: 'High', updatedDate: '2026-01-01', queries: [] },
    ],
    isLoading: false,
    userId: 'user',
    refreshAll: vi.fn(),
    bulkUpdateStatus: vi.fn(),
  }),
}));
vi.mock('@/context/RealtimeContext', () => ({ useRealtime: () => ({ subscribe: () => () => {} }) }));
vi.mock('@/context/PermissionsContext', () => ({
  usePermissions: () => ({ can: () => true, hasRoleOrHigher: () => true }),
}));
vi.mock('@/context/UserManagementContext', () => ({ useUserManagement: () => ({ allUsers: [] }) }));
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/hooks/useDetectionDecisions', () => ({ useDetectionDecisions: () => ({ createDecision: vi.fn() }) }));
vi.mock('../KanbanColumn', () => ({
  KanbanColumn: ({ status, detections }: { status: string; detections: Detection[] }) => (
    <div data-testid={`column-${status}`}>{detections.map((d) => d.name).join(', ')}</div>
  ),
}));
vi.mock('../KanbanCard', () => ({ KanbanCard: () => null }));
vi.mock('../BoardAnalytics', () => ({ BoardAnalytics: () => null }));
vi.mock('@/components/decisions/DecisionModal', () => ({ DecisionModal: () => null }));

describe('Detection Board selectors', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(libraryState, { productionLoading: false, productionLoaded: true, productionError: null });
  });

  it('uses board placeholders initially, then preserves cards and sorting controls during refresh', () => {
    Object.assign(libraryState, { productionLoading: true, productionLoaded: false });
    const view = render(<KanbanBoard />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading detections');
    expect(view.container.querySelector('[data-loading-layout="board"]')).not.toBeNull();
    Object.assign(libraryState, { productionLoading: false, productionLoaded: true });
    view.rerender(<KanbanBoard />);
    const column = screen.getByTestId('column-Draft');
    libraryState.productionLoading = true;
    view.rerender(<KanbanBoard />);
    expect(screen.getByTestId('column-Draft')).toBe(column);
    expect(screen.getByText('Updating…').closest('[role="status"]')).not.toBeNull();
    expect(screen.getByRole('combobox', { name: 'Sort detections' })).toBeEnabled();
  });

  it('shows recovery instead of an empty board when the first read fails', () => {
    Object.assign(libraryState, { productionLoaded: false, productionError: 'Couldn’t load detections.' });
    render(<KanbanBoard />);
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load detections.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(screen.queryByTestId('column-Draft')).not.toBeInTheDocument();
  });

  it('changes sorting and swimlanes through the shared controls and restores both preferences', () => {
    const { unmount } = render(<KanbanBoard />);
    expect(screen.getByTestId('column-Draft')).toHaveTextContent('Zulu, Alpha');
    fireEvent.click(screen.getByRole('combobox', { name: 'Sort detections' }));
    fireEvent.click(screen.getByRole('option', { name: 'Sort: Name' }));
    expect(screen.getByTestId('column-Draft')).toHaveTextContent('Alpha, Zulu');
    fireEvent.click(screen.getByRole('combobox', { name: 'Group swimlanes' }));
    fireEvent.click(screen.getByRole('option', { name: 'By Severity' }));
    expect(screen.getAllByTestId('column-Draft')).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem('detection-board-preferences')!)).toMatchObject({
      sortWithinColumn: 'name',
      swimlaneGroupBy: 'severity',
    });
    unmount();
    render(<KanbanBoard />);
    expect(screen.getByRole('combobox', { name: 'Sort detections' })).toHaveTextContent('Sort: Name');
    expect(screen.getByRole('combobox', { name: 'Group swimlanes' })).toHaveTextContent('By Severity');
  });

  it('does not fire board shortcuts while typing in a dropdown', () => {
    render(<KanbanBoard />);
    const group = screen.getByRole('combobox', { name: 'Group swimlanes' });
    fireEvent.keyDown(group, { key: 'a' });
    expect(screen.queryByTestId('column-Archived')).not.toBeInTheDocument();
    fireEvent.keyDown(group, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
