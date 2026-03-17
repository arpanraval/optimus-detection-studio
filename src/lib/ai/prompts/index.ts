/**
 * AI Prompts Module
 *
 * Central export for all AI prompt templates organized by domain.
 *
 * Available prompt domains:
 * - threat-intel: Prompts for threat intelligence report analysis
 *
 * Usage:
 * ```typescript
 * import { threatIntel } from '@/lib/ai/prompts';
 *
 * const summaryPrompt = threatIntel.buildThreatIntelSummaryPrompt({
 *   content: reportContent
 * });
 * ```
 */

// Export all threat intel prompts
export * as threatIntel from './threat-intel';

// Export types
export * from './types';

// Re-export commonly used items at the top level for convenience
export {
  // System instruction
  THREAT_INTEL_SYSTEM_INSTRUCTION,

  // Builder functions
  buildThreatIntelSummaryPrompt,
  buildThreatIntelClassificationPrompt,
  buildThreatIntelTTPsPrompt,
  buildThreatIntelIoCsAndRulesPrompt,

  // Templates (for direct access if needed)
  THREAT_INTEL_SUMMARY_TEMPLATE,
  THREAT_INTEL_CLASSIFICATION_TEMPLATE,
  THREAT_INTEL_TTPS_TEMPLATE,
  THREAT_INTEL_IOCS_AND_RULES_TEMPLATE,

  // Utility function
  getAllThreatIntelPromptTemplates,

  // Constants
  MITRE_TACTICS,
  ATTACK_TYPES,
  IOC_CATEGORIES,
  DETECTION_QUERY_TYPES
} from './threat-intel';
