import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { AutoDigestSettingsPage } from '../AutoDigestSettingsPage';

const mocks = vi.hoisted(() => ({
  canManage: false, error: null as string | null, activity: vi.fn(),
  settings: { is_enabled: true, schedule_hour_utc: 6, max_articles_per_day: 3, prompt_templates: {} },
}));
vi.mock('../../../router/AppDataContext', () => ({ useAppData: () => ({ user: { id: 'reader' } }) }));
vi.mock('../../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../hooks/useInitialLoading', () => ({ useInitialLoading: () => false }));
vi.mock('../../ModelSelector', () => ({ ModelSelector: () => null }));
vi.mock('../../../hooks/useAutoDigestSettings', () => ({
  useAutoDigestSettings: () => ({
    teamUserId: 'pipeline-owner', canManage: mocks.canManage, error: mocks.error,
    settings: mocks.settings,
    curatedSources: [], enabledSourceIds: new Set(), feedHealth: new Map(), customFeeds: [],
    recentJobs: [], isLoading: false,
  }),
}));
vi.mock('../../threatintel/FeedActivityLog', () => ({
  FeedActivityLog: (props: unknown) => { mocks.activity(props); return <div>Shared activity</div>; },
  countSystemErrors: () => 0, countFeedErrors: () => 0,
}));

beforeEach(() => { mocks.canManage = false; mocks.error = null; mocks.activity.mockClear(); });

it('shows members shared activity without Run Now', () => {
  render(<MemoryRouter><AutoDigestSettingsPage /></MemoryRouter>);
  expect(screen.getByText('Shared activity')).toBeInTheDocument();
  expect(mocks.activity).toHaveBeenCalledWith(expect.objectContaining({ userId: 'pipeline-owner', canManage: false }));
  expect(screen.queryByRole('button', { name: 'Run Now' })).not.toBeInTheDocument();
  expect(screen.getByText(/Admins manage sources/)).toBeInTheDocument();
});

it.each([false, true])('allows source edits only when canManage=%s', (canManage) => {
  mocks.canManage = canManage;
  render(<MemoryRouter initialEntries={['/?tab=sources']}><AutoDigestSettingsPage /></MemoryRouter>);
  const button = screen.getByRole('button', { name: 'Add Custom Source' });
  if (canManage) expect(button).toBeEnabled();
  else expect(button).toBeDisabled();
});

it('shows read failures as errors instead of onboarding', () => {
  mocks.error = 'Unable to load the team pipeline';
  render(<MemoryRouter><AutoDigestSettingsPage /></MemoryRouter>);
  expect(screen.getByRole('alert')).toHaveTextContent(mocks.error);
  expect(screen.queryByText(/select sources to get started/)).not.toBeInTheDocument();
});
