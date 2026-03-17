/**
 * Threat Intelligence Prompt Templates
 *
 * This module exports all prompt templates for threat intelligence analysis.
 * These prompts are designed to work with the threat-intel-digest edge function.
 *
 * Usage:
 * ```typescript
 * import {
 *   buildThreatIntelSummaryPrompt,
 *   buildThreatIntelTTPsPrompt,
 *   THREAT_INTEL_SYSTEM_INSTRUCTION
 * } from '@/lib/ai/prompts/threat-intel';
 *
 * const summaryPrompt = buildThreatIntelSummaryPrompt({ content: reportContent });
 * ```
 */

// System Instruction
export {
  THREAT_INTEL_SYSTEM_INSTRUCTION,
  THREAT_INTEL_SYSTEM_INSTRUCTION_EXTENDED,
  THREAT_INTEL_SYSTEM_INSTRUCTION_METADATA
} from './system-instruction.prompt';

// Summary Extraction
export {
  THREAT_INTEL_SUMMARY_TEMPLATE,
  buildThreatIntelSummaryPrompt,
  THREAT_INTEL_SUMMARY_METADATA
} from './summary.prompt';

// Classification
export {
  THREAT_INTEL_CLASSIFICATION_TEMPLATE,
  buildThreatIntelClassificationPrompt,
  THREAT_INTEL_CLASSIFICATION_METADATA,
  ATTACK_TYPES
} from './classification.prompt';

// TTPs Extraction
export {
  THREAT_INTEL_TTPS_TEMPLATE,
  buildThreatIntelTTPsPrompt,
  THREAT_INTEL_TTPS_METADATA,
  MITRE_TACTICS
} from './ttps.prompt';

// IoCs and Detection Rules
export {
  THREAT_INTEL_IOCS_AND_RULES_TEMPLATE,
  buildThreatIntelIoCsAndRulesPrompt,
  THREAT_INTEL_IOCS_AND_RULES_METADATA,
  IOC_CATEGORIES,
  DETECTION_QUERY_TYPES
} from './iocs-and-rules.prompt';

// Re-export types for convenience
export type {
  SummaryPromptParams,
  ClassificationPromptParams,
  TTPsPromptParams,
  IoCsAndRulesPromptParams,
  SummaryExtractionResponse,
  ClassificationExtractionResponse,
  TTPExtractionResponse,
  IoCExtractionResponse
} from '../types';

/**
 * Convenience object containing all threat intel prompt templates.
 * Useful when you need to pass all templates at once.
 */
export const threatIntelPromptTemplates = {
  systemInstruction: () => {
    // Lazy import to avoid circular dependencies
    const { THREAT_INTEL_SYSTEM_INSTRUCTION } = require('./system-instruction.prompt');
    return THREAT_INTEL_SYSTEM_INSTRUCTION;
  },
  summary: () => {
    const { THREAT_INTEL_SUMMARY_TEMPLATE } = require('./summary.prompt');
    return THREAT_INTEL_SUMMARY_TEMPLATE;
  },
  classification: () => {
    const { THREAT_INTEL_CLASSIFICATION_TEMPLATE } = require('./classification.prompt');
    return THREAT_INTEL_CLASSIFICATION_TEMPLATE;
  },
  ttps: () => {
    const { THREAT_INTEL_TTPS_TEMPLATE } = require('./ttps.prompt');
    return THREAT_INTEL_TTPS_TEMPLATE;
  },
  iocsAndRules: () => {
    const { THREAT_INTEL_IOCS_AND_RULES_TEMPLATE } = require('./iocs-and-rules.prompt');
    return THREAT_INTEL_IOCS_AND_RULES_TEMPLATE;
  }
};

/**
 * Gets all threat intel prompt templates as a plain object.
 * This is useful for passing templates to edge functions.
 */
export function getAllThreatIntelPromptTemplates() {
  return {
    systemInstruction: THREAT_INTEL_SYSTEM_INSTRUCTION,
    summary: THREAT_INTEL_SUMMARY_TEMPLATE,
    classification: THREAT_INTEL_CLASSIFICATION_TEMPLATE,
    ttps: THREAT_INTEL_TTPS_TEMPLATE,
    iocsAndRules: THREAT_INTEL_IOCS_AND_RULES_TEMPLATE
  };
}

// Import templates for the function above
import { THREAT_INTEL_SYSTEM_INSTRUCTION } from './system-instruction.prompt';
import { THREAT_INTEL_SUMMARY_TEMPLATE } from './summary.prompt';
import { THREAT_INTEL_CLASSIFICATION_TEMPLATE } from './classification.prompt';
import { THREAT_INTEL_TTPS_TEMPLATE } from './ttps.prompt';
import { THREAT_INTEL_IOCS_AND_RULES_TEMPLATE } from './iocs-and-rules.prompt';
