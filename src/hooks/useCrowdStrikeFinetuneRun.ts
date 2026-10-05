import { useCallback, useEffect, useRef, useState } from 'react';
import { crowdstrikeFinetuneService } from '../lib/crowdstrikeFinetuneService';
import { logger } from '../lib/logger';
import type {
  CrowdStrikeFinetuneLadder,
  CrowdStrikeFinetuneStatus,
  CrowdStrikeFinetuneTimelineEvent,
  CrowdStrikeFinetuneUsage,
} from '../types/crowdstrikeFinetune';

const POLL_INTERVAL_MS = 2000;

interface State {
  status: 'idle' | 'starting' | CrowdStrikeFinetuneStatus;
  timeline: CrowdStrikeFinetuneTimelineEvent[];
  queryCount: number;
  result: CrowdStrikeFinetuneLadder | null;
  usage: CrowdStrikeFinetuneUsage | null;
  error: string | null;
}

const INITIAL: State = {
  status: 'idle',
  timeline: [],
  queryCount: 0,
  result: null,
  usage: null,
  error: null,
};

export function useCrowdStrikeFinetuneRun() {
  const [state, setState] = useState<State>(INITIAL);
  const runIdRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);
  const inFlightToolRef = useRef<string | null>(null);

  const loop = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId || stoppedRef.current) return;
    try {
      const poll = await crowdstrikeFinetuneService.poll(runId);
      if (stoppedRef.current) return;
      setState((current) => ({
        ...current,
        status: poll.status,
        timeline: poll.timeline,
        queryCount: poll.queryCount,
        result: poll.result,
        usage: poll.usage,
      }));
      if (poll.status !== 'running') {
        stoppedRef.current = true;
        return;
      }

      const pending = poll.pendingTools.find((tool) => tool.toolUseId !== inFlightToolRef.current);
      if (pending) {
        inFlightToolRef.current = pending.toolUseId;
        try {
          await crowdstrikeFinetuneService.tool(runId, pending.toolUseId);
        } catch (error) {
          logger.warn('[crowdstrike-finetune] tool execution failed:', error);
        } finally {
          inFlightToolRef.current = null;
        }
        if (!stoppedRef.current) void loop();
        return;
      }
      setTimeout(() => void loop(), POLL_INTERVAL_MS);
    } catch (error) {
      logger.error('[crowdstrike-finetune] polling failed:', error);
      if (!stoppedRef.current) setTimeout(() => void loop(), POLL_INTERVAL_MS);
    }
  }, []);

  const start = useCallback(async (args: {
    detectionId: string;
    integrationId: string;
    preflightRunId: string;
  }) => {
    stoppedRef.current = false;
    inFlightToolRef.current = null;
    setState({ ...INITIAL, status: 'starting' });
    try {
      const { runId } = await crowdstrikeFinetuneService.start(args);
      runIdRef.current = runId;
      setState((current) => ({ ...current, status: 'running' }));
      void loop();
    } catch (error) {
      setState((current) => ({
        ...current,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Could not start CrowdStrike finetuning.',
      }));
    }
  }, [loop]);

  const cancel = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    stoppedRef.current = true;
    try {
      await crowdstrikeFinetuneService.cancel(runId);
    } catch (error) {
      logger.warn('[crowdstrike-finetune] cancellation failed:', error);
    }
    setState((current) => ({ ...current, status: 'cancelled' }));
  }, []);

  // Re-arm on (re)mount: React StrictMode runs this cleanup once during the dev
  // mount cycle, before an in-flight start() resolves. Without re-arming, the
  // poll loop sees stoppedRef === true on entry and never issues a single poll.
  useEffect(() => {
    stoppedRef.current = false;
    return () => {
      stoppedRef.current = true;
    };
  }, []);

  return { ...state, start, cancel };
}
