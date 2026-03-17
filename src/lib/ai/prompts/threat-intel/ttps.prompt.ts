/**
 * TTPs Extraction Prompt for Threat Intelligence Reports
 *
 * This prompt extracts MITRE ATT&CK Tactics, Techniques, and Procedures (TTPs)
 * from threat intelligence reports, distinguishing between explicit and
 * contextual/inferred techniques.
 */

import type { PromptMetadata, TTPsPromptParams } from '../types';

/**
 * Template for extracting TTPs from threat intel reports.
 *
 * Placeholders:
 * - {{CONTENT}}: The report content to analyze
 */
export const THREAT_INTEL_TTPS_TEMPLATE = `Extract ALL Tactics, Techniques, and Procedures (TTPs) from this threat report.

REPORT CONTENT:
{{CONTENT}}

For each TTP:
- EXPLICIT: MITRE ID or technique name appears in text
- CONTEXTUAL: Inferred from described behavior

Return JSON:
{
  "ttps": [
    {
      "mitreId": "T1566.001",
      "techniqueName": "Spearphishing Attachment",
      "tacticName": "Initial Access",
      "tacticId": "TA0001",
      "sourceType": "explicit|contextual",
      "confidence": "high|medium|low",
      "evidence": "Quote from report (max 200 chars)",
      "explanation": "Why identified (max 150 chars)",
      "isSubTechnique": true|false,
      "parentTechniqueId": "T1566 (if sub-technique)"
    }
  ]
}

MITRE Tactics:
- Reconnaissance: TA0043
- Resource Development: TA0042
- Initial Access: TA0001
- Execution: TA0002
- Persistence: TA0003
- Privilege Escalation: TA0004
- Defense Evasion: TA0005
- Credential Access: TA0006
- Discovery: TA0007
- Lateral Movement: TA0008
- Collection: TA0009
- Command and Control: TA0011
- Exfiltration: TA0010
- Impact: TA0040`;

/**
 * Builds the TTPs extraction prompt with content filled in.
 *
 * @param params - Parameters for building the prompt
 * @returns The complete prompt ready for AI processing
 */
export function buildThreatIntelTTPsPrompt(params: TTPsPromptParams): string {
  const { content, maxContentLength = 50000 } = params;
  const truncatedContent = content.substring(0, maxContentLength);

  return THREAT_INTEL_TTPS_TEMPLATE.replace('{{CONTENT}}', truncatedContent);
}

/**
 * MITRE ATT&CK Tactics reference for validation.
 */
export const MITRE_TACTICS = {
  'TA0043': 'Reconnaissance',
  'TA0042': 'Resource Development',
  'TA0001': 'Initial Access',
  'TA0002': 'Execution',
  'TA0003': 'Persistence',
  'TA0004': 'Privilege Escalation',
  'TA0005': 'Defense Evasion',
  'TA0006': 'Credential Access',
  'TA0007': 'Discovery',
  'TA0008': 'Lateral Movement',
  'TA0009': 'Collection',
  'TA0011': 'Command and Control',
  'TA0010': 'Exfiltration',
  'TA0040': 'Impact'
} as const;

/**
 * Metadata for the TTPs extraction prompt.
 */
export const THREAT_INTEL_TTPS_METADATA: PromptMetadata = {
  name: 'threat-intel-ttps',
  description: 'Extracts MITRE ATT&CK TTPs with evidence and confidence levels',
  version: '1.0.0',
  placeholders: ['{{CONTENT}}'],
  outputFormat: 'json',
  estimatedTokens: 400
};
