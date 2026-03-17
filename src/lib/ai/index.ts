/**
 * AI Module - Central export for all AI capabilities
 *
 * This module provides a centralized location for AI-related functionality:
 * - prompts/  : Prompt templates for AI interactions
 * - agents/   : (Future) AI agents for complex tasks
 * - skills/   : (Future) Reusable AI skills
 *
 * Usage:
 * ```typescript
 * import { threatIntelPrompts } from '@/lib/ai';
 * const prompt = threatIntelPrompts.buildSummaryPrompt(content);
 * ```
 */

export * from './prompts';
