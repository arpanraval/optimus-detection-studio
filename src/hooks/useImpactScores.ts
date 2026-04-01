import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Detection } from '../types';
import { toError } from '../lib/errors';

// ============================================
// TYPES
// ============================================

export interface MitigationImpact {
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string | null;
  technique_count: number;
  raw_score: number;
  impact_score: number;
}

export interface StrategyImpact {
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string | null;
  technique_stix_id: string;
  technique_id: string;
  technique_name: string;
  analytic_count: number;
  strategy_order: number;
  has_mitigation: boolean;
  tis: number;
  disruption_factor: number;
  raw_score: number;
  impact_score: number;
}

export interface MitigationImpactDetail {
  mitigation_stix_id: string;
  mitigation_mitre_id: string;
  mitigation_name: string;
  impact_score: number;
  technique_count: number;
  total_groups_disrupted: number;
  total_campaigns_disrupted: number;
  top_groups: DisruptedGroup[];
}

export interface StrategyImpactDetail {
  strategy_stix_id: string;
  strategy_mitre_id: string;
  strategy_name: string;
  technique_id: string;
  technique_name: string;
  impact_score: number;
  analytic_count: number;
  total_groups_detected: number;
  total_campaigns_detected: number;
  top_groups: DetectedGroup[];
}

export interface DisruptedGroup {
  stix_id: string;
  mitre_id: string;
  name: string;
  taw: number;
  techniques_blocked: number;
}

export interface DetectedGroup {
  stix_id: string;
  mitre_id: string;
  name: string;
  taw: number;
}

export interface ThreatActorWeight {
  stix_id: string;
  mitre_id: string;
  name: string;
  technique_count: number;
  campaign_count: number;
  software_count: number;
  tactic_count: number;
  recency_multiplier: number;
  base_weight: number;
  taw: number;
}

export interface DefensivePosture {
  total_detections: number;
  techniques_covered: number;
  total_techniques: number;
  technique_coverage_pct: number;
  groups_defended: number;
  total_groups: number;
  group_coverage_pct: number;
  campaigns_defended: number;
  total_campaigns: number;
  campaign_coverage_pct: number;
  avg_taw_covered: number;
  top_gaps: TechniqueGap[];
}

export interface TechniqueGap {
  mitre_id: string;
  name: string;
  tis: number;
  gap_score: number;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getImpactLabel(score: number): string {
  if (score >= 90) return 'Critical';
  if (score >= 75) return 'High';
  if (score >= 50) return 'Medium';
  if (score >= 25) return 'Low';
  return 'Minimal';
}

export function getImpactColor(score: number): string {
  if (score >= 90) return 'tertiary';
  if (score >= 75) return 'primary';
  if (score >= 50) return 'warning';
  if (score >= 25) return 'orange-500';
  return 'error';
}

export function getImpactBgClass(score: number): string {
  if (score >= 90) return 'bg-tertiary text-on-tertiary';
  if (score >= 75) return 'bg-primary text-on-primary';
  if (score >= 50) return 'bg-warning text-on-warning';
  if (score >= 25) return 'bg-orange-500 text-white';
  return 'bg-error text-on-error';
}

export function getTawIndicator(taw: number): string {
  if (taw >= 0.8) return '●●●●';
  if (taw >= 0.6) return '●●●○';
  if (taw >= 0.4) return '●●○○';
  if (taw >= 0.2) return '●○○○';
  return '○○○○';
}

// ============================================
// HOOKS
// ============================================

/**
 * Hook to fetch top impact mitigations
 */
export function useTopImpactMitigations(limit: number = 20) {
  const [mitigations, setMitigations] = useState<MitigationImpact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const activeRequestRef = useRef(0);

  useEffect(() => {
    loadMitigations();
  }, [limit]);

  async function loadMitigations() {
    const requestId = ++activeRequestRef.current;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_top_impact_mitigations', { p_limit: limit });

      if (requestId !== activeRequestRef.current) return;
      if (fetchError) throw fetchError;
      setMitigations(data || []);
    } catch (err) {
      if (requestId !== activeRequestRef.current) return;
      console.error('Failed to load impact mitigations:', err);
      setError(toError(err));
    } finally {
      if (requestId === activeRequestRef.current) setLoading(false);
    }
  }

  return { mitigations, loading, error, refetch: loadMitigations };
}

/**
 * Hook to fetch top impact strategies
 */
export function useTopImpactStrategies(limit: number = 20) {
  const [strategies, setStrategies] = useState<StrategyImpact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const activeRequestRef = useRef(0);

  useEffect(() => {
    loadStrategies();
  }, [limit]);

  async function loadStrategies() {
    const requestId = ++activeRequestRef.current;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_top_impact_strategies', { p_limit: limit });

      if (requestId !== activeRequestRef.current) return;
      if (fetchError) throw fetchError;
      setStrategies(data || []);
    } catch (err) {
      if (requestId !== activeRequestRef.current) return;
      console.error('Failed to load impact strategies:', err);
      setError(toError(err));
    } finally {
      if (requestId === activeRequestRef.current) setLoading(false);
    }
  }

  return { strategies, loading, error, refetch: loadStrategies };
}

/**
 * Hook to fetch mitigation impact detail
 */
export function useMitigationImpactDetail(mitigationStixId: string | null) {
  const [detail, setDetail] = useState<MitigationImpactDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const activeRequestRef = useRef(0);

  useEffect(() => {
    if (mitigationStixId) {
      loadDetail();
    } else {
      setDetail(null);
    }
  }, [mitigationStixId]);

  async function loadDetail() {
    if (!mitigationStixId) return;

    const requestId = ++activeRequestRef.current;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_mitigation_impact_detail', { p_mitigation_stix_id: mitigationStixId });

      if (requestId !== activeRequestRef.current) return;
      if (fetchError) throw fetchError;

      if (data && data.length > 0) {
        const row = data[0];
        setDetail({
          ...row,
          top_groups: row.top_groups || []
        });
      } else {
        setDetail(null);
      }
    } catch (err) {
      if (requestId !== activeRequestRef.current) return;
      console.error('Failed to load mitigation impact detail:', err);
      setError(toError(err));
    } finally {
      if (requestId === activeRequestRef.current) setLoading(false);
    }
  }

  return { detail, loading, error, refetch: loadDetail };
}

/**
 * Hook to fetch strategy impact detail
 */
export function useStrategyImpactDetail(strategyStixId: string | null) {
  const [detail, setDetail] = useState<StrategyImpactDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const activeRequestRef = useRef(0);

  useEffect(() => {
    if (strategyStixId) {
      loadDetail();
    } else {
      setDetail(null);
    }
  }, [strategyStixId]);

  async function loadDetail() {
    if (!strategyStixId) return;

    const requestId = ++activeRequestRef.current;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_strategy_impact_detail', { p_strategy_stix_id: strategyStixId });

      if (requestId !== activeRequestRef.current) return;
      if (fetchError) throw fetchError;

      if (data && data.length > 0) {
        const row = data[0];
        setDetail({
          ...row,
          top_groups: row.top_groups || []
        });
      } else {
        setDetail(null);
      }
    } catch (err) {
      if (requestId !== activeRequestRef.current) return;
      console.error('Failed to load strategy impact detail:', err);
      setError(toError(err));
    } finally {
      if (requestId === activeRequestRef.current) setLoading(false);
    }
  }

  return { detail, loading, error, refetch: loadDetail };
}

/**
 * Module-level request deduplication for get_defensive_posture.
 * Multiple hook instances with the same (userId, scope) share ONE in-flight RPC call.
 */
const _postureCache = new Map<string, { promise: Promise<DefensivePosture | null>; ts: number }>();
const POSTURE_CACHE_TTL = 5000; // 5s — prevents re-fetch storms on rapid mount/unmount

async function fetchPostureShared(userId: string, scope: string): Promise<DefensivePosture | null> {
  const key = `${userId}:${scope}`;
  const cached = _postureCache.get(key);
  if (cached && Date.now() - cached.ts < POSTURE_CACHE_TTL) {
    return cached.promise;
  }

  // Inject a slight delay to avoid competing with heavy initial data loads
  const promise = new Promise<void>(resolve => setTimeout(resolve, 800))
    .then(() => supabase.rpc('get_defensive_posture', { p_user_id: userId, p_scope: scope }))
    .then(({ data, error }) => {
      if (error) throw error;
      if (data && data.length > 0) {
        const row = data[0];
        return { ...row, top_gaps: row.top_gaps || [] } as DefensivePosture;
      }
      return null;
    });

  _postureCache.set(key, { promise, ts: Date.now() });
  // Clean up cache entry after TTL
  promise.catch(() => {}).finally(() => {
    setTimeout(() => {
      const entry = _postureCache.get(key);
      if (entry && entry.promise === promise) _postureCache.delete(key);
    }, POSTURE_CACHE_TTL);
  });

  return promise;
}

/**
 * Hook to fetch user's defensive posture.
 * Safe to call from any number of widgets — requests are deduplicated at the module level.
 */
export function useDefensivePosture(userId: string | null, scope: 'production' | 'all' = 'production') {
  const [posture, setPosture] = useState<DefensivePosture | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const activeRequestRef = useRef(0);

  useEffect(() => {
    if (userId) {
      loadPosture();
    } else {
      setPosture(null);
    }
  }, [userId, scope]);

  async function loadPosture(bustCache = false) {
    if (!userId) return;

    if (bustCache) _postureCache.delete(`${userId}:${scope}`);

    const requestId = ++activeRequestRef.current;
    setLoading(true);
    setError(null);

    try {
      const result = await fetchPostureShared(userId, scope);
      if (requestId !== activeRequestRef.current) return;
      setPosture(result);
    } catch (err) {
      if (requestId !== activeRequestRef.current) return;
      console.error('Failed to load defensive posture:', err);
      setError(toError(err));
    } finally {
      if (requestId === activeRequestRef.current) {
        setLoading(false);
      }
    }
  }

  return { posture, loading, error, refetch: () => loadPosture(true) };
}

/**
 * Hook to fetch all mitigation impacts (for library view)
 */
export function useAllMitigationImpacts() {
  const [mitigations, setMitigations] = useState<MitigationImpact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const activeRequestRef = useRef(0);

  useEffect(() => {
    loadMitigations();
  }, []);

  async function loadMitigations() {
    const requestId = ++activeRequestRef.current;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('v_mitigation_impact')
        .select('*')
        .order('impact_score', { ascending: false });

      if (requestId !== activeRequestRef.current) return;
      if (fetchError) throw fetchError;
      setMitigations(data || []);
    } catch (err) {
      if (requestId !== activeRequestRef.current) return;
      console.error('Failed to load mitigation impacts:', err);
      setError(toError(err));
    } finally {
      if (requestId === activeRequestRef.current) setLoading(false);
    }
  }

  // Stats
  const stats = useMemo(() => {
    if (mitigations.length === 0) return null;
    
    const avgImpact = mitigations.reduce((sum, m) => sum + m.impact_score, 0) / mitigations.length;
    const critical = mitigations.filter(m => m.impact_score >= 90).length;
    const high = mitigations.filter(m => m.impact_score >= 75 && m.impact_score < 90).length;
    
    return {
      total: mitigations.length,
      avgImpact: Math.round(avgImpact),
      critical,
      high
    };
  }, [mitigations]);

  return { mitigations, stats, loading, error, refetch: loadMitigations };
}

/**
 * Hook to fetch all strategy impacts (for library view)
 */
export function useAllStrategyImpacts() {
  const [strategies, setStrategies] = useState<StrategyImpact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const activeRequestRef = useRef(0);

  useEffect(() => {
    loadStrategies();
  }, []);

  async function loadStrategies() {
    const requestId = ++activeRequestRef.current;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('v_strategy_impact')
        .select('*')
        .order('impact_score', { ascending: false });

      if (requestId !== activeRequestRef.current) return;
      if (fetchError) throw fetchError;
      setStrategies(data || []);
    } catch (err) {
      if (requestId !== activeRequestRef.current) return;
      console.error('Failed to load strategy impacts:', err);
      setError(toError(err));
    } finally {
      if (requestId === activeRequestRef.current) setLoading(false);
    }
  }

  // Stats
  const stats = useMemo(() => {
    if (strategies.length === 0) return null;
    
    const avgImpact = strategies.reduce((sum, s) => sum + s.impact_score, 0) / strategies.length;
    const critical = strategies.filter(s => s.impact_score >= 90).length;
    const high = strategies.filter(s => s.impact_score >= 75 && s.impact_score < 90).length;
    
    return {
      total: strategies.length,
      avgImpact: Math.round(avgImpact),
      critical,
      high
    };
  }, [strategies]);

  return { strategies, stats, loading, error, refetch: loadStrategies };
}

/**
 * Module-level request deduplication for threat actor weights.
 */
let _actorsCache: { promise: Promise<ThreatActorWeight[]>; ts: number } | null = null;
const ACTORS_CACHE_TTL = 10000; // 10s — actors change rarely

async function fetchActorsShared(): Promise<ThreatActorWeight[]> {
  if (_actorsCache && Date.now() - _actorsCache.ts < ACTORS_CACHE_TTL) {
    return _actorsCache.promise;
  }

  const promise = Promise.resolve(supabase
    .from('v_threat_actor_weights')
    .select('*')
    .order('taw', { ascending: false })
    .then(({ data, error }) => {
      if (error) throw error;
      return (data || []) as ThreatActorWeight[];
    }));

  _actorsCache = { promise, ts: Date.now() };
  promise.catch(() => {}).finally(() => {
    setTimeout(() => {
      if (_actorsCache?.promise === promise) _actorsCache = null;
    }, ACTORS_CACHE_TTL);
  });

  return promise;
}

/**
 * Hook to fetch threat actor weights.
 * Safe to call from any number of widgets — requests are deduplicated.
 */
export function useThreatActorWeights() {
  const [actors, setActors] = useState<ThreatActorWeight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const activeRequestRef = useRef(0);

  useEffect(() => {
    loadActors();
  }, []);

  async function loadActors(bustCache = false) {
    if (bustCache) _actorsCache = null;

    const requestId = ++activeRequestRef.current;
    setLoading(true);
    setError(null);

    try {
      const result = await fetchActorsShared();
      if (requestId !== activeRequestRef.current) return;
      setActors(result);
    } catch (err) {
      if (requestId !== activeRequestRef.current) return;
      console.error('Failed to load threat actor weights:', err);
      setError(toError(err));
    } finally {
      if (requestId === activeRequestRef.current) setLoading(false);
    }
  }

  return { actors, loading, error, refetch: () => loadActors(true) };
}
