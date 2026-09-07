import { supabase } from './supabaseClient';
import type {
  CrowdStrikeFinetunePollResult,
  CrowdStrikeFinetuneStartResult,
} from '../types/crowdstrikeFinetune';

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('crowdstrike-detection-finetune', { body });
  if (error) throw new Error(`CrowdStrike finetuning failed: ${error.message}`);
  if (data?.error) throw new Error(data.error as string);
  return data as T;
}

export const crowdstrikeFinetuneService = {
  start(params: {
    detectionId: string;
    integrationId: string;
    preflightRunId: string;
  }): Promise<CrowdStrikeFinetuneStartResult> {
    return invoke<CrowdStrikeFinetuneStartResult>({ action: 'start', ...params });
  },

  poll(runId: string): Promise<CrowdStrikeFinetunePollResult> {
    return invoke<CrowdStrikeFinetunePollResult>({ action: 'poll', runId });
  },

  tool(runId: string, toolUseId: string): Promise<{ status: string }> {
    return invoke<{ status: string }>({ action: 'tool', runId, toolUseId });
  },

  cancel(runId: string): Promise<{ status: string }> {
    return invoke<{ status: string }>({ action: 'cancel', runId });
  },
};
