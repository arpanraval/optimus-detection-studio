/**
 * Progress Calculator - Multi-phase weighted progress with ETA
 */

import { ImportJobStatus, ImportProgress } from '../types';

interface PhaseWeight {
  phase: ImportJobStatus;
  weight: number;
}

const PHASE_WEIGHTS: PhaseWeight[] = [
  { phase: 'fetching', weight: 0.35 },
  { phase: 'parsing', weight: 0.22 },
  { phase: 'validating', weight: 0.08 },
  { phase: 'inserting', weight: 0.22 },
  { phase: 'embedding', weight: 0.13 },
];

/**
 * Calculate composite progress percentage across all phases
 */
export function calculateCompositeProgress(progress: ImportProgress): number {
  const { phase } = progress;

  // Find current phase index
  const currentPhaseIndex = PHASE_WEIGHTS.findIndex((p) => p.phase === phase);
  if (currentPhaseIndex === -1) {
    if (phase === 'completed') return 100;
    if (phase === 'preview') {
      // Sum of fetching + parsing + validating weights
      return Math.round((0.40 + 0.25 + 0.10) * 100);
    }
    return 0;
  }

  // Calculate completed phases contribution
  let completedProgress = 0;
  for (let i = 0; i < currentPhaseIndex; i++) {
    completedProgress += PHASE_WEIGHTS[i].weight;
  }

  // Calculate current phase progress
  const currentWeight = PHASE_WEIGHTS[currentPhaseIndex].weight;
  let phaseProgress = 0;

  switch (phase) {
    case 'fetching':
    case 'parsing': {
      const total = Math.max(progress.totalFiles, 1);
      const processed = progress.processedFiles;
      // Use logarithmic scale if total is unknown (totalFiles === processedFiles during fetch)
      if (progress.totalFiles <= 0 || progress.totalFiles === progress.processedFiles) {
        phaseProgress = Math.min(0.9, Math.log10(processed + 1) / 4);
      } else {
        phaseProgress = processed / total;
      }
      break;
    }
    case 'validating':
      phaseProgress = progress.totalRules > 0
        ? (progress.validRules + progress.errorRules + progress.warningRules) / progress.totalRules
        : 0.5;
      break;
    case 'inserting': {
      const totalToInsert = Math.max(progress.totalRules, 1);
      phaseProgress = (progress.insertedRules + progress.failedInserts) / totalToInsert;
      break;
    }
    case 'embedding': {
      const totalEmbed = Math.max(progress.embeddingTotal || 1, 1);
      phaseProgress = ((progress.embeddingGenerated || 0) + (progress.embeddingErrors || 0)) / totalEmbed;
      break;
    }
  }

  const total = completedProgress + currentWeight * Math.min(phaseProgress, 1);
  return Math.min(Math.round(total * 100), 99); // Never show 100% until completed
}

/**
 * Calculate estimated time remaining in seconds
 */
export function calculateETA(progress: ImportProgress): number | null {
  if (!progress.startedAt) return null;

  const elapsed = Date.now() - new Date(progress.startedAt).getTime();
  if (elapsed < 2000) return null; // Need at least 2s of data

  const compositeProgress = calculateCompositeProgress(progress) / 100;
  if (compositeProgress <= 0 || compositeProgress >= 1) return null;

  const estimatedTotal = elapsed / compositeProgress;
  const remaining = estimatedTotal - elapsed;

  return Math.round(remaining / 1000);
}

/**
 * Format seconds into human-readable duration
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Format milliseconds into human-readable duration
 */
export function formatDurationMs(ms: number): string {
  return formatDuration(Math.round(ms / 1000));
}

/**
 * Get display label for current phase
 */
export function getPhaseLabel(phase: ImportJobStatus): string {
  switch (phase) {
    case 'fetching': return 'Fetching files';
    case 'parsing': return 'Parsing rules';
    case 'validating': return 'Validating rules';
    case 'inserting': return 'Importing to database';
    case 'embedding': return 'Generating embeddings';
    case 'completed': return 'Complete';
    case 'failed': return 'Failed';
    case 'cancelled': return 'Cancelled';
    default: return 'Preparing';
  }
}

/**
 * Calculate throughput (rules per second)
 */
export function calculateThroughput(progress: ImportProgress): number | null {
  if (!progress.startedAt || progress.insertedRules === 0) return null;
  const elapsed = (Date.now() - new Date(progress.startedAt).getTime()) / 1000;
  if (elapsed < 1) return null;
  return Math.round((progress.insertedRules / elapsed) * 10) / 10;
}
