/**
 * Unified Quality Scoring Engine
 *
 * Single source of truth for detection quality scoring.
 * Replaces the two separate, unsynchronized algorithms in:
 * - hooks/useDetectionQuality.ts (live form scoring)
 * - services/bulk-import/types.ts:calculateQualityScore() (bulk import scoring)
 */

import { Detection } from '../../types';

// ============================================
// TYPES
// ============================================

/** The 10 quality scoring dimensions */
export interface QualityWeights {
  query_completeness: number;
  mitre_mapping: number;
  peer_review: number;
  description_quality: number;
  false_positive_guidance: number;
  data_sources: number;
  threat_intel: number;
  test_coverage: number;
  investigation_steps: number;
  references: number;
}

/** Breakdown of scores by dimension */
export interface QualityBreakdown {
  query_completeness: number;
  mitre_mapping: number;
  peer_review: number;
  description_quality: number;
  false_positive_guidance: number;
  data_sources: number;
  threat_intel: number;
  test_coverage: number;
  investigation_steps: number;
  references: number;
}

export type QualityGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface QualityResult {
  score: number;
  grade: QualityGrade;
  label: string;
  breakdown: QualityBreakdown;
}

/** Minimal rule shape for bulk import scoring (avoids importing ParsedRule to prevent circular deps) */
export interface ScoringRuleInput {
  title?: string;
  description?: string;
  query?: string;
  mitreAttackIds?: string[];
  falsePositives?: string[];
  references?: string[];
  dataSources?: string[];
  logsource?: { product?: string; service?: string; category?: string };
  platforms?: string[];
  author?: string;
}

// ============================================
// CONSTANTS
// ============================================

/** Default weights matching the system default scoring profile seed */
export const DEFAULT_WEIGHTS: QualityWeights = {
  query_completeness: 20,
  mitre_mapping: 15,
  peer_review: 15,
  description_quality: 10,
  false_positive_guidance: 10,
  data_sources: 10,
  threat_intel: 5,
  test_coverage: 5,
  investigation_steps: 5,
  references: 5,
};

/** All weight dimension keys in display order */
export const WEIGHT_DIMENSIONS: (keyof QualityWeights)[] = [
  'query_completeness',
  'mitre_mapping',
  'peer_review',
  'description_quality',
  'false_positive_guidance',
  'data_sources',
  'threat_intel',
  'test_coverage',
  'investigation_steps',
  'references',
];

/** Human-readable labels for each dimension */
export const DIMENSION_LABELS: Record<keyof QualityWeights, string> = {
  query_completeness: 'Query Completeness',
  mitre_mapping: 'MITRE ATT&CK Mapping',
  peer_review: 'Peer Review / Validation',
  description_quality: 'Description Quality',
  false_positive_guidance: 'False Positive Guidance',
  data_sources: 'Data Sources',
  threat_intel: 'Threat Intel Links',
  test_coverage: 'Test Coverage',
  investigation_steps: 'Investigation Steps',
  references: 'References',
};

/** Short descriptions for each dimension */
export const DIMENSION_DESCRIPTIONS: Record<keyof QualityWeights, string> = {
  query_completeness: 'Detection query length, explanation, and multi-language coverage',
  mitre_mapping: 'Number of MITRE ATT&CK techniques mapped',
  peer_review: 'Whether the detection has been reviewed and validated',
  description_quality: 'Thoroughness of the detection description',
  false_positive_guidance: 'False positive documentation and tuning notes',
  data_sources: 'Log sources and data source specifications',
  threat_intel: 'Links to threat groups, software, and campaigns',
  test_coverage: 'Test cases and validation procedures',
  investigation_steps: 'Response and investigation guidance',
  references: 'External references and documentation links',
};

// ============================================
// GRADE THRESHOLDS (single source of truth)
// ============================================

/** Convert a numeric score (0-100) to a letter grade */
export function scoreToGrade(score: number): QualityGrade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/** Convert a numeric score to a human-readable label */
export function scoreToLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Needs Work';
  return 'Critical';
}

/** Validate that weights sum to 100 */
export function validateWeights(weights: QualityWeights): boolean {
  const sum = WEIGHT_DIMENSIONS.reduce((acc, key) => acc + (weights[key] || 0), 0);
  return sum === 100;
}

/** Get the sum of all weights */
export function weightsSum(weights: QualityWeights): number {
  return WEIGHT_DIMENSIONS.reduce((acc, key) => acc + (weights[key] || 0), 0);
}

// ============================================
// COMPLETION RATIO CALCULATORS
// Each returns a value from 0.0 to 1.0
// ============================================

function queryCompletion(detection: Partial<Detection>): number {
  const primaryQuery = detection.queries?.find(q => q.isPrimary) || detection.queries?.[0];
  const queryLength = primaryQuery?.query?.length || detection.detectionQuery?.length || 0;
  const explanationLength = primaryQuery?.explanation?.length || detection.queryExplanation?.length || 0;

  let ratio = 0;
  // Query itself: 0-0.7
  if (queryLength >= 50) ratio += 0.7;
  else if (queryLength >= 20) ratio += 0.4;
  else if (queryLength > 0) ratio += 0.15;

  // Explanation: 0-0.3
  if (explanationLength >= 50) ratio += 0.3;
  else if (explanationLength >= 20) ratio += 0.15;
  else if (explanationLength > 0) ratio += 0.05;

  return Math.min(ratio, 1);
}

function mitreCompletion(detection: Partial<Detection>): number {
  const count = detection.mitreAttackIds?.length || 0;
  if (count >= 4) return 1;
  if (count >= 2) return 0.7;
  if (count >= 1) return 0.35;
  return 0;
}

function peerReviewCompletion(detection: Partial<Detection>): number {
  return detection.testedAndValidated ? 1 : 0;
}

function descriptionCompletion(detection: Partial<Detection>): number {
  const len = detection.description?.length || 0;
  if (len >= 100) return 1;
  if (len >= 50) return 0.5;
  if (len > 0) return 0.2;
  return 0;
}

function falsePositiveCompletion(detection: Partial<Detection>): number {
  const hasFP = detection.falsePositiveGuidance?.trim()?.length;
  const hasTestCaseFP = detection.testCases?.some(t => t?.toLowerCase().includes('false positive'));
  if (hasFP && (hasFP >= 50)) return 1;
  if (hasFP && hasFP > 0) return 0.5;
  if (hasTestCaseFP) return 0.3;
  return 0;
}

function dataSourceCompletion(detection: Partial<Detection>): number {
  const count = (detection.dataSources?.length || 0) +
    (detection.logSources?.length || 0) +
    (detection.logSource ? 1 : 0);
  if (count >= 3) return 1;
  if (count >= 1) return 0.5;
  return 0;
}

function threatIntelCompletion(detection: Partial<Detection>): number {
  const count =
    (detection.linkedGroups?.length || 0) +
    (detection.linkedSoftware?.length || 0) +
    (detection.linkedCampaigns?.length || 0);
  if (count >= 5) return 1;
  if (count >= 3) return 0.7;
  if (count >= 1) return 0.4;
  return 0;
}

function testCoverageCompletion(detection: Partial<Detection>): number {
  const count = detection.testCases?.filter(t => t?.trim()).length || 0;
  if (count >= 3) return 1;
  if (count >= 1) return 0.5;
  return 0;
}

function investigationStepsCompletion(detection: Partial<Detection>): number {
  const count = detection.investigationSteps?.length || 0;
  if (count >= 3) return 1;
  if (count >= 1) return 0.5;
  return 0;
}

function referencesCompletion(detection: Partial<Detection>): number {
  const count = detection.references?.filter(r => r?.trim()).length || 0;
  if (count >= 3) return 1;
  if (count >= 1) return 0.5;
  return 0;
}

// Map dimensions to their completion calculators
const COMPLETION_CALCULATORS: Record<keyof QualityWeights, (d: Partial<Detection>) => number> = {
  query_completeness: queryCompletion,
  mitre_mapping: mitreCompletion,
  peer_review: peerReviewCompletion,
  description_quality: descriptionCompletion,
  false_positive_guidance: falsePositiveCompletion,
  data_sources: dataSourceCompletion,
  threat_intel: threatIntelCompletion,
  test_coverage: testCoverageCompletion,
  investigation_steps: investigationStepsCompletion,
  references: referencesCompletion,
};

// ============================================
// MAIN SCORING FUNCTIONS
// ============================================

/**
 * Score a detection using configurable weights.
 * Each dimension: completionRatio(0.0-1.0) × weight = earned points.
 */
export function scoreDetection(
  detection: Partial<Detection>,
  weights: QualityWeights = DEFAULT_WEIGHTS
): QualityResult {
  const breakdown = {} as QualityBreakdown;

  for (const dim of WEIGHT_DIMENSIONS) {
    const ratio = COMPLETION_CALCULATORS[dim](detection);
    breakdown[dim] = Math.round(ratio * weights[dim] * 10) / 10; // 1 decimal place
  }

  const score = Math.round(
    WEIGHT_DIMENSIONS.reduce((sum, dim) => sum + breakdown[dim], 0)
  );

  return {
    score,
    grade: scoreToGrade(score),
    label: scoreToLabel(score),
    breakdown,
  };
}

/**
 * Score a parsed rule from bulk import.
 * Maps ParsedRule fields to the same completion calculators.
 */
export function scoreRule(
  rule: ScoringRuleInput,
  weights: QualityWeights = DEFAULT_WEIGHTS
): number {
  // Map rule fields to a Partial<Detection>-like shape
  const pseudo: Partial<Detection> = {
    description: rule.description || '',
    detectionQuery: rule.query || '',
    mitreAttackIds: rule.mitreAttackIds || [],
    references: rule.references || [],
    dataSources: rule.dataSources || [],
    logSource: rule.logsource?.product || rule.logsource?.category || '',
    testCases: [],
    falsePositiveGuidance: rule.falsePositives?.join('; ') || '',
  };

  const result = scoreDetection(pseudo, weights);
  return result.score;
}
