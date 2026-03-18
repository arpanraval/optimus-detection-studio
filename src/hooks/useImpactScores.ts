import { useState, useEffect, useMemo } from 'react';
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

  useEffect(() => {
    loadMitigations();
  }, [limit]);

  async function loadMitigations() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_top_impact_mitigations', { p_limit: limit });

      if (fetchError) throw fetchError;
      setMitigations(data || []);
    } catch (err) {
      console.error('Failed to load impact mitigations:', err);
      setError(toError(err));
    } finally {
      setLoading(false);
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

  useEffect(() => {
    loadStrategies();
  }, [limit]);

  async function loadStrategies() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_top_impact_strategies', { p_limit: limit });

      if (fetchError) throw fetchError;
      setStrategies(data || []);
    } catch (err) {
      console.error('Failed to load impact strategies:', err);
      setError(toError(err));
    } finally {
      setLoading(false);
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

  useEffect(() => {
    if (mitigationStixId) {
      loadDetail();
    } else {
      setDetail(null);
    }
  }, [mitigationStixId]);

  async function loadDetail() {
    if (!mitigationStixId) return;
    
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_mitigation_impact_detail', { p_mitigation_stix_id: mitigationStixId });

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
      console.error('Failed to load mitigation impact detail:', err);
      setError(toError(err));
    } finally {
      setLoading(false);
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

  useEffect(() => {
    if (strategyStixId) {
      loadDetail();
    } else {
      setDetail(null);
    }
  }, [strategyStixId]);

  async function loadDetail() {
    if (!strategyStixId) return;
    
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_strategy_impact_detail', { p_strategy_stix_id: strategyStixId });

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
      console.error('Failed to load strategy impact detail:', err);
      setError(toError(err));
    } finally {
      setLoading(false);
    }
  }

  return { detail, loading, error, refetch: loadDetail };
}

/**
 * Hook to fetch user's defensive posture
 */
export function useDefensivePosture(userId: string | null, scope: 'production' | 'all' = 'production') {
  const [posture, setPosture] = useState<DefensivePosture | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (userId) {
      loadPosture();
    } else {
      setPosture(null);
    }
  }, [userId, scope]);

  async function loadPosture() {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_defensive_posture', { p_user_id: userId, p_scope: scope });

      if (fetchError) throw fetchError;
      
      if (data && data.length > 0) {
        const row = data[0];
        setPosture({
          ...row,
          top_gaps: row.top_gaps || []
        });
      } else {
        setPosture(null);
      }
    } catch (err) {
      console.error('Failed to load defensive posture:', err);
      setError(toError(err));
    } finally {
      setLoading(false);
    }
  }

  return { posture, loading, error, refetch: loadPosture };
}

/**
 * Hook to fetch all mitigation impacts (for library view)
 */
export function useAllMitigationImpacts() {
  const [mitigations, setMitigations] = useState<MitigationImpact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    loadMitigations();
  }, []);

  async function loadMitigations() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('v_mitigation_impact')
        .select('*')
        .order('impact_score', { ascending: false });

      if (fetchError) throw fetchError;
      setMitigations(data || []);
    } catch (err) {
      console.error('Failed to load mitigation impacts:', err);
      setError(toError(err));
    } finally {
      setLoading(false);
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

  useEffect(() => {
    loadStrategies();
  }, []);

  async function loadStrategies() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('v_strategy_impact')
        .select('*')
        .order('impact_score', { ascending: false });

      if (fetchError) throw fetchError;
      setStrategies(data || []);
    } catch (err) {
      console.error('Failed to load strategy impacts:', err);
      setError(toError(err));
    } finally {
      setLoading(false);
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
 * Hook to fetch threat actor weights
 */
export function useThreatActorWeights() {
  const [actors, setActors] = useState<ThreatActorWeight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    loadActors();
  }, []);

  async function loadActors() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('v_threat_actor_weights')
        .select('*')
        .order('taw', { ascending: false });

      if (fetchError) throw fetchError;
      setActors(data || []);
    } catch (err) {
      console.error('Failed to load threat actor weights:', err);
      setError(toError(err));
    } finally {
      setLoading(false);
    }
  }

  return { actors, loading, error, refetch: loadActors };
}
