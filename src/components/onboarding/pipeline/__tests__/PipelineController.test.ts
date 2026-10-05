import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PipelineController } from '../PipelineController';
import type { PipelineStage } from '../../types';

function status(controller: PipelineController, stage: PipelineStage): string {
  return controller.getState().stages.find((s) => s.stage === stage)!.status;
}

function counter(controller: PipelineController, stage: PipelineStage): number {
  return controller.getState().stages.find((s) => s.stage === stage)!.counter;
}

describe('PipelineController pacing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a stage active for the minimum dwell before completing it', () => {
    const controller = new PipelineController(() => {}, { minStageDwellMs: 700 });
    controller.onSourceFetchStart('a', '#000');
    controller.onSourceFetchComplete('a');
    controller.onParseStart();

    expect(status(controller, 'fetch')).toBe('active');
    expect(status(controller, 'parse')).toBe('idle');

    vi.advanceTimersByTime(699);
    expect(status(controller, 'fetch')).toBe('active');

    vi.advanceTimersByTime(1);
    expect(status(controller, 'fetch')).toBe('complete');
    expect(status(controller, 'parse')).toBe('active');
  });

  it('adds no delay when the stage already ran longer than the dwell', () => {
    const controller = new PipelineController(() => {}, { minStageDwellMs: 700 });
    controller.onSourceFetchStart('a', '#000');
    vi.advanceTimersByTime(1000);
    controller.onSourceFetchComplete('a');

    expect(status(controller, 'fetch')).toBe('complete');
  });

  it('applies later events in order once a held step releases', () => {
    const controller = new PipelineController(() => {}, { minStageDwellMs: 700 });
    controller.onSourceFetchStart('a', '#000');
    controller.onSourceFetchComplete('a');
    controller.onParseStart();
    controller.onParseProgress(19, 0);

    expect(counter(controller, 'parse')).toBe(0);
    vi.advanceTimersByTime(700);
    expect(counter(controller, 'parse')).toBe(19);
  });

  it('chains the dwell across consecutive instant stages', () => {
    const controller = new PipelineController(() => {}, { minStageDwellMs: 700 });
    controller.onSourceFetchStart('a', '#000');
    controller.onSourceFetchComplete('a');
    controller.onParseStart();
    controller.onValidateStart();
    controller.onProcessingComplete();

    vi.advanceTimersByTime(700);
    expect(status(controller, 'fetch')).toBe('complete');
    expect(status(controller, 'parse')).toBe('active');
    expect(status(controller, 'validate')).toBe('idle');

    vi.advanceTimersByTime(700);
    expect(status(controller, 'parse')).toBe('complete');
    expect(status(controller, 'validate')).toBe('active');

    vi.advanceTimersByTime(700);
    expect(status(controller, 'validate')).toBe('complete');
    expect(status(controller, 'normalize')).toBe('idle');
  });

  it('resolves whenIdle only after every held step has applied', async () => {
    const controller = new PipelineController(() => {}, { minStageDwellMs: 700 });
    controller.onSourceFetchStart('a', '#000');
    controller.onSourceFetchComplete('a');
    controller.onParseStart();
    controller.onValidateStart();
    controller.onProcessingComplete();

    let settled = false;
    void controller.whenIdle().then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(2099);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(status(controller, 'validate')).toBe('complete');
  });

  it('resolves whenIdle immediately when nothing is pending', async () => {
    const controller = new PipelineController(() => {}, { minStageDwellMs: 700 });
    let settled = false;
    void controller.whenIdle().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(true);
  });

  it('applies everything immediately with a zero dwell', () => {
    const controller = new PipelineController(() => {}, { minStageDwellMs: 0 });
    controller.onSourceFetchStart('a', '#000');
    controller.onSourceFetchComplete('a');
    controller.onParseStart();
    controller.onValidateStart();
    controller.onProcessingComplete();

    expect(status(controller, 'fetch')).toBe('complete');
    expect(status(controller, 'parse')).toBe('complete');
    expect(status(controller, 'validate')).toBe('complete');
  });

  it('reset drops held steps so nothing resurfaces later', () => {
    const controller = new PipelineController(() => {}, { minStageDwellMs: 700 });
    controller.onSourceFetchStart('a', '#000');
    controller.onSourceFetchComplete('a');
    controller.onParseStart();
    controller.reset();

    vi.advanceTimersByTime(2000);
    expect(status(controller, 'fetch')).toBe('idle');
    expect(status(controller, 'parse')).toBe('idle');
    expect(controller.getState().streams).toHaveLength(0);
  });

  it('notifies the listener each time a held step lands', () => {
    const listener = vi.fn();
    const controller = new PipelineController(listener, { minStageDwellMs: 700 });
    controller.onSourceFetchStart('a', '#000');
    const callsBefore = listener.mock.calls.length;
    controller.onSourceFetchComplete('a');
    expect(listener.mock.calls.length).toBe(callsBefore);

    vi.advanceTimersByTime(700);
    expect(listener.mock.calls.length).toBe(callsBefore + 1);
  });
});
