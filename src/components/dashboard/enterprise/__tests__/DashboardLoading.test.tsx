import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardGrid from '../DashboardGrid';

const data = vi.hoisted(() => ({ isLoading: true, detections: [], loadError: null as string | null }));
vi.mock('@/router/AppDataContext', () => ({ useAppData: () => data }));
vi.mock('../DashboardContext', () => ({
  useDashboard: () => ({ state: { isLoading: false }, dispatch: vi.fn(), activeDashboard: { widgets: [], layouts: {} } }),
}));
vi.mock('../WidgetChrome', () => ({ default: () => null }));
vi.mock('react-grid-layout/legacy', () => ({ Responsive: () => null, WidthProvider: (component: unknown) => component }));

beforeEach(() => Object.assign(data, { isLoading: true, loadError: null }));
describe('dashboard initial loading', () => {
  it('waits for data before showing an empty dashboard', () => {
    const view = render(<DashboardGrid onNavigate={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('This dashboard is empty')).not.toBeInTheDocument();
    data.isLoading = false;
    view.rerender(<DashboardGrid onNavigate={vi.fn()} />);
    expect(screen.getByText('This dashboard is empty')).toBeInTheDocument();
  });

  it('shows recovery instead of an empty dashboard after a failed read', () => {
    Object.assign(data, { isLoading: false, loadError: 'Could not load dashboard data.' });
    render(<DashboardGrid onNavigate={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load dashboard data.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('This dashboard is empty')).not.toBeInTheDocument();
  });
});
