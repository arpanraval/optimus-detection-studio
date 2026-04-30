// supabase/functions/threat-research-orchestrator/lib/agents/agent-loop.ts
//
// Shared tool-use loop scaffold. Each agent declares a config (model, system
// instruction including its knowledge pack, tool inventory, iteration cap,
// final-output validator); this loop runs the conversation with the existing
// `ai-generate` edge function, executes any tool calls the model requests,
// and emits per-step events for the UI.
//
// The loop intentionally does NOT know about agent semantics — it just drives
// "send → tool calls? execute, repeat. Final output? validate, exit. Cap hit?
// emit failure."

import type { ResearchAgent } from "../types.ts";
import { ToolContext, executeTool } from "../tools/index.ts";
import { RunContext, emit } from "../events.ts";

export interface AgentLoopConfig<T> {
  agent: ResearchAgent;
  model: string;
  /** Concatenated system instruction (base prompt + knowledge pack). */
  systemInstruction: string;
  /** Gemini-format tool declarations the model is allowed to call. */
  toolDeclarations: any[];
  iterationCap: number;
  /** AI feature code for cost-center attribution. */
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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const AI_GENERATE_URL = `${SUPABASE_URL}/functions/v1/ai-generate`;

interface FunctionResponseTurn {
  role: 'function';
  parts: Array<{ functionResponse: { name: string; response: unknown } }>;
}

type Turn =
  | { role: 'user'; parts: Array<{ text: string }> }
  | { role: 'model'; parts: Array<{ text: string }> }
  | FunctionResponseTurn;

export async function runAgentLoop<T>(
  cfg: AgentLoopConfig<T>,
  toolCtx: ToolContext,
  runCtx: RunContext,
  initialUserMessage: string,
): Promise<AgentLoopOutcome<T>> {
  const startedAt = Date.now();
  const history: Turn[] = [
    { role: 'user', parts: [{ text: initialUserMessage }] },
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
    const res = await fetch(AI_GENERATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${runCtx.serviceRoleKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        responseFormat: 'text',
        systemInstruction: cfg.systemInstruction,
        tools: cfg.toolDeclarations,
        history,
        feature: cfg.feature,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_failed',
        message: `ai-generate ${res.status}`,
        payload: { status: res.status, body: errText.slice(0, 500) },
      });
      return { success: false, output: null, iterations: iteration, reason: 'ai_generate_failed' };
    }

    const body = await res.json();
    const text: string = body?.text ?? '';
    const functionCalls: Array<{ name: string; args: Record<string, unknown> }> = body?.functionCalls ?? [];

    if (text) {
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_narration',
        narration: text,
        duration_ms: Date.now() - callStart,
      });
    }

    if (functionCalls.length > 0) {
      // Append the model's turn (it may include narration text).
      history.push({ role: 'model', parts: [{ text }] });

      // Execute tools and append responses.
      const responses: Array<{ functionResponse: { name: string; response: unknown } }> = [];
      for (const call of functionCalls) {
        if (!runCtx.budget.canSpendToolCall()) {
          responses.push({ functionResponse: { name: call.name, response: { over_budget: true, results: [], error: 'tool-call budget exhausted' } } });
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
          responses.push({ functionResponse: { name: call.name, response: result } });
        } catch (e) {
          responses.push({ functionResponse: { name: call.name, response: { error: String(e) } } });
        }
      }
      history.push({ role: 'function', parts: responses });
      continue;
    }

    // No tool calls — try to parse final output.
    const parsed = cfg.validateFinalOutput(text);
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

    // Output didn't validate — push as model turn and ask for revision.
    history.push({ role: 'model', parts: [{ text }] });
    history.push({
      role: 'user',
      parts: [{ text: 'That output did not validate against the required schema. Re-read the output schema in your system instructions and produce a valid JSON output now (no fences, no commentary outside the JSON).' }],
    });
  }

  await emit(runCtx, { agent: cfg.agent, event_type: 'agent_failed', message: 'iteration cap reached' });
  return { success: false, output: null, iterations: cfg.iterationCap, reason: 'iteration_cap' };
}
