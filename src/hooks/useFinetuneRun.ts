import { useCallback, useEffect, useRef, useState } from 'react';
import { finetuneService } from '../lib/finetuneService';
import { logger } from '../lib/logger';
import type {
  FinetuneLadder, FinetunePollResult, FinetuneStatus, FinetuneTimelineEvent, FinetuneUsage,
} from '../types/finetune';

const POLL_INTERVAL_MS = 2000;
const MAX_TOOL_CONCURRENCY = 3;

interface StartArgs {
  detectionId: string;
  integrationId: string;
  windowDays: number;
  preflightRunId?: string;
}

interface FinetuneRunState {
  status: 'idle' | 'starting' | FinetuneStatus;
  timeline: FinetuneTimelineEvent[];
  queryCount: number;
  result: FinetuneLadder | null;
  usage: FinetuneUsage | null;
  error: string | null;
}

const INITIAL: FinetuneRunState = {
  status: 'idle', timeline: [], queryCount: 0, result: null, usage: null, error: null,
};

/** Drives a single agentic finetuning run from the browser. */
export function useFinetuneRun() {
  const [state, setState] = useState<FinetuneRunState>(INITIAL);
  const runIdRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);
  const inFlightToolsRef = useRef<Set<string>>(new Set());

  const applyPoll = useCallback((poll: FinetunePollResult) => {
    setState((s) => ({
      ...s,
      status: poll.status,
      timeline: poll.timeline,
      queryCount: poll.queryCount,
      result: poll.result,
      usage: poll.usage,
    }));
  }, []);

  const loop = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId || stoppedRef.current) return;
    try {
      const poll = await finetuneService.poll(runId);
      if (stoppedRef.current) return;
      applyPoll(poll);

      if (poll.status !== 'running') { stoppedRef.current = true; return; }

      // Execute any pending tool calls that are not already in flight.
      const fresh = poll.pendingTools.filter((t) => !inFlightToolsRef.current.has(t.toolUseId));
      if (fresh.length > 0) {
        for (let i = 0; i < fresh.length; i += MAX_TOOL_CONCURRENCY) {
          const batch = fresh.slice(i, i + MAX_TOOL_CONCURRENCY);
          await Promise.all(batch.map(async (t) => {
            inFlightToolsRef.current.add(t.toolUseId);
            try { await finetuneService.tool(runId, t.toolUseId); }
            catch (e) { logger.warn('[finetune] tool execution failed:', e); }
            finally { inFlightToolsRef.current.delete(t.toolUseId); }
          }));
        }
        if (!stoppedRef.current) { void loop(); return; } // poll again immediately
      }

      if (!stoppedRef.current) setTimeout(() => { void loop(); }, POLL_INTERVAL_MS);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Finetuning poll failed';
      logger.error('[finetune] poll failed:', message);
      if (!stoppedRef.current) setTimeout(() => { void loop(); }, POLL_INTERVAL_MS);
    }
  }, [applyPoll]);

  const start = useCallback(async (args: StartArgs) => {
    stoppedRef.current = false;
    inFlightToolsRef.current.clear();
    setState({ ...INITIAL, status: 'starting' });
    try {
      const { runId } = await finetuneService.start(args);
      runIdRef.current = runId;
      setState((s) => ({ ...s, status: 'running' }));
      void loop();
    } catch (e) {
      setState((s) => ({
        ...s, status: 'failed',
        error: e instanceof Error ? e.message : 'Could not start finetuning.',
      }));
    }
  }, [loop]);

  const cancel = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    stoppedRef.current = true;
    try { await finetuneService.cancel(runId); } catch (e) { logger.warn('[finetune] cancel failed:', e); }
    setState((s) => ({ ...s, status: 'cancelled' }));
  }, []);

  // Re-arm on (re)mount: React StrictMode runs this cleanup once during the dev
  // mount cycle, before an in-flight start() resolves. Without re-arming, the
  // poll loop sees stoppedRef === true on entry and never issues a single poll.
  useEffect(() => {
    stoppedRef.current = false;
    return () => { stoppedRef.current = true; };
  }, []);

  return { ...state, start, cancel };
}
