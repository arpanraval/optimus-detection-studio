// supabase/functions/threat-research-orchestrator/lib/agents/checkpoint.ts
//
// Save and restore the agent conversation for one job.
//
// Without this a reaper-reset job restarts from message zero: every tool call
// runs again and every prior turn is regenerated. Session 50a93d11 burned 519
// model calls over 9.5 hours that way; e86db9af spent 959s across three
// research attempts and produced nothing.
//
// The pure decision logic (should we save? may we restore?) is separated from
// the I/O so it can be unit tested without a database — those are the parts
// with the interesting failure modes.

import type { AnthropicMessage } from "../llm/anthropic-direct.ts";
import type { RunContext } from "../events.ts";

/** Bump when the persisted message shape changes. A checkpoint written by a
 *  different version is discarded rather than replayed into code that no
 *  longer understands it. */
export const CHECKPOINT_SCHEMA_VERSION = 1;

/** Refuse to persist conversations larger than this.
 *
 *  A research conversation carries several 12KB-capped tool results plus the
 *  assistant turns between them. 256KB holds a realistic worst case while
 *  staying small enough that the write costs milliseconds inside a worker with
 *  a hard wall-clock budget.
 *
 *  Oversized conversations are SKIPPED, never truncated. A partial message
 *  list would resume into a conversation the model cannot follow — strictly
 *  worse than the honest fallback of starting over, which is what happens
 *  today anyway. */
export const MAX_CHECKPOINT_BYTES = 256 * 1024;

/** How many times one checkpoint may be resumed before the job starts clean.
 *
 *  If the conversation is itself what makes the job fail — a malformed turn, a
 *  tool result the model chokes on — resuming it forever would spend every
 *  retry hitting the same wall. Two resumes, then a fresh start. */
export const MAX_CHECKPOINT_RESTORES = 2;

export interface StoredCheckpoint {
  schema_version: number;
  iteration: number;
  restore_count: number;
  messages: AnthropicMessage[];
}

export interface RestoreDecision {
  restore: boolean;
  /** Why not, when `restore` is false. Emitted so a run's trail explains
   *  whether it resumed, and if not, why. */
  reason?: 'no_checkpoint' | 'schema_mismatch' | 'restore_cap_reached' | 'empty';
}

/** Decide whether a stored checkpoint may be resumed. Pure. */
export function decideRestore(stored: StoredCheckpoint | null): RestoreDecision {
  if (!stored) return { restore: false, reason: 'no_checkpoint' };
  if (stored.schema_version !== CHECKPOINT_SCHEMA_VERSION) {
    return { restore: false, reason: 'schema_mismatch' };
  }
  if (stored.restore_count >= MAX_CHECKPOINT_RESTORES) {
    return { restore: false, reason: 'restore_cap_reached' };
  }
  if (!Array.isArray(stored.messages) || stored.messages.length === 0) {
    return { restore: false, reason: 'empty' };
  }
  return { restore: true };
}

export interface SaveDecision {
  save: boolean;
  bytes: number;
  reason?: 'too_large';
}

/** Decide whether a conversation is small enough to persist. Pure. */
export function decideSave(serialised: string): SaveDecision {
  const bytes = serialised.length;
  if (bytes > MAX_CHECKPOINT_BYTES) return { save: false, bytes, reason: 'too_large' };
  return { save: true, bytes };
}

/** Load and consume a checkpoint for this job.
 *
 *  Increments `restore_count` as part of loading, so the poison guard counts
 *  attempts that actually resumed rather than attempts that merely looked.
 *  Returns null whenever the job should start clean — including on any error,
 *  because a checkpoint failure must never be the reason a run cannot proceed.
 */
export async function loadCheckpoint(
  ctx: RunContext,
): Promise<{ messages: AnthropicMessage[]; iteration: number } | { messages: null; reason: RestoreDecision['reason'] }> {
  if (!ctx.jobId) return { messages: null, reason: 'no_checkpoint' };

  const { data, error } = await ctx.supabase
    .from('threat_research_job_checkpoints')
    .select('schema_version, iteration, restore_count, messages')
    .eq('job_id', ctx.jobId)
    .maybeSingle();

  if (error) {
    console.warn('[checkpoint] load failed:', error.message);
    return { messages: null, reason: 'no_checkpoint' };
  }

  const decision = decideRestore((data as StoredCheckpoint | null) ?? null);
  if (!decision.restore) {
    // A checkpoint we refuse to use is dead weight, and leaving it would let a
    // later attempt reconsider it. Drop it now.
    if (data) await deleteCheckpoint(ctx);
    return { messages: null, reason: decision.reason };
  }

  const stored = data as StoredCheckpoint;
  const { error: bumpErr } = await ctx.supabase
    .from('threat_research_job_checkpoints')
    .update({ restore_count: stored.restore_count + 1, updated_at: new Date().toISOString() })
    .eq('job_id', ctx.jobId);
  if (bumpErr) console.warn('[checkpoint] restore_count bump failed:', bumpErr.message);

  return { messages: stored.messages, iteration: stored.iteration };
}

/** Persist the conversation so far. Best-effort: a failure here costs the
 *  ability to resume, never the run itself. */
export async function saveCheckpoint(
  ctx: RunContext,
  agent: string,
  iteration: number,
  messages: AnthropicMessage[],
): Promise<SaveDecision> {
  if (!ctx.jobId) return { save: false, bytes: 0 };

  const serialised = JSON.stringify(messages);
  const decision = decideSave(serialised);
  if (!decision.save) return decision;

  const { error } = await ctx.supabase
    .from('threat_research_job_checkpoints')
    .upsert({
      job_id: ctx.jobId,
      session_id: ctx.sessionId,
      user_id: ctx.userId,
      agent,
      schema_version: CHECKPOINT_SCHEMA_VERSION,
      iteration,
      messages,
      bytes: decision.bytes,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'job_id' });

  if (error) console.warn('[checkpoint] save failed:', error.message);
  return decision;
}

/** Drop the checkpoint. Called on success, and whenever one is rejected. */
export async function deleteCheckpoint(ctx: RunContext): Promise<void> {
  if (!ctx.jobId) return;
  const { error } = await ctx.supabase
    .from('threat_research_job_checkpoints')
    .delete()
    .eq('job_id', ctx.jobId);
  if (error) console.warn('[checkpoint] delete failed:', error.message);
}
