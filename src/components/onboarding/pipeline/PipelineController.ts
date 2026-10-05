/**
 * PipelineController
 *
 * Pure logic class (no React) that maps bulk import pipeline events to
 * animation state changes. The controller maintains its own internal
 * representation of stage and stream states, and notifies a listener
 * whenever the state changes.
 *
 * Used by OnboardingContext to drive the PipelineVisualization without
 * coupling import logic to React rendering.
 *
 * Pacing: with `minStageDwellMs` > 0 every event is applied through an
 * ordered queue. A step that would complete a stage waits until that stage
 * has been visually active for at least the dwell, and every later event
 * waits behind it so order is preserved. The real import is never delayed;
 * only the picture lags, by at most one dwell per stage hop. A dwell of 0
 * applies every event synchronously (legacy behaviour, reduced motion).
 */

import type { PipelineStage, StageState, StreamState } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineAnimationState {
  stages: StageState[];
  streams: StreamState[];
}

export type PipelineEventHandler = (state: PipelineAnimationState) => void;

export interface PipelineControllerOptions {
  /** Minimum time a stage stays visually active before it may complete. 0 applies events instantly. */
  minStageDwellMs?: number;
}

interface QueuedStep {
  /** Stages this step may mark complete. Each must have been active for at least the dwell first. */
  gates: PipelineStage[];
  run: () => void;
}

// ---------------------------------------------------------------------------
// Default colors
// ---------------------------------------------------------------------------

const PRIMARY_COLOR = 'rgb(var(--md-sys-color-primary))';

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class PipelineController {
  private stages: Map<PipelineStage, StageState>;
  private streams: StreamState[];
  private onChange: PipelineEventHandler;
  private stageOrder: PipelineStage[] = ['fetch', 'parse', 'validate', 'normalize', 'store'];

  /** Track per-source fetch counts so we can sum them for the fetch stage counter */
  private sourceFetchCounts: Map<string, number> = new Map();

  // --- pacing ---
  private readonly minStageDwellMs: number;
  /** When each stage last became active (ms epoch). */
  private activatedAt: Map<PipelineStage, number> = new Map();
  private queue: QueuedStep[] = [];
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private idleWaiters: Array<() => void> = [];

  constructor(onChange: PipelineEventHandler, options: PipelineControllerOptions = {}) {
    this.onChange = onChange;
    this.minStageDwellMs = Math.max(0, options.minStageDwellMs ?? 0);
    this.stages = new Map<PipelineStage, StageState>([
      ['fetch', { stage: 'fetch', status: 'idle', counter: 0, label: 'FETCH' }],
      ['parse', { stage: 'parse', status: 'idle', counter: 0, label: 'PARSE' }],
      ['validate', { stage: 'validate', status: 'idle', counter: 0, label: 'VALIDATE' }],
      ['normalize', { stage: 'normalize', status: 'idle', counter: 0, label: 'NORMALIZE' }],
      ['store', { stage: 'store', status: 'idle', counter: 0, label: 'STORE' }],
    ]);
    this.streams = [];
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /** Emit the current snapshot to the listener */
  private notify(): void {
    this.onChange(this.getState());
  }

  /** Update a stage's properties (merges partial updates) */
  private updateStage(
    stage: PipelineStage,
    update: Partial<Pick<StageState, 'status' | 'counter' | 'secondaryCounter'>>,
  ): void {
    const current = this.stages.get(stage);
    if (!current) return;
    if (update.status === 'active' && current.status !== 'active') {
      this.activatedAt.set(stage, Date.now());
    }
    this.stages.set(stage, { ...current, ...update });
  }

  /** Find an existing stream by sourceId, from, and to */
  private findStream(
    sourceId: string,
    from: StreamState['from'],
    to: StreamState['to'],
  ): StreamState | undefined {
    return this.streams.find(
      (s) => s.sourceId === sourceId && s.from === from && s.to === to,
    );
  }

  /** Add a stream or update it if one with the same key already exists */
  private addOrUpdateStream(stream: StreamState): void {
    const idx = this.streams.findIndex(
      (s) => s.sourceId === stream.sourceId && s.from === stream.from && s.to === stream.to,
    );
    if (idx >= 0) {
      this.streams[idx] = stream;
    } else {
      this.streams.push(stream);
    }
  }

  /** Check if all streams targeting a given stage from 'source' are complete */
  private allSourceStreamsComplete(to: PipelineStage): boolean {
    const sourceStreams = this.streams.filter(
      (s) => s.from === 'source' && s.to === to,
    );
    if (sourceStreams.length === 0) return false;
    return sourceStreams.every((s) => s.status === 'complete');
  }

  // -----------------------------------------------------------------------
  // Pacing queue
  // -----------------------------------------------------------------------

  /** Milliseconds a step must still wait before its gated stages have shown for the full dwell. */
  private holdRemaining(gates: PipelineStage[]): number {
    if (this.minStageDwellMs === 0) return 0;
    let remaining = 0;
    for (const gate of gates) {
      const stage = this.stages.get(gate);
      const activatedAt = this.activatedAt.get(gate);
      if (!stage || stage.status !== 'active' || activatedAt === undefined) continue;
      remaining = Math.max(remaining, this.minStageDwellMs - (Date.now() - activatedAt));
    }
    return Math.max(0, remaining);
  }

  private enqueue(gates: PipelineStage[], run: () => void): void {
    this.queue.push({ gates, run });
    this.drain();
  }

  /** Apply queued steps in order, pausing whenever the head step is still held by a dwell. */
  private drain(): void {
    if (this.holdTimer !== null) return;

    while (this.queue.length > 0) {
      const step = this.queue[0];
      const wait = this.holdRemaining(step.gates);
      if (wait > 0) {
        this.holdTimer = setTimeout(() => {
          this.holdTimer = null;
          this.drain();
        }, wait);
        return;
      }
      this.queue.shift();
      step.run();
      this.notify();
    }

    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  /** Resolves once every queued step has been applied (immediately if nothing is pending). */
  whenIdle(): Promise<void> {
    if (this.queue.length === 0 && this.holdTimer === null) return Promise.resolve();
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  // -----------------------------------------------------------------------
  // Source fetch events
  // -----------------------------------------------------------------------

  /** A source has started fetching files */
  onSourceFetchStart(sourceId: string, color: string): void {
    this.enqueue([], () => {
      this.addOrUpdateStream({
        sourceId,
        from: 'source',
        to: 'fetch',
        status: 'active',
        color,
      });

      this.updateStage('fetch', { status: 'active' });
      this.sourceFetchCounts.set(sourceId, 0);
    });
  }

  /** A source reports fetch progress */
  onSourceFetchProgress(sourceId: string, fetched: number, _total: number): void {
    this.enqueue([], () => {
      this.sourceFetchCounts.set(sourceId, fetched);

      // Sum all source fetch counts for the stage counter
      let totalFetched = 0;
      this.sourceFetchCounts.forEach((count) => {
        totalFetched += count;
      });

      this.updateStage('fetch', { counter: totalFetched });
    });
  }

  /** A source has finished fetching */
  onSourceFetchComplete(sourceId: string): void {
    this.enqueue(['fetch'], () => {
      // Mark the source -> fetch stream as complete
      const stream = this.findStream(sourceId, 'source', 'fetch');
      if (stream) {
        this.addOrUpdateStream({ ...stream, status: 'complete' });
      }

      // If all source->fetch streams are complete, mark the fetch stage complete
      if (this.allSourceStreamsComplete('fetch')) {
        this.updateStage('fetch', { status: 'complete' });
      }
    });
  }

  // -----------------------------------------------------------------------
  // Parse events
  // -----------------------------------------------------------------------

  /** Parsing has started */
  onParseStart(): void {
    this.enqueue([], () => {
      // Ensure fetch->parse stream is active
      this.addOrUpdateStream({
        sourceId: 'system',
        from: 'fetch',
        to: 'parse',
        status: 'active',
        color: PRIMARY_COLOR,
      });

      this.updateStage('parse', { status: 'active' });
    });
  }

  /** Parse progress update */
  onParseProgress(parsed: number, errors: number): void {
    this.enqueue([], () => {
      this.updateStage('parse', {
        counter: parsed,
        secondaryCounter: errors > 0 ? errors : undefined,
      });
    });
  }

  // -----------------------------------------------------------------------
  // Validate events
  // -----------------------------------------------------------------------

  /** Validation has started */
  onValidateStart(): void {
    this.enqueue(['parse'], () => {
      // Complete the fetch->parse stream if not already
      const fetchParseStream = this.findStream('system', 'fetch', 'parse');
      if (fetchParseStream && fetchParseStream.status !== 'complete') {
        this.addOrUpdateStream({ ...fetchParseStream, status: 'complete' });
      }

      // Also mark parse stage complete
      this.updateStage('parse', { status: 'complete' });

      // Activate parse->validate stream
      this.addOrUpdateStream({
        sourceId: 'system',
        from: 'parse',
        to: 'validate',
        status: 'active',
        color: PRIMARY_COLOR,
      });

      this.updateStage('validate', { status: 'active' });
    });
  }

  /** Validation progress update */
  onValidateProgress(valid: number, warnings: number): void {
    this.enqueue([], () => {
      this.updateStage('validate', {
        counter: valid,
        secondaryCounter: warnings > 0 ? warnings : undefined,
      });
    });
  }

  // -----------------------------------------------------------------------
  // Normalize events
  // -----------------------------------------------------------------------

  /** Normalization progress update (implicitly activates the normalize stage) */
  onNormalizeProgress(normalized: number): void {
    this.enqueue(['validate'], () => {
      // Complete validate->normalize if not already active
      const valNormStream = this.findStream('system', 'validate', 'normalize');
      if (!valNormStream || valNormStream.status === 'idle') {
        // Complete validate stage
        this.updateStage('validate', { status: 'complete' });

        // Complete parse->validate stream
        const parseValStream = this.findStream('system', 'parse', 'validate');
        if (parseValStream && parseValStream.status !== 'complete') {
          this.addOrUpdateStream({ ...parseValStream, status: 'complete' });
        }

        // Activate validate->normalize stream
        this.addOrUpdateStream({
          sourceId: 'system',
          from: 'validate',
          to: 'normalize',
          status: 'active',
          color: PRIMARY_COLOR,
        });
      }

      this.updateStage('normalize', { status: 'active', counter: normalized });
    });
  }

  // -----------------------------------------------------------------------
  // Insert (store) events
  // -----------------------------------------------------------------------

  /** Insertion has started for a source */
  onInsertStart(_sourceId: string): void {
    this.enqueue(['normalize'], () => {
      // Complete normalize stage and validate->normalize stream
      this.updateStage('normalize', { status: 'complete' });

      const valNormStream = this.findStream('system', 'validate', 'normalize');
      if (valNormStream && valNormStream.status !== 'complete') {
        this.addOrUpdateStream({ ...valNormStream, status: 'complete' });
      }

      // Activate normalize->store stream
      this.addOrUpdateStream({
        sourceId: 'system',
        from: 'normalize',
        to: 'store',
        status: 'active',
        color: PRIMARY_COLOR,
      });

      this.updateStage('store', { status: 'active' });
    });
  }

  /** Insertion progress */
  onInsertProgress(inserted: number, _total: number): void {
    this.enqueue([], () => {
      this.updateStage('store', { counter: inserted });
    });
  }

  // -----------------------------------------------------------------------
  // Completion / error events
  // -----------------------------------------------------------------------

  /** A single source has completed the full pipeline */
  onSourceComplete(sourceId: string): void {
    this.enqueue([], () => {
      // Set all streams for this sourceId to complete
      for (let i = 0; i < this.streams.length; i++) {
        if (this.streams[i].sourceId === sourceId) {
          this.streams[i] = { ...this.streams[i], status: 'complete' };
        }
      }
    });
  }

  /** A source has encountered an error */
  onSourceError(sourceId: string): void {
    this.enqueue([], () => {
      // Set all streams for this sourceId to error
      for (let i = 0; i < this.streams.length; i++) {
        if (this.streams[i].sourceId === sourceId) {
          this.streams[i] = { ...this.streams[i], status: 'error' };
        }
      }
    });
  }

  /** All sources have completed the full pipeline (including insert) */
  onAllComplete(): void {
    this.enqueue(['store'], () => {
      // Set all stages to complete
      for (const stage of this.stageOrder) {
        this.updateStage(stage, { status: 'complete' });
      }

      // Set all streams to complete
      for (let i = 0; i < this.streams.length; i++) {
        this.streams[i] = { ...this.streams[i], status: 'complete' };
      }
    });
  }

  /**
   * Processing (fetch/parse/validate) is done but insert hasn't started yet.
   * Only marks stages through validate as complete; normalize and store stay idle.
   */
  onProcessingComplete(): void {
    this.enqueue(['fetch', 'parse', 'validate'], () => {
      // Mark fetch, parse, validate as complete
      this.updateStage('fetch', { status: 'complete' });
      this.updateStage('parse', { status: 'complete' });
      this.updateStage('validate', { status: 'complete' });

      // Complete streams up through validate
      for (let i = 0; i < this.streams.length; i++) {
        const s = this.streams[i];
        // Only complete streams that go TO fetch, parse, or validate
        if (s.to === 'fetch' || s.to === 'parse' || s.to === 'validate') {
          this.streams[i] = { ...this.streams[i], status: 'complete' };
        }
      }
    });
  }

  // -----------------------------------------------------------------------
  // State access
  // -----------------------------------------------------------------------

  /** Return a snapshot of the current animation state */
  getState(): PipelineAnimationState {
    return {
      stages: Array.from(this.stages.values()),
      streams: [...this.streams],
    };
  }

  /** Reset all stages to idle, clear all streams and drop any held steps. Applies immediately. */
  reset(): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    this.queue = [];
    this.activatedAt.clear();

    for (const stage of this.stageOrder) {
      this.stages.set(stage, {
        stage,
        status: 'idle',
        counter: 0,
        label: stage.toUpperCase(),
      });
    }
    this.streams = [];
    this.sourceFetchCounts.clear();
    this.notify();

    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }
}
