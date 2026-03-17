import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { toError } from '../lib/errors';

export interface DetectionStrategy {
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string | null;
  technique_stix_id: string | null;
  technique_id: string | null;
  technique_name: string | null;
  analytic_count: number;
  domains: string[] | null;
  data: any;
  impact_score?: number; // From v_strategy_impact
}

export interface Analytic {
  stix_id: string;
  mitre_id: string;
  name: string;
  description: string | null;
  platforms: string[] | null;
  log_source_references: any[] | null;
  mutable_elements: any | null;
}

// Get detection strategies for a technique by MITRE ID (e.g., T1059)
export function useTechniqueStrategies(techniqueId: string | null) {
  const [strategies, setStrategies] = useState<DetectionStrategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (techniqueId) {
      loadStrategies(techniqueId);
    } else {
      setStrategies([]);
    }
  }, [techniqueId]);

  async function loadStrategies(mitreId: string) {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_technique_strategies_by_mitre_id', { p_technique_mitre_id: mitreId });

      if (fetchError) throw fetchError;
      
      // Transform the data to match our interface
      const transformed = (data || []).map((d: any) => ({
        stix_id: d.strategy_stix_id,
        mitre_id: d.strategy_mitre_id,
        name: d.strategy_name,
        description: d.strategy_description,
        technique_stix_id: d.technique_stix_id,
        technique_id: d.technique_mitre_id,
        technique_name: d.technique_name,
        analytic_count: d.analytic_count,
        domains: null,
        data: null
      }));
      
      setStrategies(transformed);
    } catch (err) {
      setError(toError(err));
      console.error('Failed to load detection strategies:', err);
    } finally {
      setLoading(false);
    }
  }

  return {
    strategies,
    loading,
    error,
    refetch: () => techniqueId && loadStrategies(techniqueId)
  };
}

// Get analytics for a detection strategy
export function useStrategyAnalytics(strategyStixId: string | null) {
  const [analytics, setAnalytics] = useState<Analytic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (strategyStixId) {
      loadAnalytics(strategyStixId);
    } else {
      setAnalytics([]);
    }
  }, [strategyStixId]);

  async function loadAnalytics(stixId: string) {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_strategy_analytics', { p_strategy_stix_id: stixId });

      if (fetchError) throw fetchError;
      
      const transformed = (data || []).map((d: any) => ({
        stix_id: d.stix_id,
        mitre_id: d.mitre_id,
        name: d.name,
        description: d.description,
        platforms: d.platforms,
        log_source_references: d.log_source_references,
        mutable_elements: d.mutable_elements
      }));
      
      setAnalytics(transformed);
    } catch (err) {
      setError(toError(err));
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  }

  return {
    analytics,
    loading,
    error,
    refetch: () => strategyStixId && loadAnalytics(strategyStixId)
  };
}

// All detection strategies (for a future dedicated page)
export function useDetectionStrategies() {
  const [strategies, setStrategies] = useState<DetectionStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    loadAllStrategies();
  }, []);

  async function loadAllStrategies() {
    setLoading(true);
    setError(null);

    try {
      // Fetch strategies
      const { data: strategyData, error: fetchError } = await supabase
        .from('v_mitre_detection_strategies')
        .select('*')
        .order('name');

      if (fetchError) throw fetchError;

      // Fetch impact scores
      const { data: impactData, error: impactError } = await supabase
        .from('v_strategy_impact')
        .select('stix_id, impact_score');

      // Create impact score map
      const impactMap = new Map<string, number>();
      if (!impactError && impactData) {
        impactData.forEach(item => impactMap.set(item.stix_id, item.impact_score));
      }

      // Merge impact scores into strategies
      const strategiesWithImpact = (strategyData || []).map(s => ({
        ...s,
        impact_score: impactMap.get(s.stix_id) || 0
      }));

      setStrategies(strategiesWithImpact);
    } catch (err) {
      setError(toError(err));
      console.error('Failed to load detection strategies:', err);
    } finally {
      setLoading(false);
    }
  }

  return {
    strategies,
    loading,
    error,
    refetch: loadAllStrategies
  };
}

// All analytics (for a future dedicated page)
export function useAnalytics() {
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    loadAllAnalytics();
  }, []);

  async function loadAllAnalytics() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('v_mitre_analytics_with_strategy')
        .select('*')
        .order('name');

      if (fetchError) throw fetchError;
      setAnalytics(data || []);
    } catch (err) {
      setError(toError(err));
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  }

  return {
    analytics,
    loading,
    error,
    refetch: loadAllAnalytics
  };
}
