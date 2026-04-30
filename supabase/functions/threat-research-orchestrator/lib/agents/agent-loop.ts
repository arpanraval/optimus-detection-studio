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
import { RunContext, emit } from "../events.ts";
import { callAnthropic, AnthropicMessage, AnthropicContentBlock } from "../llm/anthropic-direct.ts";

export interface AgentLoopConfig<T> {
  agent: ResearchAgent;
  /** Anthropic model id, e.g. claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5. */
  model: string;
  /** Base agent role + output schema. Goes into Anthropic `system`. */
  systemInstruction: string;
  /** Knowledge pack content; embedded in the first user message. */
  knowledgePack: string;
  /** Gemini-format tool declarations; converted to Anthropic shape internally. */
  toolDeclarations: any[];
  iterationCap: number;
  /** AI feature code for Cost Center attribution. */
  feature: string;
  /** Validator that parses final model text into the agent's output type, or returns null. */
  validateFinalOutput: (text: string) => T | null;
}

export interface AgentLoopOutcome<T> {
  success: boolean;
  output: T | null;
  iterations: number;
  reason: string | null;
}

/** Cap individual tool-result payloads so an exuberant search doesn't bloat
 *  the model context. 8 KB is enough for most structured tool responses. */
const TOOL_RESULT_MAX_CHARS = 8000;

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

  await emit(runCtx, { agent: cfg.agent, event_type: 'agent_started', message: `${cfg.agent} loop start` });

  for (let iteration = 1; iteration <= cfg.iterationCap; iteration++) {
    if (!runCtx.budget.canSpendModelCall()) {
      await emit(runCtx, { agent: cfg.agent, event_type: 'agent_failed', message: 'model-call budget exhausted' });
      return { success: false, output: null, iterations: iteration - 1, reason: 'model_budget_exhausted' };
    }
    runCtx.budget.spendModelCall();

    await emit(runCtx, {
      agent: cfg.agent,
      event_type: 'agent_iteration',
      message: `iteration ${iteration}`,
      payload: { iteration },
    });

    const callStart = Date.now();
    let response;
    try {
      response = await callAnthropic(
        { userId: runCtx.userId, feature: cfg.feature, model: cfg.model },
        {
          model: cfg.model,
          systemInstruction: cfg.systemInstruction,
          tools: cfg.toolDeclarations,
          messages,
        },
      );
    } catch (e) {
      const errMsg = (e as Error)?.message ?? String(e);
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_failed',
        message: `anthropic: ${errMsg.slice(0, 300)}`,
        payload: { error: errMsg.slice(0, 800) },
      });
      return { success: false, output: null, iterations: iteration, reason: 'anthropic_failed' };
    }

    if (response.text) {
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_narration',
        narration: response.text,
        duration_ms: Date.now() - callStart,
      });
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
      if (parsed !== null) {
        await emit(runCtx, {
          agent: cfg.agent,
          event_type: 'agent_completed',
          message: `${cfg.agent} succeeded`,
          duration_ms: Date.now() - startedAt,
          payload: { iteration_count: iteration },
        });
        return { success: true, output: parsed, iterations: iteration, reason: null };
      }
      // Output didn't validate — ask for revision.
      messages.push({
        role: 'user',
        content: 'That output did not validate against the required schema. Re-read the schema in the knowledge pack and produce a valid JSON output now (no fences, no commentary outside the JSON).',
      });
      continue;
    }

    // Tool calls → execute each, build matching tool_result blocks (each with
    // tool_use_id matching the assistant's tool_use block id).
    const toolResultBlocks: AnthropicContentBlock[] = [];
    for (const call of response.toolUses) {
      if (!runCtx.budget.canSpendToolCall()) {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: JSON.stringify({ over_budget: true, error: 'tool-call budget exhausted' }),
          is_error: true,
        });
        await emit(runCtx, {
          agent: cfg.agent,
          event_type: 'agent_tool_call',
          message: `${call.name} (over_budget)`,
          payload: { tool: call.name, over_budget: true },
        });
        continue;
      }
      runCtx.budget.spendToolCall();
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_tool_call',
        message: call.name,
        payload: { tool: call.name, args: call.args },
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

  await emit(runCtx, { agent: cfg.agent, event_type: 'agent_failed', message: 'iteration cap reached' });
  return { success: false, output: null, iterations: cfg.iterationCap, reason: 'iteration_cap' };
}
