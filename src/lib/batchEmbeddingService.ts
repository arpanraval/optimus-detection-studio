/**
 * Batch Embedding Service
 * Uses Gemini Batch API for async bulk embedding at 50% cost
 */

import { logger } from './logger';
import { supabase } from './supabaseClient';

// =============================================================================
// TYPES
// =============================================================================

export interface BatchJob {
  id: string;
  status: 'pending' | 'submitted' | 'running' | 'succeeded' | 'processing' | 'completed' | 'failed' | 'cancelled';
  totalItems: number;
  processedItems: number;
  failedItems: number;
  errorMessage?: string;
  createdAt?: string;
  completedAt?: string;
}

export interface BatchSubmitResult {
  jobId: string;
  batchName: string;
  totalItems: number;
  detections: number;
  mitre: number;
  status: string;
}

// =============================================================================
// EDGE FUNCTION CALLER
// =============================================================================

async function callBatchFunction(body: Record<string, unknown>): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('batch-embedding', { body });

  if (error) {
    logger.error('Batch embedding function error:', error);
    throw new Error(error.message || 'Batch embedding function failed');
  }

  return data;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Submit a new batch embedding job for all pending items.
 * Returns job info or throws if a job is already active.
 */
export async function submitBatchJob(): Promise<BatchSubmitResult> {
  const data = await callBatchFunction({ action: 'submit' });

  if (data.error) {
    throw new Error(data.error);
  }

  logger.info(`Batch job submitted: ${data.totalItems} items (${data.detections} detections, ${data.mitre} MITRE)`);
  return data;
}

/**
 * Check the status of a batch embedding job.
 */
export async function checkBatchJob(jobId: string): Promise<BatchJob> {
  const data = await callBatchFunction({ action: 'check', jobId });

  return {
    id: data.jobId,
    status: data.status,
    totalItems: data.totalItems || 0,
    processedItems: data.processedItems || 0,
    failedItems: data.failedItems || 0,
    errorMessage: data.errorMessage || data.error,
  };
}

/**
 * Process the results of a completed batch job (store embeddings in DB).
 */
export async function processBatchResults(jobId: string): Promise<{ processed: number; failed: number }> {
  const data = await callBatchFunction({ action: 'process', jobId });

  if (data.error) {
    throw new Error(data.error);
  }

  logger.info(`Batch results processed: ${data.processed} stored, ${data.failed} failed`);
  return { processed: data.processed, failed: data.failed };
}

/**
 * Get any currently active batch job.
 */
export async function getActiveBatchJob(): Promise<BatchJob | null> {
  const data = await callBatchFunction({ action: 'active' });

  if (!data.job) return null;

  return {
    id: data.job.id,
    status: data.job.status,
    totalItems: data.job.total_items,
    processedItems: data.job.processed_items,
    failedItems: data.job.failed_items,
    errorMessage: data.job.error_message,
    createdAt: data.job.created_at,
  };
}
