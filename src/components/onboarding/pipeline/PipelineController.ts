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

  constructor(onChange: PipelineEventHandler) {
    this.onChange = onChange;
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
  // Source fetch events
  // -----------------------------------------------------------------------

  /** A source has started fetching files */
  onSourceFetchStart(sourceId: string, color: string): void {
    this.addOrUpdateStream({
      sourceId,
      from: 'source',
      to: 'fetch',
      status: 'active',
      color,
    });

    this.updateStage('fetch', { status: 'active' });
    this.sourceFetchCounts.set(sourceId, 0);
    this.notify();
  }

  /** A source reports fetch progress */
  onSourceFetchProgress(sourceId: string, fetched: number, _total: number): void {
    this.sourceFetchCounts.set(sourceId, fetched);

    // Sum all source fetch counts for the stage counter
    let totalFetched = 0;
    this.sourceFetchCounts.forEach((count) => {
      totalFetched += count;
    });

    this.updateStage('fetch', { counter: totalFetched });
    this.notify();
  }

  /** A source has finished fetching */
  onSourceFetchComplete(sourceId: string): void {
    // Mark the source -> fetch stream as complete
    const stream = this.findStream(sourceId, 'source', 'fetch');
    if (stream) {
      this.addOrUpdateStream({ ...stream, status: 'complete' });
    }

    // If all source->fetch streams are complete, mark the fetch stage complete
    if (this.allSourceStreamsComplete('fetch')) {
      this.updateStage('fetch', { status: 'complete' });
    }

    this.notify();
  }

  // -----------------------------------------------------------------------
  // Parse events
  // -----------------------------------------------------------------------

  /** Parsing has started */
  onParseStart(): void {
    // Ensure fetch->parse stream is active
    this.addOrUpdateStream({
      sourceId: 'system',
      from: 'fetch',
      to: 'parse',
      status: 'active',
      color: PRIMARY_COLOR,
    });

    this.updateStage('parse', { status: 'active' });
    this.notify();
  }

  /** Parse progress update */
  onParseProgress(parsed: number, errors: number): void {
    this.updateStage('parse', {
      counter: parsed,
      secondaryCounter: errors > 0 ? errors : undefined,
    });
    this.notify();
  }

  // -----------------------------------------------------------------------
  // Validate events
  // -----------------------------------------------------------------------

  /** Validation has started */
  onValidateStart(): void {
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
    this.notify();
  }

  /** Validation progress update */
  onValidateProgress(valid: number, warnings: number): void {
    this.updateStage('validate', {
      counter: valid,
      secondaryCounter: warnings > 0 ? warnings : undefined,
    });
    this.notify();
  }

  // -----------------------------------------------------------------------
  // Normalize events
  // -----------------------------------------------------------------------

  /** Normalization progress update (implicitly activates the normalize stage) */
  onNormalizeProgress(normalized: number): void {
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
    this.notify();
  }

  // -----------------------------------------------------------------------
  // Insert (store) events
  // -----------------------------------------------------------------------

  /** Insertion has started for a source */
  onInsertStart(sourceId: string): void {
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
    this.notify();
  }

  /** Insertion progress */
  onInsertProgress(inserted: number, _total: number): void {
    this.updateStage('store', { counter: inserted });
    this.notify();
  }

  // -----------------------------------------------------------------------
  // Completion / error events
  // -----------------------------------------------------------------------

  /** A single source has completed the full pipeline */
  onSourceComplete(sourceId: string): void {
    // Set all streams for this sourceId to complete
    for (let i = 0; i < this.streams.length; i++) {
      if (this.streams[i].sourceId === sourceId) {
        this.streams[i] = { ...this.streams[i], status: 'complete' };
      }
    }
    this.notify();
  }

  /** A source has encountered an error */
  onSourceError(sourceId: string): void {
    // Set all streams for this sourceId to error
    for (let i = 0; i < this.streams.length; i++) {
      if (this.streams[i].sourceId === sourceId) {
        this.streams[i] = { ...this.streams[i], status: 'error' };
      }
    }
    this.notify();
  }

  /** All sources have completed the full pipeline (including insert) */
  onAllComplete(): void {
    // Set all stages to complete
    for (const stage of this.stageOrder) {
      this.updateStage(stage, { status: 'complete' });
    }

    // Set all streams to complete
    for (let i = 0; i < this.streams.length; i++) {
      this.streams[i] = { ...this.streams[i], status: 'complete' };
    }

    this.notify();
  }

  /**
   * Processing (fetch/parse/validate) is done but insert hasn't started yet.
   * Only marks stages through validate as complete; normalize and store stay idle.
   */
  onProcessingComplete(): void {
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

    this.notify();
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

  /** Reset all stages to idle and clear all streams */
  reset(): void {
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
  }
}
