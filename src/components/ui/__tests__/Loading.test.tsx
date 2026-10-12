import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PagePending } from '../PagePending';
import { LoadingStatus } from '../LoadingStatus';
import { Button } from '../Button';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { getLoadingLayout, loadingLayouts } from '@/router/loadingLayouts';

afterEach(() => vi.useRealTimers());

describe('shared loading behavior', () => {
  it('announces the wait once, without exposing decorative placeholders', () => {
    render(<PagePending layout="board" label="Loading detections…" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading detections…');
    expect(status.closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Page content' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('0 detections')).not.toBeInTheDocument();
  });

  it('explains a slow request and cleans up its timer on unmount', () => {
    vi.useFakeTimers();
    const view = render(<LoadingStatus label="Updating…" />);
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.getByRole('status')).toHaveTextContent('Taking longer than usual');
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never returns to initial placeholders on a mounted resource refresh', () => {
    const hook = renderHook(({ loading }) => useInitialLoading(loading), { initialProps: { loading: true } });
    expect(hook.result.current).toBe(true);
    hook.rerender({ loading: false });
    expect(hook.result.current).toBe(false);
    hook.rerender({ loading: true });
    expect(hook.result.current).toBe(false);
  });

  it('blocks duplicate button submissions while preserving its accessible label', () => {
    const click = vi.fn();
    render(
      <Button loading onClick={click}>
        Save detection
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save detection' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(click).not.toHaveBeenCalled();
  });

  it('covers the audited route patterns without confusing new/edit/detail layouts', () => {
    expect(loadingLayouts).toHaveLength(59);
    expect(getLoadingLayout('/library/board')).toBe('board');
    expect(getLoadingLayout('/library/detections/new')).toBe('form');
    expect(getLoadingLayout('/library/detections/example/edit')).toBe('form');
    expect(getLoadingLayout('/library/detections/example')).toBe('detail');
    expect(getLoadingLayout('/dashboard/enterprise/example')).toBe('dashboard');
  });
});
