import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { bucketsForPlatforms, type TechBucket } from '../lib/actionPlan/technologyBuckets';

export interface TechniqueBucketsState {
  /** Map from mitreId (e.g. "T1003") to set of buckets the technique applies to */
  buckets: Map<string, Set<TechBucket>>;
  loading: boolean;
  error: string | null;
}

let cachePromise: Promise<Map<string, Set<TechBucket>>> | null = null;
let cachedBuckets: Map<string, Set<TechBucket>> | null = null;

async function fetchTechniqueBuckets(): Promise<Map<string, Set<TechBucket>>> {
  if (cachePromise) return cachePromise;
  cachePromise = (async () => {
    const { data, error } = await supabase
      .from('v_mitre_techniques_full')
      .select('mitre_id, platforms')
      .eq('deprecated', false);
    if (error) {
      cachePromise = null; // allow retry on next mount
      throw error;
    }
    const map = new Map<string, Set<TechBucket>>();
    for (const row of data ?? []) {
      const mitreId = (row as { mitre_id?: string }).mitre_id;
      const platforms = (row as { platforms?: string[] }).platforms ?? [];
      if (mitreId) map.set(mitreId, bucketsForPlatforms(platforms));
    }
    cachedBuckets = map;
    return map;
  })();
  return cachePromise;
}

export function useTechniqueBuckets(): TechniqueBucketsState {
  const [state, setState] = useState<TechniqueBucketsState>({
    buckets: cachedBuckets ?? new Map(),
    loading: cachedBuckets === null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetchTechniqueBuckets()
      .then(buckets => {
        if (!cancelled) setState({ buckets, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled) {
          setState({
            buckets: new Map(),
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load technique buckets',
          });
        }
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}

/** Test-only: reset module cache. */
export function __resetTechniqueBucketsCache(): void {
  cachePromise = null;
  cachedBuckets = null;
}
