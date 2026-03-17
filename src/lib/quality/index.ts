export {
  // Types
  type QualityWeights,
  type QualityBreakdown,
  type QualityGrade,
  type QualityResult,
  type ScoringRuleInput,
  // Constants
  DEFAULT_WEIGHTS,
  WEIGHT_DIMENSIONS,
  DIMENSION_LABELS,
  DIMENSION_DESCRIPTIONS,
  // Functions
  scoreDetection,
  scoreRule,
  scoreToGrade,
  scoreToLabel,
  validateWeights,
  weightsSum,
} from './scoringEngine';
