// Telemetry-wrapped Anthropic caller for the Threat Research orchestrator.
//
// The pure HTTP adapter lives in `anthropic-raw.ts` (no `_shared` imports so
// the Layer 2 mock-endpoint tests can load it under Bun without dragging
// supabase-js + cost-center into the test harness). This module adds the
// `withAiTelemetry` wrapper that production callers use for AI Cost Center
// attribution.
//
// Existing imports `from "./anthropic-direct.ts"` continue to work via the
// re-exports below.

import { withAiTelemetry } from "../../../_shared/aiTelemetry.ts";
import { callAnthropicRaw } from "./anthropic-raw.ts";
import type { AnthropicCallParams, AnthropicCallResponse } from "./anthropic-raw.ts";

export { callAnthropicRaw, AnthropicError, classifyAnthropicHttpFailure } from "./anthropic-raw.ts";
export type {
  AnthropicCallParams,
  AnthropicCallResponse,
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicDebugEvent,
  AnthropicErrorInfo,
  AnthropicErrorKind,
  ToolUse,
} from "./anthropic-raw.ts";

export async function callAnthropic(
  ctx: { userId: string; feature: string; model: string },
  params: AnthropicCallParams,
): Promise<AnthropicCallResponse> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  return await withAiTelemetry(
    {
      userId: ctx.userId,
      feature: ctx.feature,
      model: ctx.model,
      provider: 'anthropic',
      category: 'llm',
    },
    async () => {
      const out = await callAnthropicRaw(apiKey, params);
      return { result: out, usage: out.usage };
    },
  );
}
