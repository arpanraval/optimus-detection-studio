/**
 * BulkImportContext - State management for bulk import operations
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode } from 'react';
import {
  ImportJob,
  ImportJobConfig,
  ImportJobStatus,
  ImportProgress,
  ImportJobResult,
  ValidatedRule,
  WizardStep,
  ReconReport,
  RateLimitInfo,
  EmbeddingStrategy,
} from '../services/bulk-import/types';
import { bulkImportJobManager } from '../services/bulk-import';
import { logAuditEvent } from '../lib/audit';


interface BulkImportContextValue {
  // Job state
  job: ImportJob | null;
  status: ImportJobStatus;
  progress: ImportProgress | null;
  rules: ValidatedRule[];
  result: ImportJobResult | null;

  // Wizard state
  currentStep: WizardStep;
  setCurrentStep: (step: WizardStep) => void;

  // GitHub token
  githubToken: string | null;
  setGithubToken: (token: string | null) => void;
  saveGithubToken: (token: string) => void;
  clearSavedGithubToken: () => void;

  // Embedding strategy
  embeddingStrategy: EmbeddingStrategy;
  setEmbeddingStrategy: (strategy: EmbeddingStrategy) => void;

  // Recon
  reconReport: ReconReport | null;
  rateLimitInfo: RateLimitInfo | null;
  runReconnaissance: () => Promise<ReconReport>;

  // Actions
  createJob: (config: ImportJobConfig) => ImportJob;
  runToPreview: () => Promise<ValidatedRule[]>;
  executeImport: (selectedRules: ValidatedRule[], userId: string) => Promise<ImportJobResult>;
  abort: () => void;
  reset: () => void;

  // Rule selection
  toggleRuleSelection: (index: number) => void;
  selectAllValid: () => void;
  deselectAll: () => void;
  selectAllErrors: () => void;
  selectAllWarnings: () => void;
  selectAllDuplicates: () => void;
  selectByCategory: (category: 'valid' | 'warning' | 'error' | 'duplicate', select: boolean) => void;
  getSelectedRules: () => ValidatedRule[];

  // Error handling
  errors: Array<{ message: string; code: string }>;
}

const BulkImportContext = createContext<BulkImportContextValue | null>(null);

export function BulkImportProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<ImportJob | null>(null);
  const [status, setStatus] = useState<ImportJobStatus>('idle');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [rules, setRules] = useState<ValidatedRule[]>([]);
  const [result, setResult] = useState<ImportJobResult | null>(null);
  const [currentStep, setCurrentStep] = useState<WizardStep>('source');
  const [errors, setErrors] = useState<Array<{ message: string; code: string }>>([]);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [embeddingStrategy, setEmbeddingStrategy] = useState<EmbeddingStrategy>('realtime');
  const [reconReport, setReconReport] = useState<ReconReport | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);

  // Save GitHub PAT in memory only — never persisted to storage
  const saveGithubToken = useCallback((token: string) => {
    setGithubToken(token);
  }, []);

  const clearSavedGithubToken = useCallback(() => {
    setGithubToken(null);
  }, []);

  // Create a new import job
  const createJob = useCallback((config: ImportJobConfig): ImportJob => {
    const newJob = bulkImportJobManager.createJob(config);

    // Set up callbacks
    bulkImportJobManager.setCallbacks({
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
      },
      onProgress: (newProgress) => {
        setProgress(newProgress);
      },
      onError: (error) => {
        setErrors((prev) => [...prev, { message: error.message, code: error.code }]);
      },
      onComplete: (importResult) => {
        setResult(importResult);
      },
    });

    setJob(newJob);
    setStatus('idle');
    setProgress(newJob.progress);
    setRules([]);
    setResult(null);
    setErrors([]);

    return newJob;
  }, []);

  // Run reconnaissance
  const runReconnaissance = useCallback(async (): Promise<ReconReport> => {
    const report = await bulkImportJobManager.runReconnaissance();
    setReconReport(report);
    if (report.rateLimitInfo) {
      setRateLimitInfo(report.rateLimitInfo);
    }
    return report;
  }, []);

  // Run import to preview stage
  const runToPreview = useCallback(async (): Promise<ValidatedRule[]> => {
    setErrors([]);
    const validatedRules = await bulkImportJobManager.runToPreview();
    const currentJob = bulkImportJobManager.getJob();
    setRules(validatedRules);
    setJob(currentJob);

    // If the job failed internally (runToPreview swallows errors), surface the failure
    if (currentJob?.status === 'failed') {
      const lastError = currentJob.errors[currentJob.errors.length - 1];
      throw new Error(lastError?.message || 'Import failed during processing');
    }

    return validatedRules;
  }, []);

  // Execute the import
  const executeImport = useCallback(
    async (selectedRules: ValidatedRule[], userId: string): Promise<ImportJobResult> => {
      setErrors([]);
      bulkImportJobManager.setEmbeddingStrategy(embeddingStrategy);
      logAuditEvent({
        action: 'bulk_import.started',
        entity_type: 'import',
        details: { rule_count: selectedRules.length, embeddingStrategy },
      });
      const importResult = await bulkImportJobManager.executeImport(selectedRules, userId);
      setResult(importResult);
      setJob(bulkImportJobManager.getJob());
      logAuditEvent({
        action: 'bulk_import.completed',
        entity_type: 'import',
        details: {
          success: importResult.success,
          total_processed: importResult.totalProcessed,
          success_count: importResult.successCount,
          failure_count: importResult.failureCount,
          skip_count: importResult.skipCount,
        },
      });
      return importResult;
    },
    [embeddingStrategy]
  );

  // Abort current import
  const abort = useCallback(() => {
    bulkImportJobManager.abort();
    setStatus('cancelled');
  }, []);

  // Reset all state
  const reset = useCallback(() => {
    bulkImportJobManager.reset();
    setJob(null);
    setStatus('idle');
    setProgress(null);
    setRules([]);
    setResult(null);
    setCurrentStep('source');
    setErrors([]);
    setEmbeddingStrategy('realtime');
    setReconReport(null);
    setRateLimitInfo(null);
  }, []);

  // Toggle rule selection
  const toggleRuleSelection = useCallback((index: number) => {
    bulkImportJobManager.toggleRuleSelection(index);
    setRules([...bulkImportJobManager.getJob()?.rules || []]);
  }, []);

  // Select all valid rules
  const selectAllValid = useCallback(() => {
    bulkImportJobManager.selectAllValid();
    setRules([...bulkImportJobManager.getJob()?.rules || []]);
  }, []);

  // Deselect all rules
  const deselectAll = useCallback(() => {
    bulkImportJobManager.deselectAll();
    setRules([...bulkImportJobManager.getJob()?.rules || []]);
  }, []);

  // Select all error rules
  const selectAllErrors = useCallback(() => {
    bulkImportJobManager.selectAllErrors();
    setRules([...bulkImportJobManager.getJob()?.rules || []]);
  }, []);

  // Select all warning rules
  const selectAllWarnings = useCallback(() => {
    bulkImportJobManager.selectAllWarnings();
    setRules([...bulkImportJobManager.getJob()?.rules || []]);
  }, []);

  // Select all duplicate rules
  const selectAllDuplicates = useCallback(() => {
    bulkImportJobManager.selectAllDuplicates();
    setRules([...bulkImportJobManager.getJob()?.rules || []]);
  }, []);

  // Select rules by category
  const selectByCategory = useCallback((category: 'valid' | 'warning' | 'error' | 'duplicate', select: boolean) => {
    bulkImportJobManager.selectByCategory(category, select);
    setRules([...bulkImportJobManager.getJob()?.rules || []]);
  }, []);

  // Get selected rules
  const getSelectedRules = useCallback((): ValidatedRule[] => {
    return rules.filter((r) => r.selected);
  }, [rules]);

  const value: BulkImportContextValue = useMemo(() => ({
    job,
    status,
    progress,
    rules,
    result,
    currentStep,
    setCurrentStep,
    embeddingStrategy,
    setEmbeddingStrategy,
    githubToken,
    setGithubToken,
    saveGithubToken,
    clearSavedGithubToken,
    reconReport,
    rateLimitInfo,
    runReconnaissance,
    createJob,
    runToPreview,
    executeImport,
    abort,
    reset,
    toggleRuleSelection,
    selectAllValid,
    deselectAll,
    selectAllErrors,
    selectAllWarnings,
    selectAllDuplicates,
    selectByCategory,
    getSelectedRules,
    errors,
  }), [
    job,
    status,
    progress,
    rules,
    result,
    currentStep,
    setCurrentStep,
    embeddingStrategy,
    githubToken,
    setGithubToken,
    saveGithubToken,
    clearSavedGithubToken,
    reconReport,
    rateLimitInfo,
    runReconnaissance,
    createJob,
    runToPreview,
    executeImport,
    abort,
    reset,
    toggleRuleSelection,
    selectAllValid,
    deselectAll,
    selectAllErrors,
    selectAllWarnings,
    selectAllDuplicates,
    selectByCategory,
    getSelectedRules,
    errors,
  ]);

  return (
    <BulkImportContext.Provider value={value}>
      {children}
    </BulkImportContext.Provider>
  );
}

export function useBulkImportContext(): BulkImportContextValue {
  const context = useContext(BulkImportContext);
  if (!context) {
    throw new Error('useBulkImportContext must be used within a BulkImportProvider');
  }
  return context;
}
