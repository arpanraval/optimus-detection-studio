/**
 * packDeployJobService — client-side service for resilient pack deploy jobs.
 * Jobs persist server-side; tab close / navigation does not interrupt deploy.
 */

import { supabase } from './supabaseClient';
import type { Detection } from '../types';

export interface PackDeployJob {
  detection_packs?: { name: string } | null;
  integrations?: { name: string } | null;
  id: string;
  pack_id: string | null;
  integration_id: string;
  created_by: string;
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled';
  total_items: number;
  succeeded_count: number;
  failed_count: number;
  skipped_count: number;
  current_detection_id: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface CreateJobInput {
  reconcile?: boolean;
  requestKey?: string;
  packId: string | null;
  integrationId: string;
  detections: Detection[];
  ruleConfig?: Record<string, unknown>;
}

export interface PackPreviewItem {
  detection_id: string;
  detection_name: string;
  reason: string | null;
  notice?: string;
  can_reconcile?: boolean;
}

async function invokePack<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('pack-deploy-worker', { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    const details = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
    throw new Error(details?.error || error.message || 'Pack deployment request failed');
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function previewDeployJob(input: CreateJobInput): Promise<PackPreviewItem[]> {
  const data = await invokePack<{ items: PackPreviewItem[] }>({
    action: input.reconcile ? 'reconcile' : 'preview',
    integrationId: input.integrationId,
    detectionIds: [...new Set(input.detections.map((d) => d.id))],
    ruleConfig: input.ruleConfig ?? {},
  });
  return data.items;
}

export async function createDeployJob(input: CreateJobInput): Promise<string> {
  const data = await invokePack<{ jobId: string }>({
    action: 'create',
    reconcile: input.reconcile === true,
    packId: input.packId,
    integrationId: input.integrationId,
    detectionIds: [...new Set(input.detections.map((d) => d.id))],
    ruleConfig: input.ruleConfig ?? {},
    requestKey: input.requestKey ?? crypto.randomUUID(),
  });
  if (!data?.jobId) throw new Error('The server did not return a deployment job');
  return data.jobId;
}

export async function retryFailedItems(jobId: string): Promise<void> {
  await invokePack({ action: 'retry', jobId });
}

export async function cancelJob(jobId: string): Promise<void> {
  await invokePack({ action: 'cancel', jobId });
}

export async function getActiveJobs(): Promise<PackDeployJob[]> {
  const { data, error } = await supabase
    .from('pack_deploy_jobs')
    .select('*')
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as PackDeployJob[];
}
