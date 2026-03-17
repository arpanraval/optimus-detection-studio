/**
 * Bulk Import Module
 *
 * Public API for bulk importing detection rules from various vendors.
 *
 * Required dependencies (add to package.json):
 *   bun add js-yaml jszip
 *   bun add -d @types/js-yaml
 *
 * Usage:
 *   import { bulkImportJobManager, parserFactory } from './services/bulk-import';
 *
 *   // Create and run an import job
 *   const job = bulkImportJobManager.createJob({
 *     sourceType: 'zip',
 *     sourceZip: zipFile,
 *     targetLibrary: 'user',
 *     duplicateStrategy: 'skip',
 *   });
 *
 *   // Set callbacks
 *   bulkImportJobManager.setCallbacks({
 *     onProgress: (progress) => console.log(progress),
 *     onComplete: (result) => console.log(result),
 *   });
 *
 *   // Run to preview
 *   const rules = await bulkImportJobManager.runToPreview();
 *
 *   // Execute import
 *   const result = await bulkImportJobManager.executeImport(rules, userId);
 */

// Types
export * from './types';

// Parsers - Only export factory, not individual parsers (to avoid eager js-yaml import)
export { BaseParser } from './parsers/BaseParser';
export { ParserFactory, parserFactory } from './parsers/ParserFactory';
// Individual parsers are loaded lazily via ParserFactory.initialize()
// If you need direct access: import { SigmaParser } from './parsers/SigmaParser'

// Normalizers
export { DetectionNormalizer, detectionNormalizer } from './normalizers/DetectionNormalizer';
export type { NormalizationOptions } from './normalizers/DetectionNormalizer';

// Validators
export { ValidationPipeline, validationPipeline } from './validators/ValidationPipeline';
export type { ValidationOptions } from './validators/ValidationPipeline';
export { DuplicateDetector, duplicateDetector } from './validators/DuplicateDetector';

// Fetchers
export { ZipFetcher, zipFetcher } from './fetchers/ZipFetcher';
export type { ZipFetchOptions } from './fetchers/ZipFetcher';
export { FileFetcher, fileFetcher } from './fetchers/FileFetcher';
export type { FileFetchOptions } from './fetchers/FileFetcher';

// Persistence
export { BatchInserter, batchInserter } from './persistence/BatchInserter';
export type { BatchInsertOptions } from './persistence/BatchInserter';

// Fetchers - GitHub
export { GitHubFetcher, githubFetcher } from './fetchers/GitHubFetcher';
export type { GitHubFetchOptions } from './fetchers/GitHubFetcher';

// Utilities
export { categorizeError, getCategoryDisplayInfo, generateErrorReport } from './utils/errorCategorizer';
export {
  calculateCompositeProgress,
  calculateETA,
  formatDuration,
  formatDurationMs,
  getPhaseLabel,
  calculateThroughput,
} from './utils/progressCalculator';

// Orchestrator
export { BulkImportJobManager, bulkImportJobManager } from './orchestrator/BulkImportJobManager';
export type { ImportJobCallbacks } from './orchestrator/BulkImportJobManager';
