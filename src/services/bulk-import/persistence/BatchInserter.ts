/**
 * BatchInserter - Handles batched database inserts with safety features
 *
 * Features:
 * - Pre-flight RLS permission check
 * - Batched inserts with retry logic
 * - Checkpointing for resume capability
 * - Rollback support via bulk_import_id tracking
 */

import { supabase } from '../../../lib/supabaseClient';
import { Detection } from '../../../types';
import type { LibraryType } from '../../../constants/library';
import {
  ImportJobError,
  ImportJobResult,
  ImportPermissionCheckResult,
  RollbackResult,
  CheckpointData,
  VendorMetadata,
} from '../types';

/**
 * Options for batch insertion
 */
export interface BatchInsertOptions {
  /** Number of records per batch */
  batchSize?: number;
  /** Retry failed inserts individually */
  retryOnFailure?: boolean;
  /** Maximum retries per record */
  maxRetries?: number;
  /** Delay between batches (ms) */
  batchDelay?: number;
  /** Bulk import job ID for audit trail */
  bulkImportId?: string;
  /** User ID performing the import */
  userId?: string;
  /** Target library type */
  targetLibrary?: LibraryType;
  /** Progress callback */
  onProgress?: (inserted: number, total: number, batchNumber: number) => void;
  /** Error callback */
  onError?: (error: ImportJobError) => void;
  /** Checkpoint callback - called after each successful batch */
  onCheckpoint?: (checkpoint: CheckpointData) => void;
  /** Resume from checkpoint */
  resumeFromCheckpoint?: CheckpointData;
  /** Cooperative cancellation check, evaluated before and after every batch. */
  shouldAbort?: () => boolean;
}

const DEFAULT_OPTIONS: BatchInsertOptions = {
  batchSize: 50,
  retryOnFailure: true,
  maxRetries: 2,
  batchDelay: 100,
};

/**
 * Result of a single batch insert
 */
interface BatchResult {
  success: boolean;
  insertedIds: string[];
  failedRecords: Array<{
    detection: Partial<Detection>;
    error: string;
  }>;
}

/**
 * Handles batched insertion of detections with safety features
 */
export class BatchInserter {
  /**
   * Pre-flight check: Verify user has permission to write detections
   * Call this BEFORE starting a large import job
   */
  async checkPermissions(userId: string, targetLibrary: LibraryType): Promise<ImportPermissionCheckResult> {
    try {
      // Call the database function for permission check
      const { data, error } = await supabase.rpc('check_detection_write_permission', {
        p_user_id: userId,
        p_library_type: targetLibrary,
      });

      if (error) {
        return {
          allowed: false,
          error: error.message,
        };
      }

      return data as ImportPermissionCheckResult;
    } catch (error) {
      // Fallback: Try a simple permission check if the function doesn't exist
      return this.fallbackPermissionCheck(userId, targetLibrary);
    }
  }

  /**
   * Fallback permission check when database function is unavailable
   */
  private async fallbackPermissionCheck(
    userId: string,
    targetLibrary: LibraryType,
  ): Promise<ImportPermissionCheckResult> {
    try {
      // Check user profile for role
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (profileError || !profile) {
        return {
          allowed: false,
          error: 'Unable to verify user profile',
        };
      }

      // Development library requires admin/owner role
      if (targetLibrary === 'development') {
        if (!['owner', 'admin'].includes(profile.role)) {
          return {
            allowed: false,
            error: 'Only owners and admins can import to Development Library',
            required_role: 'admin',
            current_role: profile.role,
          };
        }
      }

      // Test actual write permission with a dummy insert + rollback
      // We'll skip this for now since the profile check should be sufficient

      return {
        allowed: true,
        user_id: userId,
        library_type: targetLibrary,
        user_role: profile.role,
      };
    } catch (error) {
      return {
        allowed: false,
        error: error instanceof Error ? error.message : 'Permission check failed',
      };
    }
  }

  /**
   * Rollback a bulk import by deleting all detections from that job
   */
  async rollbackImport(jobId: string, userId: string): Promise<RollbackResult> {
    let rpcError: string | null;

    try {
      // Try using the database function first
      const { data, error } = await supabase.rpc('rollback_bulk_import', {
        p_job_id: jobId,
        p_user_id: userId,
      });

      if (error) {
        rpcError = error.message;
      } else {
        // Trust the SQL function's response -- it now correctly returns
        // success: false when no rows are affected
        return data as RollbackResult;
      }
    } catch (error) {
      rpcError = error instanceof Error ? error.message : String(error);
    }

    // RPC failed (timeout, RLS, connection drop, …). Fall back to a direct
    // DELETE through PostgREST. Only surface the RPC error if the fallback
    // also fails — otherwise it's just noise.
    const fallbackResult = await this.fallbackRollback(jobId, userId);

    if (!fallbackResult.success && rpcError) {
      console.warn('rollback_bulk_import: RPC failed and fallback also failed.', {
        rpcError,
        fallbackError: fallbackResult.error,
      });
    } else if (rpcError) {
      console.info('rollback_bulk_import: RPC failed, fallback DELETE succeeded.', { rpcError });
    }

    return fallbackResult;
  }

  /**
   * Fallback rollback when database function is unavailable
   */
  private async fallbackRollback(jobId: string, userId: string): Promise<RollbackResult> {
    try {
      // Verify the job exists and belongs to user (or user is admin)
      const { data: job, error: jobError } = await supabase
        .from('bulk_import_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (jobError || !job) {
        return {
          success: false,
          error: 'Import job not found',
        };
      }

      // Check if already reverted
      if (job.status === 'reverted') {
        return {
          success: false,
          error: 'Import has already been reverted',
        };
      }

      // Verify permissions
      if (job.user_id !== userId) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single();

        if (!profile || !['owner', 'admin'].includes(profile.role)) {
          return {
            success: false,
            error: 'Permission denied: you can only rollback your own imports',
          };
        }
      }

      // Delete detections by bulk_import_id. count: 'exact' is required so
      // we can distinguish "0 rows matched" from "deletion succeeded but
      // count not reported". Without it PostgREST returns count: null
      // even on success, which would otherwise read as a failure.
      const { error: deleteError, count } = await supabase
        .from('detections')
        .delete({ count: 'exact' })
        .eq('bulk_import_id', jobId);

      if (deleteError) {
        return {
          success: false,
          error: `Failed to delete detections: ${deleteError.message}`,
        };
      }

      // count === 0 specifically means the rows weren't tagged with this
      // bulk_import_id (a legacy import predating the safety column).
      // PostgREST returns a number when count: 'exact' is requested and
      // Content-Range is intact, which is always the case under normal
      // operation. (Remaining `count || 0` defaults below cover edge cases.)
      if (count === 0 && job.success_count > 0) {
        return {
          success: false,
          expected_count: job.success_count,
          deleted_count: 0,
          error: `Rollback could not find any detections tagged with this import job. ${job.success_count} rules were recorded as imported but lack a bulk_import_id link (likely created before rollback tracking was added in supabase/migrations/add_bulk_import_safety_columns.sql). Delete them manually or contact an admin.`,
        };
      }

      // Only update job status to 'reverted' after confirming deletions succeeded
      const revertedAt = new Date().toISOString();
      await supabase
        .from('bulk_import_jobs')
        .update({
          status: 'reverted',
          reverted_at: revertedAt,
          reverted_by: userId,
        })
        .eq('id', jobId);

      return {
        success: true,
        deleted_count: count || 0,
        expected_count: job.success_count,
        job_id: jobId,
        reverted_at: revertedAt,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Rollback failed',
      };
    }
  }

  /**
   * Insert multiple detections in batches with checkpointing
   */
  async insertAll(detections: Partial<Detection>[], options: BatchInsertOptions = {}): Promise<ImportJobResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    // Pre-flight permission check
    if (opts.userId && opts.targetLibrary) {
      const permCheck = await this.checkPermissions(opts.userId, opts.targetLibrary);
      if (!permCheck.allowed) {
        return {
          success: false,
          totalProcessed: 0,
          successCount: 0,
          failureCount: detections.length,
          skipCount: 0,
          warningCount: 0,
          importedDetectionIds: [],
          failedRules: detections.map((d) => ({
            sourceId: d.external_id || 'unknown',
            title: d.name || 'Unknown',
            error: permCheck.error || 'Permission denied',
          })),
          skippedRules: [],
          duration: Date.now() - startTime,
          mitreCoverageAdded: 0,
        };
      }
    }

    // Handle resume from checkpoint
    let startBatch = 0;
    let insertedIds: string[] = [];

    if (opts.resumeFromCheckpoint) {
      startBatch = opts.resumeFromCheckpoint.resumeFromBatch;
      insertedIds = [...opts.resumeFromCheckpoint.insertedIds];
      console.log(`Resuming from batch ${startBatch} with ${insertedIds.length} already inserted`);
    }

    const failedRules: ImportJobResult['failedRules'] = [];
    const skippedRules: ImportJobResult['skippedRules'] = [];

    const totalBatches = Math.ceil(detections.length / opts.batchSize!);
    let cancelled = false;

    for (let batchNum = startBatch; batchNum < totalBatches; batchNum++) {
      if (opts.shouldAbort?.()) {
        cancelled = true;
        break;
      }

      const start = batchNum * opts.batchSize!;
      const end = Math.min(start + opts.batchSize!, detections.length);
      const batch = detections.slice(start, end);

      // Try batch insert
      const batchResult = await this.insertBatch(batch, opts);

      insertedIds.push(...batchResult.insertedIds);

      // Handle failures
      for (const failed of batchResult.failedRecords) {
        failedRules.push({
          sourceId: failed.detection.external_id || 'unknown',
          title: failed.detection.name || 'Unknown',
          error: failed.error,
        });

        if (opts.onError) {
          opts.onError({
            timestamp: new Date().toISOString(),
            phase: 'inserting',
            code: 'INSERT_FAILED',
            message: failed.error,
            ruleId: failed.detection.external_id || undefined,
            recoverable: false,
          });
        }
      }

      // Report progress
      if (opts.onProgress) {
        opts.onProgress(insertedIds.length, detections.length, batchNum + 1);
      }

      // Create checkpoint after each successful batch
      if (opts.onCheckpoint && batchResult.insertedIds.length > 0) {
        const checkpoint: CheckpointData = {
          resumeFromBatch: batchNum + 1,
          insertedIds: [...insertedIds],
          checkpointedAt: new Date().toISOString(),
        };
        opts.onCheckpoint(checkpoint);
      }

      // Update bulk_import_jobs if we have a job ID
      if (opts.bulkImportId && batchResult.insertedIds.length > 0) {
        await this.updateJobProgress(opts.bulkImportId, {
          lastSuccessfulBatch: batchNum + 1,
          totalBatches,
          insertedIds,
          successCount: insertedIds.length,
          failureCount: failedRules.length,
        });
      }

      if (opts.shouldAbort?.()) {
        cancelled = true;
        break;
      }

      // Delay between batches to avoid overwhelming the database
      if (batchNum < totalBatches - 1 && opts.batchDelay! > 0) {
        await this.delay(opts.batchDelay!);
      }
    }

    const duration = Date.now() - startTime;

    return {
      success: !cancelled && failedRules.length === 0,
      totalProcessed: insertedIds.length + failedRules.length,
      successCount: insertedIds.length,
      failureCount: failedRules.length,
      skipCount: skippedRules.length,
      warningCount: 0,
      importedDetectionIds: insertedIds,
      failedRules,
      skippedRules,
      duration,
      mitreCoverageAdded: 0, // Will be calculated separately
      cancelled,
    };
  }

  /**
   * Update bulk_import_jobs with current progress
   */
  private async updateJobProgress(
    jobId: string,
    progress: {
      lastSuccessfulBatch: number;
      totalBatches: number;
      insertedIds: string[];
      successCount: number;
      failureCount: number;
    },
  ): Promise<void> {
    try {
      await supabase
        .from('bulk_import_jobs')
        .update({
          last_successful_batch: progress.lastSuccessfulBatch,
          total_batches: progress.totalBatches,
          imported_detection_ids: progress.insertedIds,
          success_count: progress.successCount,
          failure_count: progress.failureCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    } catch (error) {
      console.error('Failed to update job progress:', error);
    }
  }

  /**
   * Insert a single batch of detections
   */
  private async insertBatch(detections: Partial<Detection>[], options: BatchInsertOptions): Promise<BatchResult> {
    if (!options.bulkImportId) {
      throw new Error('CRITICAL: Cannot insert batch without bulkImportId. Job record must be created first.');
    }

    const insertedIds: string[] = [];
    const failedRecords: BatchResult['failedRecords'] = [];

    // Prepare records for insertion (ensure required fields + bulk_import_id)
    const records = detections.map((d) => this.prepareForInsert(d, options.bulkImportId!));

    try {
      // Attempt batch insert
      const { data, error } = await supabase.from('detections').insert(records).select('id');

      if (error) {
        // Batch failed - retry individually if enabled
        if (options.retryOnFailure) {
          for (const detection of detections) {
            const singleResult = await this.insertSingle(detection, options);
            if (singleResult.success && singleResult.id) {
              insertedIds.push(singleResult.id);
            } else {
              failedRecords.push({
                detection,
                error: singleResult.error || 'Unknown error',
              });
            }
          }
        } else {
          // Mark all as failed
          for (const detection of detections) {
            failedRecords.push({
              detection,
              error: error.message,
            });
          }
        }
      } else {
        // Batch succeeded
        insertedIds.push(...(data?.map((d) => d.id) || []));
      }
    } catch (error) {
      // Unexpected error - retry individually
      if (options.retryOnFailure) {
        for (const detection of detections) {
          const singleResult = await this.insertSingle(detection, options);
          if (singleResult.success && singleResult.id) {
            insertedIds.push(singleResult.id);
          } else {
            failedRecords.push({
              detection,
              error: singleResult.error || 'Unknown error',
            });
          }
        }
      } else {
        for (const detection of detections) {
          failedRecords.push({
            detection,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return {
      success: failedRecords.length === 0,
      insertedIds,
      failedRecords,
    };
  }

  /**
   * Insert a single detection with retries
   */
  private async insertSingle(
    detection: Partial<Detection>,
    options: BatchInsertOptions,
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= (options.maxRetries || 2); attempt++) {
      try {
        const record = this.prepareForInsert(detection, options.bulkImportId!);

        const { data, error } = await supabase.from('detections').insert([record]).select('id').single();

        if (error) {
          lastError = error.message;
          // Wait before retry
          if (attempt < (options.maxRetries || 2)) {
            await this.delay(100 * (attempt + 1));
          }
          continue;
        }

        return { success: true, id: data?.id };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        if (attempt < (options.maxRetries || 2)) {
          await this.delay(100 * (attempt + 1));
        }
      }
    }

    return { success: false, error: lastError };
  }

  /**
   * Prepare a detection record for database insertion
   * Includes bulk_import_id for audit trail and vendor_metadata for lossless import
   */
  private prepareForInsert(detection: Partial<Detection>, bulkImportId: string): Record<string, unknown> {
    if (!bulkImportId) {
      throw new Error(
        'CRITICAL: bulk_import_id is required for every detection insert. Cannot insert without rollback tracking.',
      );
    }

    const now = new Date().toISOString();

    // Build vendor_metadata if we have vendor-specific data.
    // DetectionNormalizer attaches a base VendorMetadata (sourceFormat, rawContent,
    // vendorFields, importedAt). We stamp importJobId here so the persisted row
    // can later be traced back to its bulk_import_jobs entry — and so the drift
    // checker has a complete baseline.
    const baseVendorMetadata: VendorMetadata | null = (detection as any).vendorMetadata || null;
    const vendorMetadata: VendorMetadata | null = baseVendorMetadata
      ? { ...baseVendorMetadata, importJobId: bulkImportId }
      : null;

    // Create a clean record with proper field mapping
    // Note: Database uses camelCase for most columns
    return {
      id: detection.id || crypto.randomUUID(),
      user_id: detection.user_id,
      version: detection.version || 1,
      name: detection.name,
      description: detection.description || '',
      author: detection.author || 'Imported',
      status: detection.status,
      detectionType: detection.detectionType,
      severity: detection.severity,
      logSource: detection.logSource || '',
      logSources: detection.logSources || [],
      dataSources: detection.dataSources || [],
      dataComponents: detection.dataComponents || [],
      platforms: detection.platforms || [],
      technology: detection.technology || '',
      queries: detection.queries || [],
      queryLanguage: detection.queryLanguage || 'Sigma',
      detectionQuery: detection.detectionQuery || '',
      queryExplanation: detection.queryExplanation || '',
      mitreAttackIds: detection.mitreAttackIds || [],
      mitreTactics: detection.mitreTactics || [],
      mitreTechniques: detection.mitreTechniques || [],
      linkedGroups: detection.linkedGroups || [],
      linkedSoftware: detection.linkedSoftware || [],
      linkedCampaigns: detection.linkedCampaigns || [],
      threatActors: detection.threatActors || [],
      campaigns: detection.campaigns || [],
      software: detection.software || [],
      associatedCVEs: detection.associatedCVEs || [],
      investigationSteps: detection.investigationSteps || [],
      responseActions: detection.responseActions || [],
      falsePositiveGuidance: detection.falsePositiveGuidance || '',
      prerequisites: detection.prerequisites || [],
      caveats: detection.caveats || '',
      fineTuning: detection.fineTuning || '',
      testedAndValidated: detection.testedAndValidated || false,
      testCases: detection.testCases || [],
      qualityScore: detection.qualityScore || 0,
      references: detection.references || [],
      tags: detection.tags || [],
      auditLog: detection.auditLog || [],
      library_type: detection.library_type || 'production',
      source: detection.source || 'community',
      source_rule_id: detection.source_rule_id || null,
      source_url: detection.source_url || null,
      external_id: detection.external_id || null,
      promotion_status: detection.promotion_status || 'none',
      promoted_to_id: detection.promoted_to_id || null,
      promoted_at: detection.promoted_at || null,
      review_status: detection.review_status || 'none',
      // New safety columns
      bulk_import_id: bulkImportId,
      vendor_metadata: vendorMetadata || {},
      // Timestamps
      createdDate: detection.createdDate || now,
      updatedDate: detection.updatedDate || now,
    };
  }

  /**
   * Get resumable imports for a user
   */
  async getResumableImports(userId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('bulk_import_jobs')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['failed', 'cancelled'])
        .gt('last_successful_batch', 0)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Failed to get resumable imports:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get resumable imports:', error);
      return [];
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const batchInserter = new BatchInserter();
