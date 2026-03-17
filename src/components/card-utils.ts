// ============================================================================
// CARD UTILITIES
// Shared utilities for UseCaseCard and UseCaseListItem components
// Updated to match Detection Studio Design System colors
// ============================================================================

import { Severity, DetectionSource } from '../types';

/**
 * Design System Color Reference:
 * - Sage Green: #4D7C6F (Production, Low severity, Active, Data Sources)
 * - Sky Blue: #0284C7 (Testing, Campaigns, Quality 60-79)
 * - Brick Red: #A63D40 (Critical, Deprecated, Threat Groups, Quality <40)
 * - Orange: orange-500 (High severity, Software, Quality 40-59)
 * - Yellow: yellow-500 (Medium severity, Warning, Pending)
 * - Purple: purple-500 (Techniques, Development, Tags)
 * - Magenta: #783264 (Primary, Tactics, Detection Strategies)
 * - Emerald: emerald-500 (Mitigations)
 */

// Source badge configuration - aligned with DS colors
export const sourceConfig: Record<DetectionSource | string, { label: string; className: string }> = {
  sigmahq: {
    label: 'SigmaHQ',
    className: 'bg-[#0284C7]/15 text-[#0284C7] border border-[#0284C7]/20' // Sky Blue
  },
  splunk_escu: {
    label: 'Splunk ESCU',
    className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/20'
  },
  elastic: {
    label: 'Elastic',
    className: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20'
  },
  chronicle: {
    label: 'Chronicle',
    className: 'bg-[#4D7C6F]/15 text-[#4D7C6F] border border-[#4D7C6F]/20' // Sage Green
  },
  microsoft: {
    label: 'Defender',
    className: 'bg-[#0284C7]/15 text-[#0284C7] border border-[#0284C7]/20' // Sky Blue
  },
  community: {
    label: 'Community',
    className: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20'
  },
  custom: {
    label: 'Custom',
    className: 'bg-surface-container-highest text-on-surface-variant border border-outline-variant/20'
  },
};

// Detection type configuration - aligned with DS colors
export const detectionTypeConfig: Record<string, { label: string; className: string }> = {
  'Detection': {
    label: 'Detection',
    className: 'bg-[#783264]/15 text-[#783264] border border-[#783264]/20' // Primary Magenta
  },
  'Threat Hunting': {
    label: 'Hunting',
    className: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20'
  },
  'Correlation': {
    label: 'Correlation',
    className: 'bg-[#0284C7]/15 text-[#0284C7] border border-[#0284C7]/20' // Sky Blue
  },
  'Anomaly': {
    label: 'Anomaly',
    className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/20'
  },
};

/**
 * Severity color mapping - Design System colors
 * - Critical: Brick Red #A63D40
 * - High: Orange
 * - Medium: Yellow
 * - Low: Sage Green #4D7C6F
 * - Informational: Surface Gray
 */
export const getSeverityColor = (severity: Severity | string): { text: string; bg: string; dot: string } => {
  switch (severity) {
    case Severity.Critical:
    case 'Critical':
      return { text: 'text-[#A63D40]', bg: 'bg-[#A63D40]', dot: 'bg-[#A63D40]' };
    case Severity.High:
    case 'High':
      return { text: 'text-orange-500', bg: 'bg-orange-500', dot: 'bg-orange-500' };
    case Severity.Medium:
    case 'Medium':
      return { text: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500', dot: 'bg-yellow-500' };
    case Severity.Low:
    case 'Low':
      return { text: 'text-[#4D7C6F]', bg: 'bg-[#4D7C6F]', dot: 'bg-[#4D7C6F]' };
    default:
      return { text: 'text-on-surface-variant', bg: 'bg-on-surface-variant', dot: 'bg-surface-container-highest' };
  }
};

/**
 * Quality score color mapping - Design System colors
 * - 80+: Sage Green #4D7C6F
 * - 60-79: Sky Blue #0284C7
 * - 40-59: Orange #D97706
 * - <40: Brick Red #A63D40
 */
export const getScoreColor = (score: number): { stroke: string; text: string; hex: string } => {
  if (score >= 80) return { stroke: 'stroke-[#4D7C6F]', text: 'text-[#4D7C6F]', hex: '#4D7C6F' };
  if (score >= 60) return { stroke: 'stroke-[#0284C7]', text: 'text-[#0284C7]', hex: '#0284C7' };
  if (score >= 40) return { stroke: 'stroke-orange-500', text: 'text-orange-500', hex: '#F97316' };
  return { stroke: 'stroke-[#A63D40]', text: 'text-[#A63D40]', hex: '#A63D40' };
};

// Format relative date
export const formatRelativeDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
