/**
 * packDeployJobService — client-side service for resilient pack deploy jobs.
 * Jobs persist server-side; tab close / navigation does not interrupt deploy.
 */

import { supabase } from './supabaseClient';
import type { Detection } from '../types';

export interface PackDeployJob {
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
  packId: string | null;
  integrationId: string;
  detections: Detection[];
  ruleConfig?: Record<string, unknown>;
}

const BLOCKED_STATUSES = new Set(['Draft', 'Deprecated', 'Archived']);

/**
 * Create a new deploy job and kick off background processing.
 * Returns the job ID immediately — deploy runs server-side.
 *
 * Deduplication: if the same detection_id appears more than once (common when
 * deploying multiple packs with overlap), it is inserted only once.
 */
export async function createDeployJob(input: CreateJobInput): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not authenticated');

  // Filter deployable detections
  const deployable = input.detections.filter(
    (d) => d.library_type === 'production' && !BLOCKED_STATUSES.has(d.status)
  );

  if (deployable.length === 0) {
    throw new Error(
      'No deployable detections. Rules must be in the Production library and not Draft/Deprecated/Archived.'
    );
  }

  // Deduplicate by detection ID
  const seen = new Set<string>();
  const deduplicated = deployable.filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  // Create the job row
  const { data: job, error: jobError } = await supabase
    .from('pack_deploy_jobs')
    .insert({
      pack_id: input.packId,
      integration_id: input.integrationId,
      created_by: userData.user.id,
      total_items: deduplicated.length,
      status: 'queued',
      rule_config: input.ruleConfig ?? null,
    })
    .select('id')
    .single();

  if (jobError || !job) {
    throw new Error(jobError?.message || 'Failed to create deploy job');
  }

  // Insert job items in batches
  const items = deduplicated.map((d) => ({
    job_id: job.id,
    detection_id: d.id,
    detection_name: d.name || d.id,
    status: 'pending' as const,
  }));

  const CHUNK = 100;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const { error: itemError } = await supabase.from('pack_deploy_job_items').insert(chunk);
    if (itemError) {
      throw new Error(`Failed to queue items: ${itemError.message}`);
    }
  }

  // Kick off the worker (fire and forget — if invoke fails, job stays queued and can be restarted)
  supabase.functions
    .invoke('pack-deploy-worker', { body: { jobId: job.id } })
    .catch((err) => {
      console.error('Failed to invoke pack-deploy-worker:', err);
    });

  return job.id;
}

/**
 * Retry all failed items in an existing job.
 */
export async function retryFailedItems(jobId: string): Promise<void> {
  // Reset failed items to pending
  const { error: resetError } = await supabase
    .from('pack_deploy_job_items')
    .update({ status: 'pending', error_message: null })
    .eq('job_id', jobId)
    .eq('status', 'failed');

  if (resetError) throw resetError;

  // Reset job to queued
  const { error: jobError } = await supabase
    .from('pack_deploy_jobs')
    .update({ status: 'queued', failed_count: 0, current_detection_id: null, completed_at: null })
    .eq('id', jobId);

  if (jobError) throw jobError;

  // Re-invoke worker
  supabase.functions.invoke('pack-deploy-worker', { body: { jobId } }).catch((err) => {
    console.error('Failed to invoke worker for retry:', err);
  });
}

/**
 * Cancel a running or queued job.
 * The worker checks cancellation status between items and stops gracefully.
 */
export async function cancelJob(jobId: string): Promise<void> {
  await supabase
    .from('pack_deploy_jobs')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', jobId)
    .in('status', ['queued', 'running']);
}

/**
 * Fetch any active (queued or running) jobs for the current user.
 * Used at app startup to resume showing the progress panel.
 */
export async function getActiveJobs(): Promise<PackDeployJob[]> {
  const { data } = await supabase
    .from('pack_deploy_jobs')
    .select('*')
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false });
  return (data || []) as PackDeployJob[];
}
