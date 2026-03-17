/**
 * useBulkImport - Hook for bulk import functionality
 *
 * Provides a simplified interface for bulk import operations.
 */

import { useState, useCallback } from 'react';
import {
  ImportJobConfig,
  ImportJobStatus,
  ImportProgress,
  ImportJobResult,
  ValidatedRule,
  VendorFormat,
} from '../services/bulk-import/types';
import { bulkImportJobManager, parserFactory } from '../services/bulk-import';

interface UseBulkImportOptions {
  onProgress?: (progress: ImportProgress) => void;
  onError?: (error: { code: string; message: string }) => void;
  onComplete?: (result: ImportJobResult) => void;
}

interface UseBulkImportReturn {
  // State
  status: ImportJobStatus;
  progress: ImportProgress | null;
  rules: ValidatedRule[];
  result: ImportJobResult | null;
  errors: Array<{ code: string; message: string }>;
  isLoading: boolean;

  // Actions
  startImport: (config: ImportJobConfig) => Promise<ValidatedRule[]>;
  executeImport: (userId: string) => Promise<ImportJobResult>;
  abort: () => void;
  reset: () => void;

  // Rule management
  toggleRule: (index: number) => void;
  selectAll: () => void;
  deselectAll: () => void;
  getSelectedCount: () => number;

  // Utilities
  getSupportedFormats: () => VendorFormat[];
  getSummary: () => {
    total: number;
    valid: number;
    warnings: number;
    errors: number;
    duplicates: number;
    selected: number;
  };
}

export function useBulkImport(options: UseBulkImportOptions = {}): UseBulkImportReturn {
  const [status, setStatus] = useState<ImportJobStatus>('idle');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [rules, setRules] = useState<ValidatedRule[]>([]);
  const [result, setResult] = useState<ImportJobResult | null>(null);
  const [errors, setErrors] = useState<Array<{ code: string; message: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Start import process (fetch, parse, validate)
  const startImport = useCallback(
    async (config: ImportJobConfig): Promise<ValidatedRule[]> => {
      setIsLoading(true);
      setErrors([]);
      setResult(null);

      // Create job
      bulkImportJobManager.createJob(config);

      // Set up callbacks
      bulkImportJobManager.setCallbacks({
        onStatusChange: (newStatus) => {
          setStatus(newStatus);
        },
        onProgress: (newProgress) => {
          setProgress(newProgress);
          options.onProgress?.(newProgress);
        },
        onError: (error) => {
          const errorObj = { code: error.code, message: error.message };
          setErrors((prev) => [...prev, errorObj]);
          options.onError?.(errorObj);
        },
        onComplete: (importResult) => {
          setResult(importResult);
          options.onComplete?.(importResult);
        },
      });

      try {
        const validatedRules = await bulkImportJobManager.runToPreview();
        setRules(validatedRules);
        setIsLoading(false);
        return validatedRules;
      } catch (error) {
        setIsLoading(false);
        throw error;
      }
    },
    [options]
  );

  // Execute import for selected rules
  const executeImport = useCallback(
    async (userId: string): Promise<ImportJobResult> => {
      setIsLoading(true);
      const selectedRules = rules.filter((r) => r.selected);

      try {
        const importResult = await bulkImportJobManager.executeImport(selectedRules, userId);
        setResult(importResult);
        setIsLoading(false);
        return importResult;
      } catch (error) {
        setIsLoading(false);
        throw error;
      }
    },
    [rules]
  );

  // Abort current operation
  const abort = useCallback(() => {
    bulkImportJobManager.abort();
    setStatus('cancelled');
    setIsLoading(false);
  }, []);

  // Reset all state
  const reset = useCallback(() => {
    bulkImportJobManager.reset();
    setStatus('idle');
    setProgress(null);
    setRules([]);
    setResult(null);
    setErrors([]);
    setIsLoading(false);
  }, []);

  // Toggle rule selection
  const toggleRule = useCallback((index: number) => {
    setRules((prev) => {
      const newRules = [...prev];
      if (newRules[index]) {
        newRules[index] = { ...newRules[index], selected: !newRules[index].selected };
      }
      return newRules;
    });
  }, []);

  // Select all valid rules
  const selectAll = useCallback(() => {
    setRules((prev) =>
      prev.map((r) => ({
        ...r,
        selected: r.validation.isValid && !r.validation.isDuplicate,
      }))
    );
  }, []);

  // Deselect all rules
  const deselectAll = useCallback(() => {
    setRules((prev) => prev.map((r) => ({ ...r, selected: false })));
  }, []);

  // Get count of selected rules
  const getSelectedCount = useCallback(() => {
    return rules.filter((r) => r.selected).length;
  }, [rules]);

  // Get supported formats
  const getSupportedFormats = useCallback((): VendorFormat[] => {
    return parserFactory.getAvailableFormats();
  }, []);

  // Get summary statistics
  const getSummary = useCallback(() => {
    const valid = rules.filter((r) => r.validation.isValid && !r.validation.isDuplicate).length;
    const warnings = rules.filter(
      (r) => r.validation.issues.some((i) => i.severity === 'warning') && r.validation.isValid
    ).length;
    const errorsCount = rules.filter((r) => !r.validation.isValid).length;
    const duplicates = rules.filter((r) => r.validation.isDuplicate).length;
    const selected = rules.filter((r) => r.selected).length;

    return {
      total: rules.length,
      valid,
      warnings,
      errors: errorsCount,
      duplicates,
      selected,
    };
  }, [rules]);

  return {
    status,
    progress,
    rules,
    result,
    errors,
    isLoading,
    startImport,
    executeImport,
    abort,
    reset,
    toggleRule,
    selectAll,
    deselectAll,
    getSelectedCount,
    getSupportedFormats,
    getSummary,
  };
}
