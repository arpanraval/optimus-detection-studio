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
import { callAnthropic } from "../llm/anthropic-direct.ts";
import type {
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicDebugEvent,
} from "../llm/anthropic-direct.ts";

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
  /** Anthropic model id, e.g. claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5.
   *  Callers should resolve this via ROLE_CONFIG from ../llm/model-routing.ts
   *  rather than hardcoding — that file is the single source of truth for
   *  per-role model routing. */
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
  /** Per-call wall-clock ceiling forwarded to the Anthropic adapter. Tuned
   *  per role in ROLE_CONFIG: Opus calls (PLANNER, ENGINEER) get 240s, QA
   *  gets 120s. When unset, the adapter falls back to its 180s default. */
  timeoutMs?: number;
  /** Per-call max_tokens cap. Sized per role in ROLE_CONFIG — Research and
   *  Engineer legitimately use 8K-12K output tokens; QA and revision turns
   *  are <2K. */
  maxTokens?: number;
  /** When true, the agent-loop forwards strict:true on every tool definition
   *  to enable grammar-constrained sampling. Recommended for every reasoning
   *  agent — eliminates the parse/retry loop on tool-call inputs. Default
   *  true; pass false only for debugging non-strict-supported deployments. */
  strictTools?: boolean;
  maxValidationRetries?: number;
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

/** Job-wall-budget safe deadline: the platform kills the edge worker at
 *  ~400s (verified against the reaper's own thresholds — see
 *  20260728120200_threat_research_reaper_platform_ceiling.sql), and this
 *  guard needs margin under that to actually exit cleanly rather than being
 *  killed mid-request. 370s leaves 30s for job-claim overhead, clock skew,
 *  and the emit() call itself before the worker dies. */
const JOB_WALL_BUDGET_SAFE_DEADLINE_MS = 370_000;

/** Minimum remaining runway worth attempting another iteration for. Below
 *  this, refuse outright rather than start a call that has almost no room
 *  to work with. Found via Batch 8 live verification: the guard originally
 *  refused whenever cfg.timeoutMs (the worst-case ceiling for a role, e.g.
 *  340s for DOSSIER's long final-synthesis call) didn't fully fit in the
 *  remaining budget — which fired after ~40s of real elapsed time on every
 *  real session, since most iterations are short tool-calling turns that
 *  never need anywhere near the full ceiling. The fix: shrink THIS call's
 *  timeout to whatever's actually left (see effectiveTimeoutMs below)
 *  instead of refusing whenever the nominal ceiling doesn't fit, and only
 *  refuse when the remaining runway drops below this floor. */
const MIN_USEFUL_CALL_MS = 30_000;

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

function toolNames(toolDeclarations: readonly any[]): string[] {
  const names: string[] = [];
  for (const tool of toolDeclarations) {
    for (const fn of tool?.functionDeclarations ?? []) {
      if (typeof fn?.name === 'string') names.push(fn.name);
    }
  }
  return names;
}

function contentSummary(content: AnthropicMessage['content']): Record<string, unknown> {
  if (typeof content === 'string') {
    return {
      kind: 'string',
      chars: content.length,
      preview: content.slice(0, 120),
    };
  }

  let textChars = 0;
  let toolUseBlocks = 0;
  let toolResultBlocks = 0;
  let toolResultChars = 0;
  const toolResultSizes: number[] = [];
  const toolNamesSeen: string[] = [];

  for (const block of content) {
    if (block.type === 'text') {
      textChars += block.text.length;
    } else if (block.type === 'tool_use') {
      toolUseBlocks++;
      toolNamesSeen.push(block.name);
    } else if (block.type === 'tool_result') {
      toolResultBlocks++;
      toolResultChars += block.content.length;
      toolResultSizes.push(block.content.length);
    }
  }

  return {
    kind: 'blocks',
    blocks: content.length,
    text_chars: textChars,
    tool_use_blocks: toolUseBlocks,
    tool_result_blocks: toolResultBlocks,
    tool_result_chars: toolResultChars,
    tool_result_sizes: toolResultSizes,
    tool_names: toolNamesSeen,
  };
}

function messageSummaries(messages: AnthropicMessage[]): Record<string, unknown>[] {
  return messages.map((m, index) => ({
    index,
    role: m.role,
    ...contentSummary(m.content),
  }));
}

export async function runAgentLoop<T>(
  cfg: AgentLoopConfig<T>,
  toolCtx: ToolContext,
  runCtx: RunContext,
  initialTaskMessage: string,
): Promise<AgentLoopOutcome<T>> {
  const startedAt = Date.now();

  // First user turn: just the task. The knowledge pack used to be inline
  // here, but that broke Opus 4.7's 4096-token cache minimum:
  //   system prompt (~1.5K) + tools (~0.7K) = ~2.2K prefix — under the floor.
  //   Cache writes were silently skipped while Anthropic still charged the
  //   25% write surcharge. Net: ~30% wasted cost on every Opus call.
  // The pack is now in the system block (see callAnthropic below) so the
  // cached prefix reaches ~5K tokens — well above the 4K floor — and
  // subsequent calls within the 5-min TTL pay 0.1x for the prefix.
  const messages: AnthropicMessage[] = [
    {
      role: 'user',
      content: initialTaskMessage,
    },
  ];

  const ctxPayload = cfg.contextPayload ?? {};
  const maxValidationRetries = cfg.maxValidationRetries ?? 1;
  let validationFailures = 0;

  await emit(runCtx, {
    agent: cfg.agent,
    event_type: 'agent_started',
    message: `${cfg.agent} loop start`,
    payload: { ...ctxPayload },
  });

  // Universal exit emitter — fires on every return path of the loop so we
  // can always tell the difference between "loop returned X" and "worker
  // was killed externally". The specific agent_completed / agent_failed
  // events still fire alongside this one (they carry semantically richer
  // payloads); agent_loop_exit is the no-matter-what marker.
  const exitLoop = async (outcome: AgentLoopOutcome<T>): Promise<AgentLoopOutcome<T>> => {
    await emit(runCtx, {
      agent: cfg.agent,
      event_type: 'agent_loop_exit',
      message: outcome.success ? 'loop exit: success' : `loop exit: ${outcome.reason ?? 'unknown'}`,
      duration_ms: Date.now() - startedAt,
      payload: {
        ...ctxPayload,
        success: outcome.success,
        reason: outcome.reason,
        iterations: outcome.iterations,
      },
    });
    return outcome;
  };

  for (let iteration = 1; iteration <= cfg.iterationCap; iteration++) {
    // Job-wall-budget guard. Supabase kills the edge worker at ~400s
    // (platform ceiling, verified against the reaper's own thresholds in
    // 20260728120200_threat_research_reaper_platform_ceiling.sql). Rather
    // than let that happen silently — the exact "worker died mid-loop, no
    // reason recorded" failure the observability events exist to catch —
    // track the real wall-clock remaining since the job was claimed
    // (runCtx.jobStartedAt, which spans the WHOLE worker invocation, not
    // just this loop's own start — a job can call runAgentLoop more than
    // once, e.g. detection generation then a separate QA critique call).
    //
    // This call's ACTUAL timeout shrinks to whatever runway is left rather
    // than refusing outright whenever cfg.timeoutMs (the worst-case ceiling
    // for this role) doesn't fully fit — most iterations are short tool-
    // calling turns that never need anywhere near that ceiling. Only refuse
    // when the remaining runway drops below MIN_USEFUL_CALL_MS.
    let effectiveTimeoutMs = cfg.timeoutMs ?? 180_000;
    if (runCtx.jobStartedAt !== undefined) {
      const jobElapsedMs = Date.now() - runCtx.jobStartedAt;
      const remainingMs = JOB_WALL_BUDGET_SAFE_DEADLINE_MS - jobElapsedMs;
      if (remainingMs < MIN_USEFUL_CALL_MS) {
        await emit(runCtx, {
          agent: cfg.agent,
          event_type: 'agent_failed',
          message: `job_wall_budget: ${Math.round(jobElapsedMs / 1000)}s elapsed since job claim, ` +
            `only ${Math.round(remainingMs / 1000)}s of runway left before the platform's ~400s worker ` +
            `ceiling — exiting cleanly instead of risking a silent kill`,
          payload: { ...ctxPayload, reason: 'job_wall_budget', job_elapsed_ms: jobElapsedMs, iteration },
        });
        return exitLoop({ success: false, output: null, iterations: iteration - 1, reason: 'job_wall_budget' });
      }
      effectiveTimeoutMs = Math.min(effectiveTimeoutMs, remainingMs);
    }

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
      return exitLoop({ success: false, output: null, iterations: iteration - 1, reason: 'model_budget_exhausted' });
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
      // Compose the system block. Order matters for cache prefix size:
      //   date header (small, changes daily — rotation is fine, cache rolls)
      //   ↓
      //   agent system instruction (large, stable per agent)
      //   ↓
      //   knowledge pack (large, stable per agent)
      // Total size for typical agent: ~5K tokens, comfortably above the
      // Opus 4.7 4096-token cache minimum. The pack used to be inline in
      // messages[0] which left the cached prefix under the floor.
      const composedSystem = cfg.knowledgePack
        ? `${buildDateContextHeader()}\n\n${cfg.systemInstruction}\n\n# Knowledge pack\n\n${cfg.knowledgePack}`
        : `${buildDateContextHeader()}\n\n${cfg.systemInstruction}`;
      const strictTools = cfg.strictTools !== false;
      const cacheMode = 'on';
      const callShape = {
        ...ctxPayload,
        iteration,
        model: cfg.model,
        feature: cfg.feature,
        timeout_ms: effectiveTimeoutMs,
        max_tokens: cfg.maxTokens ?? null,
        strict_tools: strictTools,
        cache: cacheMode,
        tool_names: toolNames(cfg.toolDeclarations),
        system_chars: composedSystem.length,
        system_instruction_chars: cfg.systemInstruction.length,
        knowledge_pack_chars: cfg.knowledgePack.length,
        message_count: messages.length,
        messages: messageSummaries(messages),
      };
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_model_call_start',
        message: `model call start iteration ${iteration}`,
        payload: callShape,
      });

      const debugModelCall = async (event: AnthropicDebugEvent): Promise<void> => {
        await emit(runCtx, {
          agent: cfg.agent,
          event_type: 'agent_model_call_debug',
          message: event.stage,
          payload: {
            ...ctxPayload,
            iteration,
            model: cfg.model,
            feature: cfg.feature,
            ...event,
          },
        });
      };

      response = await callAnthropic(
        { userId: runCtx.userId, feature: cfg.feature, model: cfg.model },
        {
          model: cfg.model,
          systemInstruction: composedSystem,
          tools: cfg.toolDeclarations,
          messages,
          // Force deterministic sampling. Default is 1.0 which produced
          // wildly different behaviour lists across runs of the same input.
          // Same-input runs should converge to the same TTP coverage.
          temperature: 0,
          // Default ON: strict tool use guarantees Claude emits inputs that
          // match the tool's input_schema. Callers can opt out by setting
          // cfg.strictTools=false (debugging only).
          strictTools,
          // Default ON: prompt caching of system prompt + tools array. The
          // adapter uses a one-hour TTL so later fan-out workers still reuse
          // the stable prefix.
          cache: cacheMode,
          // Per-role ceiling (model-routing.ts), shrunk to whatever
          // job-wall-budget runway remains (see the guard above) so a late
          // iteration can't itself overrun the platform's ~400s kill.
          timeoutMs: effectiveTimeoutMs,
          maxTokens: cfg.maxTokens,
          debug: debugModelCall,
        },
      );
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_model_call_returned',
        message: `model call returned iteration ${iteration}`,
        duration_ms: Date.now() - callStart,
        payload: {
          ...ctxPayload,
          iteration,
          model: cfg.model,
          text_length: response.text.length,
          tool_uses_count: response.toolUses.length,
          tool_use_names: response.toolUses.map(t => t.name),
          raw_content_blocks: response.rawAssistantContent.length,
          input_tokens: response.usage.inputTokens,
          output_tokens: response.usage.outputTokens,
          cached_input_tokens: response.usage.cachedInputTokens,
          cache_creation_input_tokens: response.usage.cacheCreationInputTokens,
        },
      });
    } catch (e) {
      const errMsg = (e as Error)?.message ?? String(e);
      // Try to extract a clean reason from Anthropic's JSON error body.
      // Adapter formats errors as "Anthropic <status>: <body>". When the
      // body is JSON we surface error.type + error.message in the activity
      // console message instead of the raw blob. Full raw error stays in
      // payload.error for forensics. Falls back to the raw error string
      // if parsing fails — never throw from the error-handling path.
      let cleanMessage = errMsg.slice(0, 300);
      let parsedType: string | null = null;
      let parsedReason: string | null = null;
      const httpMatch = errMsg.match(/Anthropic (\d{3}):\s*(\{[\s\S]*)/);
      if (httpMatch) {
        const status = httpMatch[1];
        try {
          const body = JSON.parse(httpMatch[2]);
          parsedType = body?.error?.type ?? null;
          parsedReason = body?.error?.message ?? null;
          if (parsedReason) {
            cleanMessage = `Anthropic ${status} ${parsedType ?? 'error'}: ${parsedReason}`.slice(0, 300);
          }
        } catch {
          // Body wasn't JSON; leave cleanMessage as the truncated raw error.
        }
      } else if (errMsg.startsWith('Anthropic call timed out')) {
        cleanMessage = errMsg;
      }
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_failed',
        message: cleanMessage,
        payload: {
          ...ctxPayload,
          error: errMsg.slice(0, 800),
          error_type: parsedType,
          error_reason: parsedReason,
        },
      });
      return exitLoop({ success: false, output: null, iterations: iteration, reason: 'anthropic_failed' });
    }

    // Visibility: every Anthropic response gets an event regardless of
    // whether it contained text. Without this we cannot tell apart "model
    // returned tool_uses only" from "worker died after call". Captures
    // enough shape info to diagnose without the full body.
    await emit(runCtx, {
      agent: cfg.agent,
      event_type: 'agent_response_received',
      duration_ms: Date.now() - callStart,
      payload: {
        ...ctxPayload,
        iteration,
        text_length: response.text.length,
        text_preview: response.text.slice(0, 500),
        tool_uses_count: response.toolUses.length,
        tool_use_names: response.toolUses.map(t => t.name),
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
        cached_input_tokens: response.usage.cachedInputTokens,
      },
    });
    await emit(runCtx, {
      agent: cfg.agent,
      event_type: 'agent_post_response_checkpoint',
      message: 'response event persisted',
      duration_ms: Date.now() - callStart,
      payload: { ...ctxPayload, iteration, checkpoint: 'response_event_persisted' },
    });

    if (response.text) {
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_narration',
        narration: response.text,
        duration_ms: Date.now() - callStart,
        payload: { ...ctxPayload },
      });
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_post_response_checkpoint',
        message: 'narration persisted',
        duration_ms: Date.now() - callStart,
        payload: {
          ...ctxPayload,
          iteration,
          checkpoint: 'narration_persisted',
          text_length: response.text.length,
        },
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
    await emit(runCtx, {
      agent: cfg.agent,
      event_type: 'agent_post_response_checkpoint',
      message: 'token budget recorded',
      duration_ms: Date.now() - callStart,
      payload: {
        ...ctxPayload,
        iteration,
        checkpoint: 'token_budget_recorded',
        total_tokens: totalTokens,
      },
    });

    // Push the assistant turn into history with FULL content blocks. This is
    // critical: the next call must include the assistant's tool_use blocks
    // (with their ids) immediately before our tool_result blocks, otherwise
    // Anthropic returns 400.
    messages.push({
      role: 'assistant',
      content: response.rawAssistantContent,
    });
    await emit(runCtx, {
      agent: cfg.agent,
      event_type: 'agent_post_response_checkpoint',
      message: 'assistant message appended',
      duration_ms: Date.now() - callStart,
      payload: {
        ...ctxPayload,
        iteration,
        checkpoint: 'assistant_message_appended',
        message_count: messages.length,
        assistant_content: contentSummary(response.rawAssistantContent),
      },
    });

    // No tool calls → try to finalise.
    if (response.toolUses.length === 0) {
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_post_response_checkpoint',
        message: 'validation starting',
        duration_ms: Date.now() - callStart,
        payload: {
          ...ctxPayload,
          iteration,
          checkpoint: 'validation_start',
          text_length: response.text.length,
        },
      });
      const parsed = cfg.validateFinalOutput(response.text);
      if (parsed.ok) {
        await emit(runCtx, {
          agent: cfg.agent,
          event_type: 'agent_post_response_checkpoint',
          message: 'validation passed',
          duration_ms: Date.now() - callStart,
          payload: { ...ctxPayload, iteration, checkpoint: 'validation_passed' },
        });
        await emit(runCtx, {
          agent: cfg.agent,
          event_type: 'agent_completed',
          message: `${cfg.agent} succeeded`,
          duration_ms: Date.now() - startedAt,
          payload: { ...ctxPayload, iteration_count: iteration },
        });
        return exitLoop({ success: true, output: parsed.value, iterations: iteration, reason: null });
      }
      // Output didn't validate — surface the specific reason so the model can
      // fix that exact thing instead of retrying blindly.
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_validation_failed',
        message: parsed.reason.slice(0, 200),
        payload: {
          ...ctxPayload,
          iteration,
          reason: parsed.reason.slice(0, 800),
          validation_failures: validationFailures + 1,
          max_validation_retries: maxValidationRetries,
        },
      });
      validationFailures++;
      // Keep retries small. The failed assistant output can be 15-25K chars;
      // carrying it into the next request caused 15K+ input-token retries and
      // pushed edge workers back into timeout territory. The model only needs
      // the validator's exact reason, not its whole invalid JSON.
      messages[messages.length - 1] = {
        role: 'assistant',
        content: `[invalid JSON output omitted: ${response.text.length} chars; validation failed]`,
      };
      await emit(runCtx, {
        agent: cfg.agent,
        event_type: 'agent_post_response_checkpoint',
        message: 'validation failed',
        duration_ms: Date.now() - callStart,
        payload: {
          ...ctxPayload,
          iteration,
          checkpoint: 'validation_failed',
          reason: parsed.reason.slice(0, 800),
          validation_failures: validationFailures,
          max_validation_retries: maxValidationRetries,
        },
      });
      if (validationFailures > maxValidationRetries) {
        await emit(runCtx, {
          agent: cfg.agent,
          event_type: 'agent_failed',
          message: `validation failed: ${parsed.reason.slice(0, 220)}`,
          duration_ms: Date.now() - startedAt,
          payload: {
            ...ctxPayload,
            reason: 'validation_failed',
            validation_reason: parsed.reason.slice(0, 800),
            validation_failures: validationFailures,
            max_validation_retries: maxValidationRetries,
          },
        });
        return exitLoop({ success: false, output: null, iterations: iteration, reason: 'validation_failed' });
      }
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
    const toolResultBlocks: Extract<AnthropicContentBlock, { type: 'tool_result' }>[] = [];
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
        const resultText = JSON.stringify(result).slice(0, TOOL_RESULT_MAX_CHARS);
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: resultText,
        });
        await emit(runCtx, {
          agent: cfg.agent,
          event_type: 'agent_post_response_checkpoint',
          message: `tool result ready: ${call.name}`,
          duration_ms: Date.now() - callStart,
          payload: {
            ...ctxPayload,
            iteration,
            checkpoint: 'tool_result_ready',
            tool: call.name,
            tool_result_chars: resultText.length,
          },
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
    await emit(runCtx, {
      agent: cfg.agent,
      event_type: 'agent_post_response_checkpoint',
      message: 'tool results appended',
      duration_ms: Date.now() - callStart,
      payload: {
        ...ctxPayload,
        iteration,
        checkpoint: 'tool_results_appended',
        message_count: messages.length,
        tool_result_count: toolResultBlocks.length,
        tool_result_chars: toolResultBlocks.reduce((sum, block) => sum + block.content.length, 0),
      },
    });
  }

  await emit(runCtx, {
    agent: cfg.agent,
    event_type: 'agent_failed',
    message: 'iteration cap reached',
    payload: { ...ctxPayload, reason: 'iteration_cap' },
  });
  return exitLoop({ success: false, output: null, iterations: cfg.iterationCap, reason: 'iteration_cap' });
}
