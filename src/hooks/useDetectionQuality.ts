/**
 * Hook wrapper around the unified scoring engine.
 * Delegates to lib/quality/scoringEngine for all scoring logic.
 */

import { useCallback } from 'react';
import { Detection } from '../types';
import {
  scoreDetection,
  QualityWeights,
  QualityResult,
  QualityBreakdown,
  QualityGrade,
  DEFAULT_WEIGHTS,
} from '../lib/quality';
import { useScoring } from '../context/ScoringContext';

// Re-export types for backward compatibility
export type { QualityBreakdown, QualityResult, QualityGrade };

export function useDetectionQuality() {
  const { activeWeights } = useScoring();

  const calculateQuality = useCallback(
    (detection: Partial<Detection>, weights?: QualityWeights): QualityResult => {
      return scoreDetection(detection, weights || activeWeights);
    },
    [activeWeights]
  );

  return { calculateQuality };
}
