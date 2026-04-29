/**
 * Embedding Service
 * Handles generation and management of vector embeddings for semantic search
 */

import { logger } from './logger';
import { supabase } from './supabaseClient';
import type { AiFeatureCode } from './ai/featureCodes';

/** Options accepted by every embedding helper. `feature` attributes usage in the GenAI Cost Center. */
export interface EmbeddingHelperOptions {
  feature?: AiFeatureCode;
}

// =============================================================================
// TYPES
// =============================================================================

interface EmbeddingResult {
  status: 'generated' | 'unchanged' | 'error';
  id: string;
}

interface BatchEmbeddingResult {
  processed: number;
  generated: number;
  unchanged: number;
  errors: number;
}

interface EmbeddingStats {
  totalDetections: number;
  embeddedDetections: number;
  pendingDetections: number;
  totalMitre: number;
  embeddedMitre: number;
  pendingMitre: number;
}

// =============================================================================
// SINGLE EMBEDDING OPERATIONS
// =============================================================================

/**
 * Generate embedding for a single detection
 */
export async function generateDetectionEmbedding(
  detectionId: string,
  forceRegenerate = false,
  opts?: EmbeddingHelperOptions
): Promise<EmbeddingResult> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase.functions.invoke('generate-embedding', {
    body: {
      type: 'detection',
      id: detectionId,
      forceRegenerate,
      feature: opts?.feature ?? 'embedding-detection',
    }
  });

  if (error) {
    logger.error('Embedding generation error:', error);
    return { status: 'error', id: detectionId };
  }

  return data;
}

/**
 * Generate embedding for a single MITRE object
 */
export async function generateMitreEmbedding(
  stixId: string,
  forceRegenerate = false,
  opts?: EmbeddingHelperOptions
): Promise<EmbeddingResult> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase.functions.invoke('generate-embedding', {
    body: {
      type: 'mitre',
      id: stixId,
      forceRegenerate,
      feature: opts?.feature ?? 'embedding-detection',
    }
  });

  if (error) {
    logger.error('Embedding generation error:', error);
    return { status: 'error', id: stixId };
  }

  return data;
}

// =============================================================================
// BATCH EMBEDDING OPERATIONS
// =============================================================================

/**
 * Generate embeddings for multiple detections
 */
export async function generateBatchDetectionEmbeddings(
  detectionIds: string[],
  forceRegenerate = false,
  opts?: EmbeddingHelperOptions
): Promise<BatchEmbeddingResult> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase.functions.invoke('generate-embedding', {
    body: {
      type: 'batch_detections',
      ids: detectionIds,
      forceRegenerate,
      feature: opts?.feature ?? 'embedding-batch',
    }
  });

  logger.debug('Edge function response — data:', JSON.stringify(data), 'error:', error ? JSON.stringify(error) : 'null');

  if (error) {
    logger.error('Batch embedding generation error:', error);
    logger.error('Edge function error details:', JSON.stringify(error, null, 2));
    return { processed: 0, generated: 0, unchanged: 0, errors: detectionIds.length };
  }

  // Log if the edge function returned errors in its response
  if (data?.errors > 0) {
    logger.warn(`Batch embedding: ${data.generated} generated, ${data.errors} errors, ${data.unchanged} unchanged out of ${detectionIds.length} requested`);
    if (data.errorDetails?.length > 0) {
      logger.error('Embedding error details from edge function:', data.errorDetails);
    }
  }

  return data;
}

/**
 * Generate embeddings for multiple MITRE objects
 */
export async function generateBatchMitreEmbeddings(
  stixIds: string[],
  forceRegenerate = false,
  opts?: EmbeddingHelperOptions
): Promise<BatchEmbeddingResult> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase.functions.invoke('generate-embedding', {
    body: {
      type: 'batch_mitre',
      ids: stixIds,
      forceRegenerate,
      feature: opts?.feature ?? 'embedding-batch',
    }
  });

  if (error) {
    logger.error('Batch embedding generation error:', error);
    return { processed: 0, generated: 0, unchanged: 0, errors: stixIds.length };
  }

  return data;
}

// =============================================================================
// BACKFILL OPERATIONS
// =============================================================================

/**
 * Get embedding statistics
 */
export async function getEmbeddingStats(): Promise<EmbeddingStats> {
  // Get detection counts
  const { count: totalDetections } = await supabase
    .from('detections')
    .select('*', { count: 'exact', head: true });

  const { count: embeddedDetections } = await supabase
    .from('detection_embeddings')
    .select('*', { count: 'exact', head: true });

  // Get MITRE counts (only types we embed: techniques, groups, software, campaigns)
  const { count: totalMitre } = await supabase
    .from('mitre_objects')
    .select('*', { count: 'exact', head: true })
    .in('type', ['attack-pattern', 'intrusion-set', 'malware', 'tool', 'campaign']);

  const { count: embeddedMitre } = await supabase
    .from('mitre_embeddings')
    .select('*', { count: 'exact', head: true });

  logger.info(`Embeddings Stats — Detections: ${embeddedDetections}/${totalDetections}, MITRE: ${embeddedMitre}/${totalMitre}`);

  return {
    totalDetections: totalDetections || 0,
    embeddedDetections: embeddedDetections || 0,
    pendingDetections: (totalDetections || 0) - (embeddedDetections || 0),
    totalMitre: totalMitre || 0,
    embeddedMitre: embeddedMitre || 0,
    pendingMitre: (totalMitre || 0) - (embeddedMitre || 0)
  };
}

/**
 * Get IDs of detections that need embedding
 */
export async function getDetectionsNeedingEmbedding(limit = 100): Promise<string[]> {
  // First get ALL embedded detection_ids (paginated to handle large datasets)
  const embeddedSet = new Set<string>();
  let embeddedOffset = 0;
  const embeddedBatchSize = 1000;

  while (true) {
    const { data: embeddedBatch } = await supabase
      .from('detection_embeddings')
      .select('detection_id')
      .range(embeddedOffset, embeddedOffset + embeddedBatchSize - 1);

    if (!embeddedBatch || embeddedBatch.length === 0) break;

    for (const item of embeddedBatch) {
      embeddedSet.add(item.detection_id);
    }

    if (embeddedBatch.length < embeddedBatchSize) break;
    embeddedOffset += embeddedBatchSize;
  }

  logger.debug(`Found ${embeddedSet.size} already embedded detections`);

  // Now fetch detections in batches until we have enough unembedded ones
  let offset = 0;
  const batchSize = 500;
  const results: string[] = [];

  while (results.length < limit) {
    const { data: batch } = await supabase
      .from('detections')
      .select('id')
      .range(offset, offset + batchSize - 1);

    if (!batch || batch.length === 0) break;

    for (const item of batch) {
      if (!embeddedSet.has(item.id)) {
        results.push(item.id);
        if (results.length >= limit) break;
      }
    }

    offset += batchSize;
  }

  logger.debug(`Found ${results.length} detections needing embedding`);

  return results;
}

/**
 * Get STIX IDs of MITRE objects that need embedding
 */
export async function getMitreObjectsNeedingEmbedding(limit = 100): Promise<string[]> {
  // First get ALL embedded stix_ids (paginated to handle large datasets)
  const embeddedSet = new Set<string>();
  let embeddedOffset = 0;
  const embeddedBatchSize = 1000;

  while (true) {
    const { data: embeddedBatch } = await supabase
      .from('mitre_embeddings')
      .select('stix_id')
      .range(embeddedOffset, embeddedOffset + embeddedBatchSize - 1);

    if (!embeddedBatch || embeddedBatch.length === 0) break;

    for (const item of embeddedBatch) {
      embeddedSet.add(item.stix_id);
    }

    if (embeddedBatch.length < embeddedBatchSize) break;
    embeddedOffset += embeddedBatchSize;
  }

  logger.debug(`Found ${embeddedSet.size} already embedded MITRE objects`);

  // Now fetch MITRE objects in batches until we have enough unembedded ones
  let offset = 0;
  const batchSize = 500;
  const results: string[] = [];

  while (results.length < limit) {
    const { data: batch } = await supabase
      .from('mitre_objects')
      .select('stix_id')
      .in('type', ['attack-pattern', 'intrusion-set', 'malware', 'tool', 'campaign'])
      .range(offset, offset + batchSize - 1);

    if (!batch || batch.length === 0) break;

    for (const item of batch) {
      if (!embeddedSet.has(item.stix_id)) {
        results.push(item.stix_id);
        if (results.length >= limit) break;
      }
    }

    offset += batchSize;
  }

  logger.debug(`Found ${results.length} MITRE objects needing embedding`);

  return results;
}

/**
 * Backfill embeddings for all detections
 * Processes in batches with progress callback
 */
export async function backfillDetectionEmbeddings(
  onProgress?: (progress: { current: number; total: number; generated: number; errors: number }) => void,
  batchSize = 50
): Promise<BatchEmbeddingResult> {
  const stats = await getEmbeddingStats();
  const total = stats.pendingDetections;

  if (total === 0) {
    return { processed: 0, generated: 0, unchanged: 0, errors: 0 };
  }

  let totalProcessed = 0;
  let totalGenerated = 0;
  let totalErrors = 0;

  let consecutiveFailures = 0;

  while (totalProcessed < total) {
    const ids = await getDetectionsNeedingEmbedding(batchSize);

    if (ids.length === 0) break;

    const result = await generateBatchDetectionEmbeddings(ids);

    // Count errors as processed to prevent infinite retry of same failing batch.
    // When the edge function fails entirely, result.processed is 0 but errors > 0.
    const batchAdvance = Math.max(result.processed, result.errors);
    totalProcessed += batchAdvance;
    totalGenerated += result.generated;
    totalErrors += result.errors;

    // Track consecutive failures to bail out early on persistent errors
    // (e.g. Gemini API rate limit, expired auth, misconfigured keys)
    if (result.generated === 0 && result.errors > 0) {
      consecutiveFailures++;
    } else {
      consecutiveFailures = 0;
    }

    if (onProgress) {
      onProgress({
        current: totalProcessed,
        total,
        generated: totalGenerated,
        errors: totalErrors
      });
    }

    // Stop after 3 consecutive failed batches — likely a persistent issue
    if (consecutiveFailures >= 3) {
      logger.warn(`Embedding backfill stopped: ${consecutiveFailures} consecutive batch failures. ${total - totalProcessed} remaining — check Gemini API key and rate limits.`);
      break;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return {
    processed: totalProcessed,
    generated: totalGenerated,
    unchanged: 0,
    errors: totalErrors
  };
}

/**
 * Backfill embeddings for MITRE objects
 */
export async function backfillMitreEmbeddings(
  onProgress?: (progress: { current: number; total: number; generated: number; errors: number }) => void,
  batchSize = 50
): Promise<BatchEmbeddingResult> {
  const stats = await getEmbeddingStats();
  const total = stats.pendingMitre;

  if (total === 0) {
    return { processed: 0, generated: 0, unchanged: 0, errors: 0 };
  }

  let totalProcessed = 0;
  let totalGenerated = 0;
  let totalErrors = 0;

  let consecutiveFailures = 0;

  while (totalProcessed < total) {
    const ids = await getMitreObjectsNeedingEmbedding(batchSize);

    if (ids.length === 0) break;

    const result = await generateBatchMitreEmbeddings(ids);

    // Count errors as processed to prevent infinite retry of same failing batch.
    const batchAdvance = Math.max(result.processed, result.errors);
    totalProcessed += batchAdvance;
    totalGenerated += result.generated;
    totalErrors += result.errors;

    // Track consecutive failures to bail out early on persistent errors
    if (result.generated === 0 && result.errors > 0) {
      consecutiveFailures++;
    } else {
      consecutiveFailures = 0;
    }

    if (onProgress) {
      onProgress({
        current: totalProcessed,
        total,
        generated: totalGenerated,
        errors: totalErrors
      });
    }

    // Stop after 3 consecutive failed batches — likely a persistent issue
    if (consecutiveFailures >= 3) {
      logger.warn(`MITRE embedding backfill stopped: ${consecutiveFailures} consecutive batch failures. ${total - totalProcessed} remaining — check Gemini API key and rate limits.`);
      break;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return {
    processed: totalProcessed,
    generated: totalGenerated,
    unchanged: 0,
    errors: totalErrors
  };
}

// =============================================================================
// AUTO-EMBEDDING HOOK
// =============================================================================

/**
 * Call this after saving a detection to auto-generate its embedding
 * Non-blocking - fires and forgets
 */
export function autoEmbedDetection(detectionId: string): void {
  // Fire and forget - don't await
  generateDetectionEmbedding(detectionId).catch(err => {
    logger.warn('Auto-embedding failed for detection:', detectionId, err);
  });
}
