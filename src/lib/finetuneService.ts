import { supabase } from './supabaseClient';
import type { FinetunePollResult, FinetuneStartResult } from '../types/finetune';

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('detection-finetune', { body });
  if (error) throw new Error(`Finetuning failed: ${error.message}`);
  if (data?.error) throw new Error(data.error as string);
  return data as T;
}

export const finetuneService = {
  /** Starts a finetuning run (or resumes an in-progress one for the same detection). */
  start(params: {
    detectionId: string;
    integrationId: string;
    windowDays: number;
    preflightRunId?: string;
  }): Promise<FinetuneStartResult> {
    return invoke<FinetuneStartResult>({ action: 'start', ...params });
  },

  /** Polls a run for new events and status. */
  poll(runId: string): Promise<FinetunePollResult> {
    return invoke<FinetunePollResult>({ action: 'poll', runId });
  },

  /** Executes one pending agent tool call host-side. Only the id is sent — the edge
   *  function reads the query/intent from the trusted session event. */
  tool(runId: string, toolUseId: string): Promise<{ status: string }> {
    return invoke<{ status: string }>({ action: 'tool', runId, toolUseId });
  },

  /** Cancels a running finetuning run. */
  cancel(runId: string): Promise<{ status: string }> {
    return invoke<{ status: string }>({ action: 'cancel', runId });
  },
};
