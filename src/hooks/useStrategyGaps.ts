import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Detection } from '../types';
import { toError } from '../lib/errors';

export interface StrategyGap {
  strategy_stix_id: string;
  strategy_mitre_id: string;
  strategy_name: string;
  strategy_description: string | null;
  technique_stix_id: string;
  technique_mitre_id: string;
  technique_name: string;
  analytic_count: number;
  detection_count: number;
  has_coverage: boolean;
}

export interface TechniqueStrategyGap {
  technique_stix_id: string;
  technique_mitre_id: string;
  technique_name: string;
  total_strategies: number;
  covered_strategies: number;
  uncovered_strategies: number;
  coverage_percent: number;
  strategies: StrategyGap[];
}

export interface GapSummary {
  total_strategies: number;
  covered_strategies: number;
  uncovered_strategies: number;
  coverage_percent: number;
  techniques_with_gaps: number;
  total_techniques_with_strategies: number;
}

// Hook to get strategy coverage gaps
export function useStrategyGaps(detections: Detection[]) {
  const [gaps, setGaps] = useState<StrategyGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Get all technique IDs that have detections
  const coveredTechniqueIds = useMemo(() => {
    const ids = new Set<string>();
    detections.forEach(d => {
      d.mitreAttackIds?.forEach(id => ids.add(id));
    });
    return ids;
  }, [detections]);

  useEffect(() => {
    loadGaps();
  }, []);

  async function loadGaps() {
    setLoading(true);
    setError(null);

    try {
      // Get all strategies with their technique info
      const { data, error: fetchError } = await supabase
        .from('v_mitre_detection_strategies')
        .select('*')
        .order('technique_id', { ascending: true });

      if (fetchError) throw fetchError;

      // Mark which have coverage
      const gapsWithCoverage = (data || []).map((s: any) => ({
        strategy_stix_id: s.stix_id,
        strategy_mitre_id: s.mitre_id,
        strategy_name: s.name,
        strategy_description: s.description,
        technique_stix_id: s.technique_stix_id,
        technique_mitre_id: s.technique_id,
        technique_name: s.technique_name,
        analytic_count: s.analytic_count || 0,
        detection_count: 0, // Will be calculated
        has_coverage: coveredTechniqueIds.has(s.technique_id)
      }));

      setGaps(gapsWithCoverage);
    } catch (err) {
      setError(toError(err));
      console.error('Failed to load strategy gaps:', err);
    } finally {
      setLoading(false);
    }
  }

  // Update coverage when detections change
  useEffect(() => {
    if (gaps.length > 0) {
      const updatedGaps = gaps.map(g => ({
        ...g,
        has_coverage: coveredTechniqueIds.has(g.technique_mitre_id)
      }));
      setGaps(updatedGaps);
    }
  }, [coveredTechniqueIds]);

  // Compute summary
  const summary: GapSummary = useMemo(() => {
    const total = gaps.length;
    const covered = gaps.filter(g => g.has_coverage).length;
    const uncovered = total - covered;
    
    const techniqueMap = new Map<string, { total: number; covered: number }>();
    gaps.forEach(g => {
      const existing = techniqueMap.get(g.technique_mitre_id) || { total: 0, covered: 0 };
      techniqueMap.set(g.technique_mitre_id, {
        total: existing.total + 1,
        covered: existing.covered + (g.has_coverage ? 1 : 0)
      });
    });

    const techniquesWithGaps = Array.from(techniqueMap.values()).filter(t => t.covered < t.total).length;

    return {
      total_strategies: total,
      covered_strategies: covered,
      uncovered_strategies: uncovered,
      coverage_percent: total > 0 ? Math.round((covered / total) * 100) : 0,
      techniques_with_gaps: techniquesWithGaps,
      total_techniques_with_strategies: techniqueMap.size
    };
  }, [gaps]);

  // Group gaps by technique
  const gapsByTechnique: TechniqueStrategyGap[] = useMemo(() => {
    const techniqueMap = new Map<string, TechniqueStrategyGap>();

    gaps.forEach(g => {
      const existing = techniqueMap.get(g.technique_mitre_id);
      if (existing) {
        existing.strategies.push(g);
        existing.total_strategies++;
        if (g.has_coverage) existing.covered_strategies++;
        else existing.uncovered_strategies++;
      } else {
        techniqueMap.set(g.technique_mitre_id, {
          technique_stix_id: g.technique_stix_id,
          technique_mitre_id: g.technique_mitre_id,
          technique_name: g.technique_name,
          total_strategies: 1,
          covered_strategies: g.has_coverage ? 1 : 0,
          uncovered_strategies: g.has_coverage ? 0 : 1,
          coverage_percent: 0,
          strategies: [g]
        });
      }
    });

    // Calculate percentages and sort
    const result = Array.from(techniqueMap.values()).map(t => ({
      ...t,
      coverage_percent: t.total_strategies > 0 
        ? Math.round((t.covered_strategies / t.total_strategies) * 100) 
        : 0
    }));

    // Sort by uncovered count descending (biggest gaps first)
    return result.sort((a, b) => b.uncovered_strategies - a.uncovered_strategies);
  }, [gaps]);

  // Get only uncovered strategies
  const uncoveredGaps = useMemo(() => 
    gaps.filter(g => !g.has_coverage),
  [gaps]);

  return {
    gaps,
    gapsByTechnique,
    uncoveredGaps,
    summary,
    loading,
    error,
    refetch: loadGaps
  };
}

// Hook to get strategy recommendations for a specific entity (group/campaign)
export function useEntityStrategyRecommendations(
  techniqueIds: string[],
  detections: Detection[]
) {
  const [recommendations, setRecommendations] = useState<StrategyGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Get technique IDs that already have detections
  const coveredTechniqueIds = useMemo(() => {
    const ids = new Set<string>();
    detections.forEach(d => {
      d.mitreAttackIds?.forEach(id => ids.add(id));
    });
    return ids;
  }, [detections]);

  useEffect(() => {
    if (techniqueIds.length > 0) {
      loadRecommendations();
    } else {
      setRecommendations([]);
    }
  }, [techniqueIds.join(',')]);

  async function loadRecommendations() {
    if (techniqueIds.length === 0) return;
    
    setLoading(true);
    setError(null);

    try {
      // Get strategies for all techniques used by this entity
      const { data, error: fetchError } = await supabase
        .from('v_mitre_detection_strategies')
        .select('*')
        .in('technique_id', techniqueIds)
        .order('analytic_count', { ascending: false });

      if (fetchError) throw fetchError;

      const mapped = (data || []).map((s: any) => ({
        strategy_stix_id: s.stix_id,
        strategy_mitre_id: s.mitre_id,
        strategy_name: s.name,
        strategy_description: s.description,
        technique_stix_id: s.technique_stix_id,
        technique_mitre_id: s.technique_id,
        technique_name: s.technique_name,
        analytic_count: s.analytic_count || 0,
        detection_count: 0,
        has_coverage: coveredTechniqueIds.has(s.technique_id)
      }));

      setRecommendations(mapped);
    } catch (err) {
      setError(toError(err));
      console.error('Failed to load recommendations:', err);
    } finally {
      setLoading(false);
    }
  }

  // Compute stats
  const stats = useMemo(() => {
    const total = recommendations.length;
    const covered = recommendations.filter(r => r.has_coverage).length;
    const uncovered = total - covered;
    
    // Count unique techniques
    const uniqueTechniques = new Set(recommendations.map(r => r.technique_mitre_id)).size;
    const coveredTechniques = new Set(
      recommendations.filter(r => r.has_coverage).map(r => r.technique_mitre_id)
    ).size;

    return {
      total_strategies: total,
      covered_strategies: covered,
      uncovered_strategies: uncovered,
      coverage_percent: total > 0 ? Math.round((covered / total) * 100) : 0,
      total_techniques: uniqueTechniques,
      covered_techniques: coveredTechniques,
      uncovered_techniques: uniqueTechniques - coveredTechniques
    };
  }, [recommendations]);

  // Get priority recommendations (uncovered, sorted by analytic count)
  const priorityRecommendations = useMemo(() => 
    recommendations
      .filter(r => !r.has_coverage)
      .sort((a, b) => b.analytic_count - a.analytic_count),
  [recommendations]);

  return {
    recommendations,
    priorityRecommendations,
    stats,
    loading,
    error,
    refetch: loadRecommendations
  };
}
