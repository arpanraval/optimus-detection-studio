import { useState, useEffect, useRef } from 'react';
import { computeDirectFeasibility } from '../../../services/directFeasibilityService';
import { computeEffectiveGroupKeys } from '../../../services/directFeasibilityService';
import type { MatchResult } from '../../../services/logSourceDiscovery';
import type { CloudPlatformConfig } from '../../../types/environment';

export interface TacticCount {
  name: string;
  count: number;
}

interface FeasibilityLive {
  /** Number of matched detections */
  matchedCount: number;
  /** Total detections in library */
  totalCount: number;
  /** Unique MITRE technique IDs from matched detections */
  feasibleTechniqueIds: string[];
  /** Total unique techniques across all library detections */
  totalLibraryTechniques: number;
  /** Tactic breakdown from matched detections */
  tacticBreakdown: TacticCount[];
  /** Full match result for downstream consumers */
  matchResult: MatchResult | null;
  /** Effective group keys (selected + implied) */
  effectiveGroupKeys: string[];
  loading: boolean;
  error: string | null;
}

export function useFeasibilityLive(
  selectedGroupKeys: string[],
  customLogSources: string[],
  edrTools: string[],
  cloudPlatforms: CloudPlatformConfig
): FeasibilityLive {
  const [state, setState] = useState<FeasibilityLive>({
    matchedCount: 0,
    totalCount: 0,
    feasibleTechniqueIds: [],
    totalLibraryTechniques: 0,
    tacticBreakdown: [],
    matchResult: null,
    effectiveGroupKeys: [],
    loading: false,
    error: null,
  });

  const abortRef = useRef(0);

  useEffect(() => {
    const effectiveKeys = computeEffectiveGroupKeys(selectedGroupKeys, edrTools, cloudPlatforms);

    if (effectiveKeys.length === 0 && customLogSources.length === 0) {
      setState({
        matchedCount: 0,
        totalCount: 0,
        feasibleTechniqueIds: [],
        totalLibraryTechniques: 0,
        tacticBreakdown: [],
        matchResult: null,
        effectiveGroupKeys: [],
        loading: false,
        error: null,
      });
      return;
    }

    const runId = ++abortRef.current;

    const timeout = setTimeout(async () => {
      setState(prev => ({ ...prev, loading: true, error: null, effectiveGroupKeys: effectiveKeys }));

      try {
        const result = await computeDirectFeasibility(
          selectedGroupKeys,
          customLogSources,
          edrTools,
          cloudPlatforms
        );

        if (runId !== abortRef.current) return;

        setState({
          matchedCount: result.matchedDetections.length,
          totalCount: result.totalLibraryDetections,
          feasibleTechniqueIds: result.feasibleTechniqueIds,
          totalLibraryTechniques: result.totalLibraryTechniques,
          tacticBreakdown: result.tacticBreakdown,
          matchResult: result,
          effectiveGroupKeys: effectiveKeys,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (runId !== abortRef.current) return;
        const msg = err instanceof Error ? err.message : 'Feasibility computation failed';
        setState(prev => ({ ...prev, loading: false, error: msg }));
      }
    }, 500);

    return () => {
      clearTimeout(timeout);
    };
  }, [
    JSON.stringify(selectedGroupKeys),
    JSON.stringify(customLogSources),
    JSON.stringify(edrTools),
    JSON.stringify(cloudPlatforms),
  ]);

  return state;
}
