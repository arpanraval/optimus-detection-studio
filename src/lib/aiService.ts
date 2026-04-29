import { logger } from './logger';
import { supabase } from './supabaseClient';
import type {
  DigestReportRequest,
  DigestReportResponse,
  RetrySectionType,
  ThreatReport,
} from '../types/threatIntel';
import { getAllThreatIntelPromptTemplates } from './ai/prompts/threat-intel';
import type { AiFeatureCode } from './ai/featureCodes';

// ============================================================================
// Retry / Timeout Utility
// ============================================================================

async function withRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 3, baseDelay = 1000, timeout = 120_000 }: { maxAttempts?: number; baseDelay?: number; timeout?: number } = {}
): Promise<T> {
  // Per-attempt timeout was 30s — too tight for chat flows running large prompts
  // through Claude Opus / GPT-5.4 (35–60s is normal for AI Query Generator).
  // Bumped to 120s. Edge function default limit is 300s, so 3 attempts at 120s
  // + backoff still fits inside the platform budget.
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out')), timeout)
        ),
      ]);
      return result;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const message = err instanceof Error ? err.message : '';
      // Don't retry: auth/validation errors are permanent; timeouts mean the
      // request was slow, not transient — retrying just makes the user wait
      // another timeout window before the same failure.
      if (
        message.includes('unauthorized') ||
        message.includes('invalid') ||
        message.includes('not found') ||
        message.includes('timed out')
      ) {
        throw err;
      }
      // Exponential backoff: 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, attempt - 1)));
    }
  }
  throw new Error('Retry failed'); // unreachable but satisfies TS
}

// ============================================================================
// Provider and Model Configuration
// ============================================================================

export type LLMProvider = 'google' | 'openai' | 'anthropic';

export interface LLMModel {
  id: string;
  name: string;
  provider: LLMProvider;
  description: string;
  capabilities: {
    chat: boolean;
    tools: boolean;
    json: boolean;
  };
}

// Available models configuration (exact model IDs from documentation)
export const LLM_MODELS: LLMModel[] = [
  // Google Gemini models
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    provider: 'google',
    description: 'Most capable reasoning model, 1M context',
    capabilities: { chat: true, tools: true, json: true }
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: 'google',
    description: 'Fast multimodal with strong reasoning',
    capabilities: { chat: true, tools: true, json: true }
  },
  {
    id: 'gemini-3.1-flash-lite-preview',
    name: 'Gemini 3.1 Flash Lite',
    provider: 'google',
    description: 'Lightweight and cost-effective',
    capabilities: { chat: true, tools: true, json: true }
  },
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image',
    provider: 'google',
    description: 'Image generation from text prompts',
    capabilities: { chat: true, tools: false, json: false }
  },
  // OpenAI models
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    provider: 'openai',
    description: 'Flagship model with reasoning',
    capabilities: { chat: true, tools: true, json: true }
  },
  {
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    provider: 'openai',
    description: 'Balanced performance and cost',
    capabilities: { chat: true, tools: true, json: true }
  },
  {
    id: 'gpt-5.4-nano',
    name: 'GPT-5.4 Nano',
    provider: 'openai',
    description: 'Fast and affordable',
    capabilities: { chat: true, tools: true, json: true }
  },
  // Anthropic models
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    description: 'Most intelligent, best for coding & agents',
    capabilities: { chat: true, tools: true, json: true }
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    description: 'Balanced intelligence and speed',
    capabilities: { chat: true, tools: true, json: true }
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    description: 'Fast and cost-effective',
    capabilities: { chat: true, tools: true, json: true }
  }
];

// Helper to get model by ID
export function getModelById(modelId: string): LLMModel | undefined {
  return LLM_MODELS.find(m => m.id === modelId);
}

// Helper to get models by provider
export function getModelsByProvider(provider: LLMProvider): LLMModel[] {
  return LLM_MODELS.filter(m => m.provider === provider);
}

// Get default model
export const DEFAULT_MODEL = 'gemini-3-flash-preview';

// ============================================================================
// AI Service Interfaces
// ============================================================================

export interface AIGenerateOptions {
  prompt: string;
  model?: string;
  responseFormat?: 'json' | 'text';
  /** GenAI Cost Center feature code for usage attribution. Server defaults to 'unknown'. */
  feature?: AiFeatureCode;
}

export interface AIChatOptions {
  prompt?: string;
  model?: string;
  responseFormat?: 'json' | 'text';
  systemInstruction?: string;
  tools?: any[];
  history?: Array<{ role: string; parts: Array<{ text: string }> }>;
  functionResponses?: Array<{ id: string; name: string; response: any }>;
  /** GenAI Cost Center feature code for usage attribution. Server defaults to 'unknown'. */
  feature?: AiFeatureCode;
}

export interface AIFunctionCall {
  name: string;
  args: Record<string, any>;
}

export interface AIGenerateResponse {
  text: string;
  functionCalls?: AIFunctionCall[];
}

/**
 * Calls the AI generate edge function.
 * All AI API calls should go through this service to keep API keys secure on the backend.
 */
export async function generateAIContent(options: AIGenerateOptions): Promise<AIGenerateResponse> {
  const { prompt, model = DEFAULT_MODEL, responseFormat = 'json', feature } = options;

  if (import.meta.env.DEV && !feature) {
    logger.warn('[aiService] generateAIContent missing feature tag — will be classified as "unknown" in the Cost Center.');
  }

  return withRetry(async () => {
    const { data, error } = await supabase.functions.invoke('ai-generate', {
      body: { prompt, model, responseFormat, feature }
    });

    if (error) {
      logger.error('AI generation error:', error);
      throw new Error(error.message || 'AI generation failed');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return { text: data?.text || '', functionCalls: data?.functionCalls };
  });
}

/**
 * Calls the AI generate edge function with chat mode support.
 * Supports system instructions, tools/function calling, and conversation history.
 */
export async function generateAIChat(options: AIChatOptions): Promise<AIGenerateResponse> {
  const {
    prompt,
    model = DEFAULT_MODEL,
    responseFormat = 'text',
    systemInstruction,
    tools,
    history,
    functionResponses,
    feature
  } = options;

  if (import.meta.env.DEV && !feature) {
    logger.warn('[aiService] generateAIChat missing feature tag — will be classified as "unknown" in the Cost Center.');
  }

  return withRetry(async () => {
    const { data, error } = await supabase.functions.invoke('ai-generate', {
      body: {
        prompt,
        model,
        responseFormat,
        systemInstruction,
        tools,
        history,
        functionResponses,
        feature
      }
    });

    if (error) {
      logger.error('AI chat error:', error);
      throw new Error(error.message || 'AI chat failed');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return {
      text: data?.text || '',
      functionCalls: data?.functionCalls
    };
  });
}

/**
 * Helper to parse JSON response from AI.
 * Returns the parsed object or throws an error.
 */
export async function generateAIJSON<T>(options: Omit<AIGenerateOptions, 'responseFormat'>): Promise<T> {
  const response = await generateAIContent({ ...options, responseFormat: 'json' });

  const candidate = extractJsonFromResponse(response.text);
  try {
    return JSON.parse(candidate);
  } catch (e) {
    logger.error('Failed to parse AI JSON response:', { raw: response.text, candidate });
    throw new Error('Failed to parse AI response as JSON');
  }
}

/**
 * Pull the first valid-looking JSON object out of a raw model response.
 *
 * Models (especially Claude with no native JSON mode) sometimes wrap their
 * JSON output in prose ("Here is the analysis...") and/or markdown code fences
 * (```json ... ```). The previous implementation only stripped fences when
 * the response *started* with backticks; it failed when there was leading
 * prose. This version handles three cases in order:
 *
 *   1. The whole response is a fenced block ⇒ strip the fences.
 *   2. A fenced JSON block appears anywhere in the response ⇒ extract it.
 *   3. Otherwise scan for the first balanced top-level `{...}` object using
 *      string-aware brace counting (so braces inside string literals don't
 *      throw off the depth counter).
 *
 * Falls back to the trimmed input if nothing matches; JSON.parse will then
 * surface the original error to the caller.
 */
function extractJsonFromResponse(text: string): string {
  let trimmed = text.trim();

  // Case 1: whole response is fenced
  if (trimmed.startsWith('```')) {
    trimmed = trimmed.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, '').trim();
  }

  // Case 2: fenced JSON block somewhere in the response
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Case 3: extract first balanced top-level object via string-aware brace counting
  const start = trimmed.indexOf('{');
  if (start === -1) return trimmed;

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (ch === '\\') { escapeNext = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }

  return trimmed;
}

// ============================================================================
// Threat Intelligence Digest
// ============================================================================

/**
 * Calls the threat-intel-digest-v2 edge function to analyze a threat report.
 * Extracts TTPs, IoCs, rules, and performs MITRE mapping.
 * Passes prompt templates from lib/ai/prompts/ for customization.
 */
export async function digestThreatReport(options: DigestReportRequest): Promise<DigestReportResponse> {
  // Get prompt templates from lib/ai/prompts/threat-intel
  const promptTemplates = getAllThreatIntelPromptTemplates();

  const { data, error } = await supabase.functions.invoke('threat-intel-digest-v2', {
    body: {
      ...options,
      promptTemplates
    }
  });

  if (error) {
    logger.error('Threat intel digest error:', error);
    throw new Error(error.message || 'Threat intel digest failed');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as DigestReportResponse;
}

/**
 * Retries a specific section of a threat intel report.
 * Only re-extracts the specified section, preserving other data.
 */
export async function retryReportSection(
  existingReport: ThreatReport,
  section: RetrySectionType,
  model?: string
): Promise<DigestReportResponse> {
  // Get prompt templates from lib/ai/prompts/threat-intel
  const promptTemplates = getAllThreatIntelPromptTemplates();

  const { data, error } = await supabase.functions.invoke('threat-intel-digest-v2', {
    body: {
      sourceType: existingReport.sourceType,
      url: existingReport.sourceUrl,
      model: model || DEFAULT_MODEL,
      retrySection: section,
      existingReport: existingReport,
      promptTemplates
    }
  });

  if (error) {
    logger.error(`Retry section "${section}" error:`, error);
    throw new Error(error.message || `Failed to retry ${section}`);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as DigestReportResponse;
}

