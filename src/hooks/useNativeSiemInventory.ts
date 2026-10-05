import { useCallback, useEffect, useRef, useState } from 'react';
import { nativeSiemService, type NativeInventory } from '@/services/nativeSiemService';

export function useNativeSiemInventory(integrationId: string) {
  const [inventory, setInventory] = useState<NativeInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const generation = useRef(0);
  const notified = useRef<string | null>(null);
  const reload = useCallback(async () => {
    const current = generation.current;
    try {
      const data = await nativeSiemService.inventory(integrationId);
      if (generation.current === current) {
        setInventory(data);
        setError(null);
        if (data.run && ['complete', 'partial'].includes(data.run.status) && notified.current !== data.run.id) {
          notified.current = data.run.id;
          window.dispatchEvent(new Event('native-siem-library-updated'));
        }
      }
    } catch (err) {
      if (generation.current === current)
        setError(err instanceof Error ? err.message : 'Could not load production inventory');
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [integrationId]);
  useEffect(() => {
    const activeGeneration = ++generation.current;
    setInventory(null);
    setLoading(true);
    setError(null);
    setStarting(false);
    void reload();
    return () => {
      generation.current = activeGeneration + 1;
    };
  }, [reload]);
  const running = starting || ['queued', 'running'].includes(inventory?.run?.status || '');
  useEffect(() => {
    if (!running) return;
    // Sequential polling avoids overlapping reloads; the server owns job execution.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await reload();
      if (!cancelled) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [running, reload]);
  const start = useCallback(async () => {
    const current = generation.current;
    setStarting(true);
    setError(null);
    try {
      await nativeSiemService.start(integrationId);
      if (generation.current === current) await reload();
    } catch (err) {
      if (generation.current === current) setError(err instanceof Error ? err.message : 'Could not start sync');
    } finally {
      if (generation.current === current) setStarting(false);
    }
  }, [integrationId, reload]);
  return { inventory, loading, error, running, reload, start };
}
