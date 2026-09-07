import { useCallback, useEffect, useRef, useState } from 'react';
import { integrationService } from '../lib/integrationService';
import { supabase } from '../lib/supabaseClient';
import { logAuditEvent } from '../lib/audit';
import { logger } from '../lib/logger';
import type {
  IntegrationProvider,
  PreflightResult,
  PreflightRun,
  PreflightWindowDays,
} from '../types';

interface RunPreflightArgs {
  detectionId: string;
  detectionName?: string;
  integrationId: string;
  integrationName?: string;
  provider: IntegrationProvider;
  windowDays: PreflightWindowDays;
}

/** Drives a single pre-flight run and exposes loading/result/error state. */
export function usePreflight() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setResult(null);
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const run = useCallback(async (args: RunPreflightArgs): Promise<PreflightResult | null> => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const res = await integrationService.runPreflight({
        detectionId: args.detectionId,
        integrationId: args.integrationId,
        windowDays: args.windowDays,
        provider: args.provider,
      }, {
        signal: controller.signal,
        onStarted: (started) => {
          activeRunIdRef.current = started.id;
        },
      });
      setResult(res);
      activeRunIdRef.current = null;
      logAuditEvent({
        action: 'detection.preflight',
        entity_type: 'detection',
        entity_id: args.detectionId,
        entity_name: args.detectionName,
        details: {
          integration_id: args.integrationId,
          integration_name: args.integrationName,
          provider: args.provider,
          window_days: args.windowDays,
          status: res.status,
          validation_passed: res.validation_passed,
          hit_count: res.hit_count,
        },
      });
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pre-flight failed';
      setError(message);
      logger.error('[preflight] run failed:', message);
      return null;
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      setLoading(false);
    }
  }, []);

  useEffect(
    () => () => {
      const activeRunId = activeRunIdRef.current;
      abortControllerRef.current?.abort();
      if (activeRunId) {
        void integrationService.cancelPreflight(activeRunId).catch((cancelError) => {
          logger.warn('[preflight] failed to cancel active run during cleanup:', cancelError);
        });
      }
    },
    [],
  );

  return { run, cancel, loading, result, error, reset };
}

/** Fetches the most recent pre-flight run for a detection (for the "last backtested" badge). */
export function useLatestPreflight(detectionId: string | undefined) {
  const [latest, setLatest] = useState<PreflightRun | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!detectionId) {
      setLatest(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('detection_preflight_runs')
        .select('*')
        .eq('detection_id', detectionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setLatest((data as PreflightRun) ?? null);
    } catch (err) {
      logger.warn('[preflight] failed to load latest run:', err);
      setLatest(null);
    } finally {
      setLoading(false);
    }
  }, [detectionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { latest, loading, refresh };
}
