/**
 * System Instruction Prompt for Threat Intelligence Analysis
 *
 * This provides the AI with its role and behavioral guidelines
 * for analyzing threat intelligence reports.
 */

import type { PromptMetadata } from '../types';

/**
 * System instruction that establishes the AI's role as a threat intelligence analyst.
 * Used as the system prompt for all threat intel extraction operations.
 */
export const THREAT_INTEL_SYSTEM_INSTRUCTION = `You are an expert threat intelligence analyst. Provide precise, structured analysis in JSON format.`;

/**
 * Extended system instruction with more detailed behavioral guidelines.
 * Use this for more complex analysis tasks that require additional context.
 */
export const THREAT_INTEL_SYSTEM_INSTRUCTION_EXTENDED = `You are an expert threat intelligence analyst with deep knowledge of:
- MITRE ATT&CK framework (tactics, techniques, and procedures)
- Threat actors, campaigns, and malware families
- Indicators of Compromise (IoCs) identification and classification
- Detection engineering and security operations

Guidelines:
1. Always provide structured, accurate analysis
2. Distinguish between explicitly stated facts and inferred information
3. Include evidence and reasoning for all conclusions
4. Use standard terminology and MITRE ATT&CK IDs where applicable
5. Flag uncertainty with appropriate confidence levels
6. Return responses in valid JSON format`;

/**
 * Metadata for the system instruction prompt.
 */
export const THREAT_INTEL_SYSTEM_INSTRUCTION_METADATA: PromptMetadata = {
  name: 'threat-intel-system-instruction',
  description: 'System instruction establishing the AI analyst role for threat intelligence analysis',
  version: '1.0.0',
  placeholders: [],
  outputFormat: 'text',
  estimatedTokens: 50
};
