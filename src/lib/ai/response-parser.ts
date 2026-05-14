/**
 * Optimus Prime Response Parser
 * Extracts structured responses from AI output
 */

import { OptimusResponse, DraftData } from '../../types/optimus';
import { Detection, Severity } from '../../types';
import { logger } from '../logger';

// =============================================================================
// OPTIMUS RESPONSE PARSING
// =============================================================================

/**
 * Parse structured Optimus response from AI output
 * Looks for :::OPTIMUS_RESPONSE::: markers
 */
export function parseOptimusResponse(rawText: string): OptimusResponse | null {
  const match = rawText.match(/:::OPTIMUS_RESPONSE:::([\s\S]*?):::END_RESPONSE:::/);

  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim());
      return normalizeOptimusResponse(parsed);
    } catch (e) {
      logger.error('Failed to parse Optimus response:', e);
    }
  }

  return null;
}

/**
 * Normalize an Optimus response, providing defaults for missing fields
 */
function normalizeOptimusResponse(data: any): OptimusResponse {
  return {
    text: data.text || data.summary || '',
    type: data.type || 'text',
    summary: data.summary || '',
    data: data.data || {},
    actions: data.actions || [],
    sources: data.sources || []
  };
}

/**
 * Extract the display text after removing structured response markers
 */
export function extractDisplayText(rawText: string): string {
  // Remove OPTIMUS_RESPONSE blocks
  let text = rawText.replace(/:::OPTIMUS_RESPONSE:::[\s\S]*?:::END_RESPONSE:::/g, '').trim();

  // Remove DRAFT blocks (handled separately)
  text = text.replace(/:::DRAFT_START:::[\s\S]*?:::DRAFT_END:::/g, '').trim();

  return text || '';
}

// =============================================================================
// DRAFT PARSING
// =============================================================================

/**
 * Parse detection draft from AI output
 * Looks for :::DRAFT_START::: markers
 */
export function parseDraft(text: string): { displayText: string; draftData?: Partial<Detection> } {
  const draftMatch = text.match(/:::DRAFT_START:::([\s\S]*?):::DRAFT_END:::/);

  if (draftMatch) {
    try {
      const draftData = JSON.parse(draftMatch[1].trim()) as DraftData;
      const displayText = text.replace(draftMatch[0], '').trim() || "I've drafted the detection rule for you.";

      // Convert to Detection format
      return {
        displayText,
        draftData: {
          name: draftData.name,
          description: draftData.description,
          severity: draftData.severity as Severity,
          mitreAttackIds: draftData.mitreAttackIds || [],
          detectionQuery: draftData.detectionQuery,
          queryLanguage: draftData.queryLanguage,
          logSource: draftData.logSource,
          technology: draftData.technology,
          falsePositiveGuidance: draftData.falsePositiveGuidance,
          dataSources: draftData.dataSources || []
        }
      };
    } catch (e) {
      logger.error('Failed to parse draft JSON:', e);
    }
  }

  return { displayText: text };
}

// =============================================================================
// COMBINED PARSING
// =============================================================================

export interface ParsedAIResponse {
  // The text to display (with markers removed)
  displayText: string;

  // Structured Optimus response (if present)
  structuredResponse?: OptimusResponse;

  // Detection draft (if present)
  draftData?: Partial<Detection>;

  // Whether this is a structured response
  isStructured: boolean;

  // Whether this contains a draft
  hasDraft: boolean;
}

/**
 * Parse a complete AI response, extracting all structured data
 * Handles multiple formats:
 * 1. Clean JSON: { text, visualization?, actions? }
 * 2. Text followed by JSON: "Some text\n{ visualization: {...} }"
 * 3. Legacy markers: :::OPTIMUS_RESPONSE:::...:::END_RESPONSE:::
 */
export function parseAIResponse(rawText: string): ParsedAIResponse {
  const trimmed = rawText.trim().replace(/\r\n/g, '\n');

  // Format 0: JSON in markdown code block (most common from modern LLMs)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const jsonContent = codeBlockMatch[1].trim();
      if (jsonContent.startsWith('{')) {
        const parsed = JSON.parse(jsonContent);
        // Extract text before the code block
        const textBefore = trimmed.slice(0, trimmed.indexOf('```')).trim();
        const displayText = parsed.text || textBefore || '';

        if (parsed.visualization || (parsed.type && parsed.data)) {
          return {
            displayText,
            structuredResponse: {
              text: displayText,
              visualization: parsed.visualization || { type: parsed.type, data: parsed.data },
              type: parsed.visualization?.type || parsed.type,
              summary: displayText,
              data: parsed.visualization?.data || parsed.data,
              actions: parsed.actions,
              sources: parsed.sources ?? [],
            },
            draftData: undefined,
            isStructured: true,
            hasDraft: false
          };
        }
      }
    } catch (e) {
      // Not valid JSON in code block, continue to other formats
    }
  }

  // Format 1: Clean JSON starting with { text: "..." }
  try {
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed);
      if (parsed.text !== undefined) {
        return {
          displayText: parsed.text,
          structuredResponse: parsed.visualization ? {
            text: parsed.text,
            visualization: parsed.visualization,
            type: parsed.visualization.type,
            summary: parsed.text,
            data: parsed.visualization.data,
            actions: parsed.actions,
            sources: parsed.sources ?? [],
          } : undefined,
          draftData: undefined,
          isStructured: !!parsed.visualization,
          hasDraft: false
        };
      }
    }
  } catch (e) {
    // Not valid JSON, continue
  }

  // Format 2: Text followed by JSON block (AI often does this)
  // Find the last JSON object in the text - handles various formatting
  const jsonStartIndex = trimmed.lastIndexOf('\n{');
  if (jsonStartIndex > 0) {
    const textPart = trimmed.slice(0, jsonStartIndex).trim();
    const jsonPart = trimmed.slice(jsonStartIndex).trim();

    try {
      const parsed = JSON.parse(jsonPart);
      const visualization = parsed.visualization || (parsed.type && parsed.data ? parsed : null);

      if (visualization) {
        return {
          displayText: textPart,
          structuredResponse: {
            text: textPart,
            visualization: parsed.visualization || { type: parsed.type, data: parsed.data },
            type: visualization.type || parsed.type,
            summary: textPart,
            data: visualization.data || parsed.data,
            actions: parsed.actions,
            sources: parsed.sources ?? [],
          },
          draftData: undefined,
          isStructured: true,
          hasDraft: false
        };
      }
    } catch (e) {
      // JSON parse failed, continue with text-only
    }
  }

  // Legacy format: :::OPTIMUS_RESPONSE::: markers
  const structuredResponse = parseOptimusResponse(rawText);
  const { displayText, draftData } = parseDraft(rawText);

  // Log when we fall through to legacy/text-only parsing for monitoring
  if (!structuredResponse && trimmed.length > 100 && (trimmed.includes('"type"') || trimmed.includes('"visualization"'))) {
    logger.warn('Response parser: possible structured data fell through to text-only path', {
      length: trimmed.length,
      preview: trimmed.slice(0, 200)
    });
  }

  // If we have a structured response, use its summary as display text
  const finalDisplayText = structuredResponse
    ? (structuredResponse.summary || displayText || extractDisplayText(rawText))
    : (displayText || extractDisplayText(rawText) || rawText);

  return {
    displayText: finalDisplayText,
    structuredResponse: structuredResponse || undefined,
    draftData,
    isStructured: !!structuredResponse,
    hasDraft: !!draftData
  };
}

// =============================================================================
// RESPONSE TYPE DETECTION
// =============================================================================

/**
 * Detect the likely response type from a user query
 * Used to pre-configure UI expectations
 */
export function detectExpectedResponseType(query: string): string {
  const q = query.toLowerCase();

  if (q.includes('coverage') && !q.includes('against') && !q.includes('for ')) {
    return 'coverage_report';
  }

  if (q.includes('coverage against') || q.includes('coverage for') ||
      q.includes('scattered spider') || q.includes('apt29') || q.includes('apt41') ||
      q.match(/g\d{4}/i)) {
    return 'threat_actor';
  }

  if (q.includes('gap') || q.includes('missing') || q.includes('ransomware') ||
      q.includes('prepared for') || q.includes('ready for')) {
    return 'gap_analysis';
  }

  if (q.includes('search') || q.includes('find') || q.includes('show me') ||
      q.includes('list') || q.includes('detections for')) {
    return 'search_results';
  }

  if (q.includes('draft') || q.includes('write') || q.includes('create rule') ||
      q.includes('create detection')) {
    return 'draft';
  }

  if (q.includes('what is') && (q.match(/t\d{4}/i) || q.includes('technique'))) {
    return 'technique_info';
  }

  return 'text';
}

export default {
  parseOptimusResponse,
  parseDraft,
  parseAIResponse,
  extractDisplayText,
  detectExpectedResponseType
};
