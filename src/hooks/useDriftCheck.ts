/**
 * useDriftCheck — runs a "Check for upstream updates" for one source, exposing
 * live progress, the result, and a cancel handle. Used only on the Data Sync
 * page (the library button just deep-links; it never launches a check).
 *
 * The check runs in the browser; navigating away unmounts this hook and aborts
 * the in-flight downloads. Whatever was persisted up to that point survives.
 */

import { useState, useEffect, useCallback } from 'react';
import { githubFetcher } from '../services/bulk-import/fetchers/GitHubFetcher';
import { runDriftCheck } from '../services/drift/driftService';
import type { DriftSource, DriftCheckProgress, DriftCheckResult } from '../services/drift/types';

export interface UseDriftCheck {
  run: (source: DriftSource, opts?: { token?: string }) => Promise<DriftCheckResult | undefined>;
  running: boolean;
  /** Source URL currently being checked, if any. */
  activeSourceUrl: string | null;
  progress: DriftCheckProgress | null;
  result: DriftCheckResult | null;
  error: string | null;
  cancel: () => void;
  reset: () => void;
}

export function useDriftCheck(): UseDriftCheck {
  const [running, setRunning] = useState(false);
  const [activeSourceUrl, setActiveSourceUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<DriftCheckProgress | null>(null);
  const [result, setResult] = useState<DriftCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (source: DriftSource, opts?: { token?: string }) => {
    setRunning(true);
    setActiveSourceUrl(source.sourceUrl);
    setError(null);
    setResult(null);
    setProgress({ phase: 'scanning', current: 0, total: 0, message: 'Starting…' });
    githubFetcher.resetAbort();
    try {
      const r = await runDriftCheck(source, { token: opts?.token, onProgress: setProgress });
      setResult(r);
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return undefined;
    } finally {
      setRunning(false);
      setActiveSourceUrl(null);
    }
  }, []);

  const cancel = useCallback(() => {
    githubFetcher.abort();
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(null);
  }, []);

  useEffect(() => () => { githubFetcher.abort(); }, []);

  return { run, running, activeSourceUrl, progress, result, error, cancel, reset };
}
