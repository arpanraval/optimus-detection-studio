import { logger } from './logger';
import { supabase } from './supabaseClient';
import type {
  DigestReportRequest,
  DigestReportResponse,
  RetrySectionType,
  ThreatReport,
} from '../types/threatIntel';
import { getAllThreatIntelPromptTemplates } from './ai/prompts/threat-intel';

// ============================================================================
// Retry / Timeout Utility
// ============================================================================

async function withRetry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 3, baseDelay = 1000, timeout = 30000 }: { maxAttempts?: number; baseDelay?: number; timeout?: number } = {}
): Promise<T> {
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
      // Don't retry on auth errors or validation errors
      const message = err instanceof Error ? err.message : '';
      if (message.includes('unauthorized') || message.includes('invalid') || message.includes('not found')) {
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
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
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
  // OpenAI models
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    provider: 'openai',
    description: 'Flagship model with reasoning',
    capabilities: { chat: true, tools: true, json: true }
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    provider: 'openai',
    description: 'Balanced performance and cost',
    capabilities: { chat: true, tools: true, json: true }
  },
  {
    id: 'gpt-5-nano',
    name: 'GPT-5 Nano',
    provider: 'openai',
    description: 'Fast and affordable',
    capabilities: { chat: true, tools: true, json: true }
  },
  // Anthropic models
  {
    id: 'claude-opus-4-5-20251101',
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    description: 'Most intelligent, best for coding & agents',
    capabilities: { chat: true, tools: true, json: true }
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    description: 'Balanced intelligence and speed',
    capabilities: { chat: true, tools: true, json: true }
  },
  {
    id: 'claude-haiku-4-5-20251001',
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
}

export interface AIChatOptions {
  prompt?: string;
  model?: string;
  responseFormat?: 'json' | 'text';
  systemInstruction?: string;
  tools?: any[];
  history?: Array<{ role: string; parts: Array<{ text: string }> }>;
  functionResponses?: Array<{ id: string; name: string; response: any }>;
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
  const { prompt, model = DEFAULT_MODEL, responseFormat = 'json' } = options;

  return withRetry(async () => {
    const { data, error } = await supabase.functions.invoke('ai-generate', {
      body: { prompt, model, responseFormat }
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
    functionResponses
  } = options;

  return withRetry(async () => {
    const { data, error } = await supabase.functions.invoke('ai-generate', {
      body: {
        prompt,
        model,
        responseFormat,
        systemInstruction,
        tools,
        history,
        functionResponses
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

  let text = response.text.trim();

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, '');
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    logger.error('Failed to parse AI JSON response:', response.text);
    throw new Error('Failed to parse AI response as JSON');
  }
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

