// supabase/functions/threat-research-orchestrator/lib/agents/agent-loop.ts
//
// Shared tool-use loop scaffold. All four agents call this with their config.
// The loop drives an Anthropic Messages API conversation directly (not via
// ai-generate, which strips tool_use_id and breaks the round-trip), preserves
// every tool_use_id end-to-end, executes tool calls, and emits per-step events.
//
// Cost Center attribution still flows through the standard `withAiTelemetry`
// helper inside the Anthropic adapter, so spend shows up in /settings/cost-center
// per agent (each agent sets its own feature code).

import type { ResearchAgent } from "../types.ts";
import { ToolContext, executeTool } from "../tools/index.ts";
import { RunContext, emit, consumeBudget } from "../events.ts";
import { callAnthropic, AnthropicMessage, AnthropicContentBlock } from "../llm/anthropic-direct.ts";

/** Discriminated result from a final-output validator. The `reason` lets the
 *  agent loop give the model SPECIFIC feedback on retry instead of a generic
 *  "didn't validate" — which was the single biggest cause of iteration-cap
 *  deaths in v1 (the model retried with the same broken shape because it
 *  couldn't see what was wrong). */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

export interface AgentLoopConfig<T> {
  agent: ResearchAgent;
  /** Anthropic model id, e.g. claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5. */
  model: string;
  /** Base agent role + output schema. Goes into Anthropic `system`. */
  systemInstruction: string;
  /** Knowledge pack content; embedded in the first user message. */
  knowledgePack: string;
  /** Gemini-format tool declarations; converted to Anthropic shape internally.
   *  `readonly` so callers can pass `TOOLS_FOR.research` etc. directly without
   *  the readonly→mutable assignability error. The convertTools step never
   *  mutates this array. */
  toolDeclarations: readonly any[];
  iterationCap: number;
  /** AI feature code for Cost Center attribution. */
  feature: string;
  /** Parses final model text into the agent's output. On failure, returns a
   *  `reason` string that gets fed back to the model on the next iteration
   *  so it can self-correct. */
  validateFinalOutput: (text: string) => ValidationResult<T>;
  /** Optional payload merged into every event this loop emits. Lets callers
   *  (orchestrator handlers, detection-engineer's QA call) attach behaviour_id
   *  / opportunity_id / detection_id so the UI can show per-leaf progress
   *  indicators ("which behaviour is currently being worked on"). */
  contextPayload?: Record<string, unknown>;
}

export interface AgentLoopOutcome<T> {
  success: boolean;
  output: T | null;
  iterations: number;
  reason: string | null;
}

/** Cap individual tool-result payloads so an exuberant search doesn't bloat
 *  the model context. 12 KB lets web_search return 8 Tavily results × ~1.5KB
 *  description each — Microsoft / Unit 42 / DFIR Report posts are 5–10K
 *  words and need real space to be useful, otherwise the Research Agent
 *  falls back to training memory and hallucinates. */
const TOOL_RESULT_MAX_CHARS = 12000;

/** Prepend current-date context to every agent's system prompt. The QA agent
 *  in particular was flagging real Tavily-sourced current-year citations as
 *  "future-dated/hypothetical/fabricated" because its training cutoff
 *  predates the live calendar. Single point of injection — any agent that
 *  goes through runAgentLoop gets the same anchor. */
function buildDateContextHeader(): string {
  const isoDate = new Date().toISOString().slice(0, 10);
  const year = isoDate.slice(0, 4);
  return `The current date is ${isoDate} (calendar year ${year}).
Treat citations, CVE identifiers, blog posts, and advisories from the
current calendar year as normal current events. Do NOT flag content from
${year} as future-dated, hypothetical, or fabricated based on year alone —
your training cutoff is older than the current date. Defer to web_search
results and upstream agent sources for current-year information.`;
}

export async function runAgentLoop<T>(
  cfg: AgentLoopConfig<T>,
  toolCtx: ToolContext,
  runCtx: RunContext,
  initialTaskMessage: string,
): Promise<AgentLoopOutcome<T>> {
  const startedAt = Date.now();

  // First user turn: knowledge pack + the task.
  const messages: AnthropicMessage[] = [
    {
      role: 'user',
      content: `${cfg.knowledgePack}\n\n---\n\n${initialTaskMessage}`,
    },
  ];

  const ctxPayload = cfg.contextPayload ?? {};

  await emit(runCtx, {
    agent: cfg.agent,
    event_type: 'agent_started',
    message: `${cfg.agent} loop start`,
    payload: { ...ctxPayload },
  });

  for (let iteration = 1; iteration <= cfg.iterationCap; iteration++) {
    // Atomic check-and-spend at the session level. If the cap is reached,
    // the RPC returns allowed:false and we exit.
    const modelBudget = await consumeBudget(runCtx, { modelCalls: 1 });
    if (!modelBudget.allowed) {
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_failed',
        message: `model-call budget exhausted: ${modelBudget.reason ?? ''}`,
        payload: { ...ctxPayload, reason: 'model_budget_exhausted' },
      });
      return { success: false, output: null, iterations: iteration - 1, reason: 'model_budget_exhausted' };
    }

    await emit(runCtx, {
      agent: cfg.agent,
      event_type: 'agent_iteration',
      message: `iteration ${iteration}`,
      payload: { ...ctxPayload, iteration },
    });

    const callStart = Date.now();
    let response;
    try {
      response = await callAnthropic(
        { userId: runCtx.userId, feature: cfg.feature, model: cfg.model },
        {
          model: cfg.model,
          // Date context is prepended at the use site rather than baked
          // into each agent's prompt constant, so every agent gets a
          // freshly-resolved ISO date on every call (not deploy time).
          systemInstruction: `${buildDateContextHeader()}\n\n${cfg.systemInstruction}`,
          tools: cfg.toolDeclarations,
          messages,
          // Force deterministic sampling. Default is 1.0 which produced
          // wildly different behaviour lists across runs of the same input.
          // Same-input runs should converge to the same TTP coverage.
          temperature: 0,
        },
      );
    } catch (e) {
      const errMsg = (e as Error)?.message ?? String(e);
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_failed',
        message: `anthropic: ${errMsg.slice(0, 300)}`,
        payload: { ...ctxPayload, error: errMsg.slice(0, 800) },
      });
      return { success: false, output: null, iterations: iteration, reason: 'anthropic_failed' };
    }

    if (response.text) {
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_narration',
        narration: response.text,
        duration_ms: Date.now() - callStart,
        payload: { ...ctxPayload },
      });
    }

    // Record token usage post-call. consumeBudget is called pre-call with
    // modelCalls:1 only (we don't know token counts until the response
    // returns). This second call records the tokens for cost attribution
    // and the soft alarm threshold. Fail-open: budget RPC errors here
    // never block the loop — same posture as the pre-call gate.
    const totalTokens = response.usage.inputTokens + response.usage.outputTokens;
    if (totalTokens > 0) {
      await consumeBudget(runCtx, { tokens: totalTokens });
    }

    // Push the assistant turn into history with FULL content blocks. This is
    // critical: the next call must include the assistant's tool_use blocks
    // (with their ids) immediately before our tool_result blocks, otherwise
    // Anthropic returns 400.
    messages.push({
      role: 'assistant',
      content: response.rawAssistantContent,
    });

    // No tool calls → try to finalise.
    if (response.toolUses.length === 0) {
      const parsed = cfg.validateFinalOutput(response.text);
      if (parsed.ok) {
        await emit(runCtx, {
          agent: cfg.agent,
          event_type: 'agent_completed',
          message: `${cfg.agent} succeeded`,
          duration_ms: Date.now() - startedAt,
          payload: { ...ctxPayload, iteration_count: iteration },
        });
        return { success: true, output: parsed.value, iterations: iteration, reason: null };
      }
      // Output didn't validate — surface the specific reason so the model can
      // fix that exact thing instead of retrying blindly.
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_validation_failed',
        message: parsed.reason.slice(0, 200),
        payload: { ...ctxPayload, iteration, reason: parsed.reason.slice(0, 800) },
      });
      messages.push({
        role: 'user',
        content:
          `Your previous output failed validation: ${parsed.reason}\n\n` +
          `Fix THAT specifically and re-emit the JSON. ` +
          `Output the JSON object directly — no markdown fences, no commentary outside the JSON.`,
      });
      continue;
    }

    // Tool calls → execute each, build matching tool_result blocks (each with
    // tool_use_id matching the assistant's tool_use block id).
    const toolResultBlocks: AnthropicContentBlock[] = [];
    for (const call of response.toolUses) {
      const toolBudget = await consumeBudget(runCtx, { toolCalls: 1 });
      if (!toolBudget.allowed) {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: JSON.stringify({ over_budget: true, error: toolBudget.reason ?? 'tool-call budget exhausted' }),
          is_error: true,
        });
        await emit(runCtx, {
          agent: cfg.agent,
          event_type: 'agent_tool_call',
          message: `${call.name} (over_budget)`,
          payload: { ...ctxPayload, tool: call.name, over_budget: true, reason: toolBudget.reason },
        });
        continue;
      }
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_tool_call',
        message: call.name,
        payload: { ...ctxPayload, tool: call.name, args: call.args },
      });
      try {
        const result = await executeTool(toolCtx, call.name, call.args);
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: JSON.stringify(result).slice(0, TOOL_RESULT_MAX_CHARS),
        });
      } catch (e) {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: JSON.stringify({ error: String(e).slice(0, 500) }),
          is_error: true,
        });
      }
    }

    messages.push({
      role: 'user',
      content: toolResultBlocks,
    });
  }

  await emit(runCtx, {
    agent: cfg.agent,
    event_type: 'agent_failed',
    message: 'iteration cap reached',
    payload: { ...ctxPayload, reason: 'iteration_cap' },
  });
  return { success: false, output: null, iterations: cfg.iterationCap, reason: 'iteration_cap' };
}
