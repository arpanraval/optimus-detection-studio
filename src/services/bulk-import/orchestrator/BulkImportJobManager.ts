/**
 * BulkImportJobManager - Main orchestrator for bulk import operations
 *
 * Manages the complete import workflow:
 * 1. Fetching source files (ZIP/direct upload)
 * 2. Parsing files using appropriate parsers
 * 3. Validating parsed rules
 * 4. Normalizing to Detection schema
 * 5. Batch inserting into database
 */

import {
  ImportJob,
  ImportJobConfig,
  ImportJobStatus,
  ImportProgress,
  ImportJobError,
  ImportJobResult,
  ParsedRule,
  ValidatedRule,
  FetchedFile,
  ReconReport,
  EmbeddingStrategy,
} from '../types';
import { parserFactory } from '../parsers/ParserFactory';
import { validationPipeline, ValidationOptions } from '../validators/ValidationPipeline';
import { duplicateDetector } from '../validators/DuplicateDetector';
import { detectionNormalizer, NormalizationOptions } from '../normalizers/DetectionNormalizer';
import { zipFetcher } from '../fetchers/ZipFetcher';
import { fileFetcher } from '../fetchers/FileFetcher';
import { GitHubFetcher } from '../fetchers/GitHubFetcher';
import { batchInserter } from '../persistence/BatchInserter';
import { Detection } from '../../../types';
import { batchResolveTechniques } from '../../../mitre';
import { supabase } from '../../../lib/supabaseClient';
import { generateBatchDetectionEmbeddings } from '../../../lib/embeddingService';
import { submitBatchJob } from '../../../lib/batchEmbeddingService';

/**
 * Event callbacks for import progress
 */
export interface ImportJobCallbacks {
  onStatusChange?: (status: ImportJobStatus) => void;
  onProgress?: (progress: ImportProgress) => void;
  onError?: (error: ImportJobError) => void;
  onComplete?: (result: ImportJobResult) => void;
}

export class ImportCancelledError extends Error {
  constructor(public readonly result: ImportJobResult) {
    super('Import cancelled by user');
    this.name = 'ImportCancelledError';
  }
}

/**
 * Main orchestrator for bulk import operations
 */
export class BulkImportJobManager {
  private job: ImportJob | null = null;
  private callbacks: ImportJobCallbacks = {};
  private aborted = false;
  private embeddingStrategy: EmbeddingStrategy = 'realtime';
  private githubFetcher = new GitHubFetcher();

  /**
   * Set the embedding strategy for post-import embedding generation
   */
  setEmbeddingStrategy(strategy: EmbeddingStrategy): void {
    this.embeddingStrategy = strategy;
  }

  /**
   * Create a new import job
   */
  createJob(config: ImportJobConfig): ImportJob {
    const now = new Date().toISOString();

    this.job = {
      id: crypto.randomUUID(),
      config,
      status: 'idle',
      progress: {
        phase: 'idle',
        totalFiles: 0,
        processedFiles: 0,
        totalRules: 0,
        validRules: 0,
        warningRules: 0,
        errorRules: 0,
        duplicateRules: 0,
        insertedRules: 0,
        failedInserts: 0,
        skippedRules: 0,
      },
      rules: [],
      errors: [],
      warnings: [],
      createdAt: now,
      updatedAt: now,
    };

    this.aborted = false;
    this.githubFetcher.resetAbort();
    return this.job;
  }

  /**
   * Run pre-import reconnaissance to analyze source before committing
   */
  async runReconnaissance(): Promise<ReconReport> {
    if (!this.job) {
      throw new Error('No job created. Call createJob() first.');
    }

    const config = this.job.config;

    if (config.sourceType === 'github' && config.sourceUrl) {
      // Use Trees API scan for GitHub
      const report = await this.githubFetcher.scanRepository(config.sourceUrl, {
        token: config.githubToken,
      });

      // Get existing library count for duplicate awareness
      try {
        const existingIds = await duplicateDetector.loadExistingExternalIds(config.targetLibrary);
        report.existingLibraryCount = existingIds.size;
      } catch {
        report.existingLibraryCount = 0;
      }

      return report;
    } else if (config.sourceType === 'files' && config.sourceFiles) {
      const supportedExts = ['.yml', '.yaml', '.json', '.toml', '.yaral', '.yar'];
      const matching = config.sourceFiles.filter((f) =>
        supportedExts.some((ext) => f.name.toLowerCase().endsWith(ext)),
      );

      let existingCount = 0;
      try {
        const existingIds = await duplicateDetector.loadExistingExternalIds(config.targetLibrary);
        existingCount = existingIds.size;
      } catch {
        /* ignore */
      }

      return {
        source: 'files',
        totalFilesInPath: config.sourceFiles.length,
        matchingFiles: matching.length,
        estimatedRules: matching.length,
        filePaths: matching.map((f) => f.name),
        existingLibraryCount: existingCount,
        warnings: [],
      };
    } else if (config.sourceType === 'zip' && config.sourceZip) {
      // For ZIP, we can't easily scan without extracting, so provide basic info
      let existingCount = 0;
      try {
        const existingIds = await duplicateDetector.loadExistingExternalIds(config.targetLibrary);
        existingCount = existingIds.size;
      } catch {
        /* ignore */
      }

      return {
        source: 'zip',
        totalFilesInPath: 0, // Unknown until extracted
        matchingFiles: 0,
        estimatedRules: 0,
        filePaths: [],
        existingLibraryCount: existingCount,
        warnings: ['ZIP file contents will be analyzed during parsing.'],
      };
    }

    throw new Error('Invalid source configuration for reconnaissance');
  }

  /**
   * Get the current job
   */
  getJob(): ImportJob | null {
    return this.job;
  }

  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: ImportJobCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Abort the current import
   */
  abort(): void {
    this.aborted = true;
    this.githubFetcher.abort();
    if (this.job) {
      this.updateStatus('cancelled');
    }
  }

  /**
   * Run the complete import workflow up to preview
   */
  async runToPreview(): Promise<ValidatedRule[]> {
    if (!this.job) {
      throw new Error('No job created. Call createJob() first.');
    }

    try {
      // Step 1: Fetch files
      await this.fetchFiles();
      if (this.aborted) return [];

      // Step 2: Parse files
      await this.parseFiles();
      if (this.aborted) return [];

      // Step 3: Validate rules
      await this.validateRules();
      if (this.aborted) return [];

      // Update status to preview
      this.updateStatus('preview');

      return this.job.rules;
    } catch (error) {
      this.handleError('WORKFLOW_ERROR', error);
      return [];
    }
  }

  /**
   * Execute the import for selected rules
   */
  async executeImport(selectedRules: ValidatedRule[], userId: string): Promise<ImportJobResult> {
    if (!this.job) {
      throw new Error('No job created. Call createJob() first.');
    }

    try {
      this.updateStatus('inserting');

      // Save job to database for history tracking
      await this.saveJobToDatabase(userId);

      // Normalize selected rules
      const normalizationOptions: NormalizationOptions = {
        userId,
        targetLibrary: this.job.config.targetLibrary,
        generateNewIds: true,
      };

      const normalizedRules = detectionNormalizer.normalizeAll(selectedRules, normalizationOptions);

      const detections = normalizedRules.map((r) => r.detection);

      // Add bulk_import_id and auto-generated import tags to each detection
      for (const detection of detections) {
        detection.bulk_import_id = this.job.id;

        const importTags = generateImportTags(
          detection,
          this.job.id,
          this.job.config.vendor || this.job.config.sourceType || 'unknown',
          false,
        );
        detection.tags = [...new Set([...(detection.tags || []), ...importTags])];
      }

      // Resolve MITRE data (populate mitreTactics and mitreTechniques from mitreAttackIds)
      await this.resolveMitreData(detections);

      // Insert in batches
      const result = await batchInserter.insertAll(detections, {
        batchSize: this.job.config.batchSize || 50,
        bulkImportId: this.job.id,
        onProgress: (inserted, total, batchNum) => {
          this.updateProgress({
            insertedRules: inserted,
            currentBatch: batchNum,
            totalBatches: Math.ceil(total / (this.job!.config.batchSize || 50)),
          });
        },
        onError: (error) => {
          this.addError(error);
        },
        shouldAbort: () => this.aborted,
      });

      if (result.cancelled || this.aborted) {
        throw new ImportCancelledError({ ...result, cancelled: true });
      }

      // Post-insert embedding generation based on strategy
      if (result.importedDetectionIds.length > 0) {
        switch (this.embeddingStrategy) {
          case 'realtime':
            await this.generateEmbeddings(result.importedDetectionIds);
            break;
          case 'batch':
            await this.submitBatchEmbeddings();
            break;
          case 'skip':
            // Skip embedding entirely — user can do it later from Data Sync page
            break;
        }
      }

      if (this.aborted) {
        throw new ImportCancelledError({ ...result, cancelled: true });
      }

      // Update job with result
      this.job.result = result;
      this.updateStatus('completed');
      this.job.progress.completedAt = new Date().toISOString();

      // Update job record in database
      await this.updateJobInDatabase(result);

      if (this.callbacks.onComplete) {
        this.callbacks.onComplete(result);
      }

      return result;
    } catch (error) {
      if (error instanceof ImportCancelledError) {
        if (this.job) {
          this.job.result = error.result;
          this.updateStatus('cancelled');
          await this.updateCancelledJobInDatabase(error.result);
        }
        throw error;
      }

      this.handleError('IMPORT_ERROR', error);
      // Try to update job as failed in database
      if (this.job) {
        await this.updateJobInDatabase({
          success: false,
          totalProcessed: 0,
          successCount: 0,
          failureCount: 0,
          skipCount: 0,
          warningCount: 0,
          importedDetectionIds: [],
          failedRules: [],
          skippedRules: [],
          duration: 0,
          mitreCoverageAdded: 0,
        });
      }
      throw error;
    }
  }

  /**
   * Fetch source files based on config
   */
  private async fetchFiles(): Promise<void> {
    this.updateStatus('fetching');

    const config = this.job!.config;
    let files: FetchedFile[];

    if (config.sourceType === 'zip' && config.sourceZip) {
      const result = await zipFetcher.fetch(config.sourceZip, {
        onProgress: (current, total, fileName) => {
          this.updateProgress({
            processedFiles: current,
            totalFiles: total,
            currentFile: fileName,
          });
        },
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to extract ZIP file');
      }

      files = result.files;
    } else if (config.sourceType === 'files' && config.sourceFiles) {
      const result = await fileFetcher.fetch(config.sourceFiles, {
        onProgress: (current, total, fileName) => {
          this.updateProgress({
            processedFiles: current,
            totalFiles: total,
            currentFile: fileName,
          });
        },
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to read files');
      }

      files = result.files;
    } else if (config.sourceType === 'github' && config.sourceUrl) {
      const result = await this.githubFetcher.fetch(config.sourceUrl, {
        token: config.githubToken,
        path: config.githubPath,
        onProgress: (current, total, fileName) => {
          this.updateProgress({
            processedFiles: current,
            totalFiles: total,
            currentFile: fileName,
          });
        },
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch from GitHub');
      }

      files = result.files;
    } else {
      throw new Error('Invalid source configuration');
    }

    // Store files for parsing
    (this.job as any)._fetchedFiles = files;
    this.updateProgress({ totalFiles: files.length });
  }

  /**
   * Parse fetched files
   */
  private async parseFiles(): Promise<void> {
    this.updateStatus('parsing');

    // Initialize parser factory (lazy load parsers)
    await parserFactory.initialize();

    let files: FetchedFile[] = (this.job as any)._fetchedFiles || [];
    const parsedRules: ParsedRule[] = [];
    const warnings: string[] = [];

    // Filter by includePaths if specified (folder selection from onboarding)
    const includePaths = this.job!.config.includePaths;
    if (includePaths && includePaths.length > 0) {
      const beforeCount = files.length;
      files = files.filter((f) => includePaths.some((prefix) => f.path.startsWith(prefix + '/') || f.path === prefix));
      if (files.length < beforeCount) {
        warnings.push(`Filtered ${beforeCount - files.length} files outside selected folders`);
      }
    }

    // Vendor-locked parsing: if a single vendor filter is set, use that parser exclusively
    const vendorFilter = this.job!.config.vendorFilter;
    const lockedParser =
      vendorFilter && vendorFilter.length === 1 ? parserFactory.getParserForFormat(vendorFilter[0]) : null;

    for (let i = 0; i < files.length; i++) {
      if (this.aborted) break;

      const file = files[i];
      this.updateProgress({
        processedFiles: i + 1,
        currentFile: file.name,
      });

      let result;

      if (lockedParser) {
        // Vendor-locked mode: use specified parser
        result = lockedParser.parse(file.content, file.name, file.path);

        // Also run auto-detection to check for mismatches
        const autoDetectedParser = parserFactory.findParser(file.name, file.content);
        if (autoDetectedParser && autoDetectedParser.vendorFormat !== lockedParser.vendorFormat) {
          warnings.push(
            `${file.name}: Parsed as ${lockedParser.vendorFormat} (user selected), but auto-detection suggests ${autoDetectedParser.vendorFormat}`,
          );
        }
      } else {
        // Auto-detect mode: let factory find the right parser
        result = parserFactory.parse(file.content, file.name, file.path);
      }

      if (result === null) {
        // No parser could handle this file - skip silently
        continue;
      }

      if (result.success && result.rule) {
        parsedRules.push(result.rule);
        if (result.warnings.length > 0) {
          warnings.push(...result.warnings.map((w) => `${file.name}: ${w}`));
        }
      } else if (result.error) {
        // Track parsing errors but don't fail the whole import
        this.addError({
          timestamp: new Date().toISOString(),
          phase: 'parsing',
          code: result.error.code,
          message: result.error.message,
          fileName: file.name,
          recoverable: true,
        });
      }
    }

    this.job!.warnings = warnings;

    // Store parsed rules temporarily
    (this.job as any)._parsedRules = parsedRules;

    this.updateProgress({
      totalRules: parsedRules.length,
      errorRules: this.job!.errors.filter((e) => e.phase === 'parsing').length,
    });
  }

  /**
   * Validate parsed rules
   */
  private async validateRules(): Promise<void> {
    this.updateStatus('validating');

    const parsedRules: ParsedRule[] = (this.job as any)._parsedRules || [];

    // Load existing external IDs for duplicate detection
    const existingExternalIds = await duplicateDetector.loadExistingExternalIds(this.job!.config.targetLibrary);

    // Build validation options
    const validationOptions: ValidationOptions = {
      checkDuplicates: true,
      existingExternalIds,
      minQualityScore: 30,
    };

    // Validate all rules
    const validatedRules = validationPipeline.validateAll(parsedRules, validationOptions);

    // Get summary
    const summary = validationPipeline.getSummary(validatedRules);

    // Update job with validated rules
    this.job!.rules = validatedRules;

    this.updateProgress({
      totalRules: summary.total,
      validRules: summary.valid,
      warningRules: summary.warnings,
      errorRules: summary.errors,
      duplicateRules: summary.duplicates,
    });
  }

  /**
   * Update job status
   */
  private updateStatus(status: ImportJobStatus): void {
    if (!this.job) return;

    this.job.status = status;
    this.job.progress.phase = status;
    this.job.updatedAt = new Date().toISOString();

    if (status === 'fetching' || status === 'parsing') {
      this.job.progress.startedAt = this.job.progress.startedAt || new Date().toISOString();
    }

    if (this.callbacks.onStatusChange) {
      this.callbacks.onStatusChange(status);
    }
  }

  /**
   * Update progress
   */
  private updateProgress(updates: Partial<ImportProgress>): void {
    if (!this.job) return;

    Object.assign(this.job.progress, updates);
    this.job.updatedAt = new Date().toISOString();

    if (this.callbacks.onProgress) {
      this.callbacks.onProgress(this.job.progress);
    }
  }

  /**
   * Add an error to the job
   */
  private addError(error: ImportJobError): void {
    if (!this.job) return;

    this.job.errors.push(error);

    if (this.callbacks.onError) {
      this.callbacks.onError(error);
    }
  }

  /**
   * Handle unexpected errors
   */
  private handleError(code: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    this.addError({
      timestamp: new Date().toISOString(),
      phase: this.job?.status || 'idle',
      code,
      message: errorMessage,
      recoverable: false,
    });

    this.updateStatus('failed');
  }

  /**
   * Toggle selection for a rule
   */
  toggleRuleSelection(ruleIndex: number): void {
    if (!this.job || !this.job.rules[ruleIndex]) return;

    const rule = this.job.rules[ruleIndex];
    rule.selected = !rule.selected;
  }

  /**
   * Select all valid rules
   */
  selectAllValid(): void {
    if (!this.job) return;

    for (const rule of this.job.rules) {
      rule.selected = rule.validation.isValid && !rule.validation.isDuplicate;
    }
  }

  /**
   * Deselect all rules
   */
  deselectAll(): void {
    if (!this.job) return;

    for (const rule of this.job.rules) {
      rule.selected = false;
    }
  }

  /**
   * Select all rules with errors
   */
  selectAllErrors(): void {
    if (!this.job) return;

    for (const rule of this.job.rules) {
      if (!rule.validation.isValid) {
        rule.selected = true;
      }
    }
  }

  /**
   * Select all rules with warnings (but valid)
   */
  selectAllWarnings(): void {
    if (!this.job) return;

    for (const rule of this.job.rules) {
      const hasWarning = rule.validation.issues.some((i) => i.severity === 'warning');
      if (hasWarning && rule.validation.isValid && !rule.validation.isDuplicate) {
        rule.selected = true;
      }
    }
  }

  /**
   * Select all duplicate rules
   */
  selectAllDuplicates(): void {
    if (!this.job) return;

    for (const rule of this.job.rules) {
      if (rule.validation.isDuplicate) {
        rule.selected = true;
      }
    }
  }

  /**
   * Select rules by category (toggleable)
   */
  selectByCategory(category: 'valid' | 'warning' | 'error' | 'duplicate', select: boolean): void {
    if (!this.job) return;

    for (const rule of this.job.rules) {
      const hasError = !rule.validation.isValid;
      const hasWarning = rule.validation.issues.some((i) => i.severity === 'warning');
      const isDuplicate = rule.validation.isDuplicate;
      const isValid = rule.validation.isValid && !isDuplicate;

      let matches = false;
      switch (category) {
        case 'error':
          matches = hasError;
          break;
        case 'warning':
          matches = hasWarning && isValid;
          break;
        case 'duplicate':
          matches = isDuplicate;
          break;
        case 'valid':
          matches = isValid && !hasWarning;
          break;
      }

      if (matches) {
        rule.selected = select;
      }
    }
  }

  /**
   * Get rules filtered by criteria
   */
  getFilteredRules(filter: {
    status?: ('valid' | 'warning' | 'error' | 'duplicate')[];
    selected?: boolean;
    search?: string;
  }): ValidatedRule[] {
    if (!this.job) return [];

    return this.job.rules.filter((rule) => {
      // Filter by status
      if (filter.status && filter.status.length > 0) {
        const hasError = !rule.validation.isValid;
        const hasWarning = rule.validation.issues.some((i) => i.severity === 'warning');
        const isDuplicate = rule.validation.isDuplicate;

        const matches =
          (filter.status.includes('error') && hasError) ||
          (filter.status.includes('warning') && hasWarning && !hasError) ||
          (filter.status.includes('duplicate') && isDuplicate) ||
          (filter.status.includes('valid') && rule.validation.isValid && !isDuplicate && !hasWarning);

        if (!matches) return false;
      }

      // Filter by selection
      if (filter.selected !== undefined && rule.selected !== filter.selected) {
        return false;
      }

      // Filter by search
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const titleMatch = rule.parsed.title.toLowerCase().includes(searchLower);
        const idMatch = rule.parsed.sourceId.toLowerCase().includes(searchLower);
        if (!titleMatch && !idMatch) return false;
      }

      return true;
    });
  }

  /**
   * Generate vector embeddings for imported detections.
   * Runs as a post-insert phase. Failures here don't fail the import —
   * detections are already persisted, embeddings can be backfilled later.
   */
  private async generateEmbeddings(detectionIds: string[]): Promise<void> {
    if (this.aborted || !this.job) return;

    this.updateStatus('embedding');
    this.updateProgress({
      embeddingTotal: detectionIds.length,
      embeddingGenerated: 0,
      embeddingErrors: 0,
    });

    const BATCH_SIZE = 50;
    let totalGenerated = 0;
    let totalErrors = 0;

    for (let i = 0; i < detectionIds.length; i += BATCH_SIZE) {
      if (this.aborted) break;

      const batch = detectionIds.slice(i, i + BATCH_SIZE);

      try {
        const result = await generateBatchDetectionEmbeddings(batch);
        totalGenerated += result.generated;
        totalErrors += result.errors;
      } catch (err) {
        // Log but don't fail — embeddings can be backfilled from Sync page
        console.warn('Embedding batch failed, will need backfill:', err);
        totalErrors += batch.length;
      }

      this.updateProgress({
        embeddingGenerated: totalGenerated,
        embeddingErrors: totalErrors,
      });

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < detectionIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    // Log summary
    if (totalErrors > 0) {
      this.addError({
        timestamp: new Date().toISOString(),
        phase: 'embedding',
        code: 'EMBEDDING_PARTIAL',
        message: `Generated ${totalGenerated}/${detectionIds.length} embeddings (${totalErrors} failed — use Sync page to backfill)`,
        recoverable: true,
      });
    }
  }

  /**
   * Submit a batch embedding job via Gemini Batch API (50% cost).
   * Fire-and-forget — the batch-embedding edge function picks up all unembedded items.
   */
  private async submitBatchEmbeddings(): Promise<void> {
    if (this.aborted || !this.job) return;

    this.updateStatus('embedding');
    this.updateProgress({
      embeddingTotal: 0,
      embeddingGenerated: 0,
      embeddingErrors: 0,
    });

    try {
      const batchResult = await submitBatchJob();
      this.updateProgress({
        embeddingBatchJobId: batchResult.jobId,
        embeddingTotal: batchResult.totalItems,
      });
    } catch (err) {
      console.warn('Batch embedding submission failed:', err);
      this.addError({
        timestamp: new Date().toISOString(),
        phase: 'embedding',
        code: 'BATCH_SUBMIT_FAILED',
        message: `Batch embedding submission failed: ${err instanceof Error ? err.message : 'Unknown error'}. Use Data Sync page to create embeddings.`,
        recoverable: true,
      });
    }
  }

  /**
   * Resolve MITRE data for detections (populate mitreTactics and mitreTechniques)
   */
  private async resolveMitreData(detections: Partial<Detection>[]): Promise<void> {
    // Collect all unique technique IDs
    const allTechniqueIds = new Set<string>();
    for (const detection of detections) {
      if (detection.mitreAttackIds) {
        detection.mitreAttackIds.forEach((id) => allTechniqueIds.add(id));
      }
    }

    if (allTechniqueIds.size === 0) return;

    // Batch resolve all techniques
    const resolvedMap = await batchResolveTechniques(Array.from(allTechniqueIds));

    // Apply resolved data to each detection
    for (const detection of detections) {
      if (!detection.mitreAttackIds || detection.mitreAttackIds.length === 0) continue;

      const tactics = new Set<string>();
      const techniques: string[] = [];

      for (const id of detection.mitreAttackIds) {
        const resolved = resolvedMap.get(id.toUpperCase());
        if (resolved) {
          if (resolved.tactic && resolved.tactic !== 'Unknown') {
            tactics.add(resolved.tactic);
          }
          if (resolved.name && resolved.name !== 'Unknown Technique') {
            techniques.push(resolved.name);
          }
        }
      }

      detection.mitreTactics = Array.from(tactics);
      detection.mitreTechniques = techniques;
    }
  }

  /**
   * Save job to database when import starts
   */
  private async saveJobToDatabase(userId: string): Promise<void> {
    if (!this.job) return;

    try {
      const jobRecord = {
        id: this.job.id,
        user_id: userId,
        source_type: this.job.config.sourceType,
        source_url: this.job.config.sourceUrl || null,
        source_vendor: this.job.config.vendor || 'mixed',
        target_library: this.job.config.targetLibrary,
        duplicate_strategy: this.job.config.duplicateStrategy || 'skip',
        status: 'inserting' as const,
        total_files: this.job.progress.totalFiles,
        processed_files: this.job.progress.processedFiles,
        success_count: 0,
        failure_count: 0,
        skip_count: 0,
        warning_count: this.job.progress.warningRules,
        imported_detection_ids: [],
        errors: this.job.errors,
        warnings: this.job.warnings,
        started_at: new Date().toISOString(),
        created_at: this.job.createdAt,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('bulk_import_jobs').insert(jobRecord);

      if (error) {
        console.error('Failed to save job to database:', error);
        // Don't fail the import if we can't save the job record
      }
    } catch (error) {
      console.error('Error saving job to database:', error);
    }
  }

  /**
   * Update job in database when import completes
   */
  private async updateJobInDatabase(result: ImportJobResult): Promise<void> {
    if (!this.job) return;

    try {
      const { error } = await supabase
        .from('bulk_import_jobs')
        .update({
          status: result.successCount > 0 || result.failureCount === 0 ? 'completed' : 'failed',
          success_count: result.successCount,
          failure_count: result.failureCount,
          skip_count: result.skipCount,
          warning_count: result.warningCount,
          imported_detection_ids: result.importedDetectionIds,
          errors: this.job.errors,
          warnings: this.job.warnings,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', this.job.id);

      if (error) {
        console.error('Failed to update job in database:', error);
      }
    } catch (error) {
      console.error('Error updating job in database:', error);
    }
  }

  /** Persist a user cancellation without losing rollback metadata for completed batches. */
  private async updateCancelledJobInDatabase(result: ImportJobResult): Promise<void> {
    if (!this.job) return;

    const { error } = await supabase
      .from('bulk_import_jobs')
      .update({
        status: 'cancelled',
        success_count: result.successCount,
        failure_count: result.failureCount,
        skip_count: result.skipCount,
        imported_detection_ids: result.importedDetectionIds,
        errors: this.job.errors,
        warnings: this.job.warnings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', this.job.id);

    if (error) {
      console.error('Failed to mark import job as cancelled:', error);
    }
  }

  /**
   * Reset the job manager
   */
  reset(): void {
    this.job = null;
    this.callbacks = {};
    this.aborted = false;
    this.embeddingStrategy = 'realtime';
    duplicateDetector.clearCache();
  }
}

/**
 * Generate auto-applied tags for imported detections based on job metadata and detection quality.
 */
function generateImportTags(
  detection: Partial<Detection>,
  jobId: string,
  sourceName: string,
  isUpdate: boolean,
): string[] {
  const tags: string[] = [];
  const shortId = jobId.slice(0, 8);
  const today = new Date().toISOString().slice(0, 10);

  tags.push(`import:${shortId}`);
  tags.push(`source:${sourceName.toLowerCase().replace(/\s+/g, '-')}`);
  tags.push(`import-date:${today}`);

  if (isUpdate) {
    tags.push('bulk-updated');
  }

  // Quality-based tags
  const score = detection.qualityScore ?? 0;
  if (score < 70) {
    tags.push('needs-enrichment');
  }

  if (!detection.mitreTactics?.length && !detection.mitreTechniques?.length) {
    tags.push('needs-mitre');
  }

  if (!detection.description || detection.description.length < 20) {
    tags.push('needs-description');
  }

  if (!detection.references?.length) {
    tags.push('needs-references');
  }

  return tags;
}

// Singleton instance
export const bulkImportJobManager = new BulkImportJobManager();
