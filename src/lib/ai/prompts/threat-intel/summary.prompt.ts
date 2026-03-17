/**
 * Summary Extraction Prompt for Threat Intelligence Reports
 *
 * This prompt extracts key metadata and summary information from
 * threat intelligence reports including title, findings, threat level,
 * and targeted entities.
 */

import type { PromptMetadata, SummaryPromptParams } from '../types';

/**
 * Template for extracting report summary from threat intel reports.
 *
 * Placeholders:
 * - {{CONTENT}}: The report content to analyze
 */
export const THREAT_INTEL_SUMMARY_TEMPLATE = `Analyze this threat intelligence report and extract key information.

REPORT CONTENT:
{{CONTENT}}

Return JSON:
{
  "title": "Report title",
  "publishDate": "YYYY-MM-DD or null",
  "author": "Author or null",
  "organization": "Publisher (Microsoft Security, Unit 42, etc.) or null",
  "executiveSummary": "2-3 sentence summary",
  "keyFindings": ["Finding 1", "Finding 2", "Finding 3", "Finding 4", "Finding 5"],
  "threatLevel": "Critical|High|Medium|Low|Informational",
  "targetedIndustries": [],
  "targetedRegions": [],
  "attackTimeline": {
    "firstSeen": "YYYY-MM-DD or null",
    "lastSeen": "YYYY-MM-DD or null",
    "duration": "Duration string or null"
  }
}`;

/**
 * Builds the summary extraction prompt with content filled in.
 *
 * @param params - Parameters for building the prompt
 * @returns The complete prompt ready for AI processing
 */
export function buildThreatIntelSummaryPrompt(params: SummaryPromptParams): string {
  const { content, maxContentLength = 30000 } = params;
  const truncatedContent = content.substring(0, maxContentLength);

  return THREAT_INTEL_SUMMARY_TEMPLATE.replace('{{CONTENT}}', truncatedContent);
}

/**
 * Metadata for the summary extraction prompt.
 */
export const THREAT_INTEL_SUMMARY_METADATA: PromptMetadata = {
  name: 'threat-intel-summary',
  description: 'Extracts title, key findings, threat level, and targeted entities from threat reports',
  version: '1.0.0',
  placeholders: ['{{CONTENT}}'],
  outputFormat: 'json',
  estimatedTokens: 200
};
