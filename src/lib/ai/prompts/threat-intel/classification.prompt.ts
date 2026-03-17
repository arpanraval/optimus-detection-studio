/**
 * Classification Prompt for Threat Intelligence Reports
 *
 * This prompt classifies the type of threat described in the report
 * (APT, Ransomware, Supply Chain, etc.) with confidence assessment.
 */

import type { PromptMetadata, ClassificationPromptParams } from '../types';

/**
 * Template for classifying threat type from threat intel reports.
 *
 * Placeholders:
 * - {{SUMMARY}}: Previously extracted summary as JSON string
 * - {{CONTENT}}: The report content excerpt
 */
export const THREAT_INTEL_CLASSIFICATION_TEMPLATE = `Classify this threat based on the report.

SUMMARY: {{SUMMARY}}

REPORT EXCERPT:
{{CONTENT}}

Return JSON:
{
  "primaryType": "APT|Ransomware|Supply Chain|Phishing|Cryptomining|Botnet|Espionage|Hacktivism|Financial Crime|Zero-Day Exploit|Wiper|Infostealer|RAT|Other|Unknown",
  "secondaryTypes": [],
  "confidence": "high|medium|low",
  "reasoning": "Brief explanation"
}`;

/**
 * Builds the classification prompt with content and summary filled in.
 *
 * @param params - Parameters for building the prompt
 * @returns The complete prompt ready for AI processing
 */
export function buildThreatIntelClassificationPrompt(params: ClassificationPromptParams): string {
  const { content, summary, maxContentLength = 15000 } = params;
  const truncatedContent = content.substring(0, maxContentLength);

  return THREAT_INTEL_CLASSIFICATION_TEMPLATE
    .replace('{{SUMMARY}}', summary)
    .replace('{{CONTENT}}', truncatedContent);
}

/**
 * List of valid attack types for reference.
 */
export const ATTACK_TYPES = [
  'APT',
  'Ransomware',
  'Supply Chain',
  'Phishing',
  'Cryptomining',
  'Botnet',
  'Espionage',
  'Hacktivism',
  'Financial Crime',
  'Zero-Day Exploit',
  'Wiper',
  'Infostealer',
  'RAT',
  'Other',
  'Unknown'
] as const;

/**
 * Metadata for the classification prompt.
 */
export const THREAT_INTEL_CLASSIFICATION_METADATA: PromptMetadata = {
  name: 'threat-intel-classification',
  description: 'Classifies threat type (APT, Ransomware, etc.) with confidence assessment',
  version: '1.0.0',
  placeholders: ['{{SUMMARY}}', '{{CONTENT}}'],
  outputFormat: 'json',
  estimatedTokens: 150
};
