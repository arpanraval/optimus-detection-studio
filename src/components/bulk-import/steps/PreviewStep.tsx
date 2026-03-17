/**
 * PreviewStep - Preview and select rules for import
 * Uses app's M3 design system
 */

import React, { useState, useMemo } from 'react';
import { useBulkImportContext } from '../../../context/BulkImportContext';
import { useAppData } from '../../../router/AppDataContext';
import { PreviewFilters, EmbeddingStrategy } from '../../../services/bulk-import/types';
import { PreviewTable } from '../preview/PreviewTable';
import { ScaleConfirmationDialog, LARGE_IMPORT_THRESHOLD } from '../ScaleConfirmationDialog';
import { Icon } from '../../Icon';

// Color scheme
const COLORS = {
  success: '#4D7C6F',
  failure: '#A63D40',
  warning: '#D4A84B',
  brand: '#783264',
  muted: '#78326420',
};

export function PreviewStep() {
  const {
    rules,
    executeImport,
    setCurrentStep,
    selectAllValid,
    deselectAll,
    selectByCategory,
    getSelectedRules,
    job,
    embeddingStrategy,
    setEmbeddingStrategy,
  } = useBulkImportContext();
  const { user } = useAppData();
  const [isImporting, setIsImporting] = useState(false);
  const [showScaleConfirmation, setShowScaleConfirmation] = useState(false);
  const [filters, setFilters] = useState<PreviewFilters>({
    status: [],
    severity: [],
    vendor: [],
    search: '',
    onlySelected: false,
  });
  // Calculate summary stats
  const summary = useMemo(() => {
    const valid = rules.filter((r) => r.validation.isValid && !r.validation.isDuplicate).length;
    const warnings = rules.filter(
      (r) =>
        r.validation.issues.some((i) => i.severity === 'warning') &&
        r.validation.isValid &&
        !r.validation.isDuplicate
    ).length;
    const errors = rules.filter((r) => !r.validation.isValid).length;
    const duplicates = rules.filter((r) => r.validation.isDuplicate).length;
    const selected = rules.filter((r) => r.selected).length;

    return { total: rules.length, valid, warnings, errors, duplicates, selected };
  }, [rules]);

  // Filter rules
  const filteredRules = useMemo(() => {
    return rules.filter((rule) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const titleMatch = rule.parsed.title.toLowerCase().includes(searchLower);
        const idMatch = rule.parsed.sourceId.toLowerCase().includes(searchLower);
        if (!titleMatch && !idMatch) return false;
      }

      // Only selected filter
      if (filters.onlySelected && !rule.selected) return false;

      // Status filter
      if (filters.status.length > 0) {
        const hasError = !rule.validation.isValid;
        const hasWarning = rule.validation.issues.some((i) => i.severity === 'warning');
        const isDuplicate = rule.validation.isDuplicate;
        const isValid = rule.validation.isValid && !isDuplicate;

        const matches =
          (filters.status.includes('error') && hasError) ||
          (filters.status.includes('warning') && hasWarning && !hasError) ||
          (filters.status.includes('duplicate') && isDuplicate) ||
          (filters.status.includes('valid') && isValid && !hasWarning);

        if (!matches) return false;
      }

      return true;
    });
  }, [rules, filters]);

  const handleImportClick = () => {
    if (!user?.id) {
      alert('You must be logged in to import rules');
      return;
    }

    const selectedRules = getSelectedRules();
    if (selectedRules.length === 0) {
      alert('Please select at least one rule to import');
      return;
    }

    // Show confirmation dialog for large imports
    if (selectedRules.length >= LARGE_IMPORT_THRESHOLD) {
      setShowScaleConfirmation(true);
      return;
    }

    // Proceed directly for smaller imports
    performImport();
  };

  const performImport = async () => {
    if (!user?.id) return;

    const selectedRules = getSelectedRules();
    setShowScaleConfirmation(false);
    setIsImporting(true);
    setCurrentStep('importing');

    try {
      await executeImport(selectedRules, user.id);
      setCurrentStep('results');
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      {/* Scale confirmation dialog for large imports */}
      <ScaleConfirmationDialog
        isOpen={showScaleConfirmation}
        onConfirm={performImport}
        onCancel={() => setShowScaleConfirmation(false)}
        ruleCount={summary.selected}
        targetLibrary={job?.config.targetLibrary || 'user'}
      />

    <div className="space-y-6">
      {/* Summary cards - clickable filters */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-surface-container rounded-[12px] p-3 text-center">
          <p className="text-xl font-bold text-on-surface">{summary.total}</p>
          <p className="text-xs text-on-surface-variant">Total</p>
        </div>
        <button
          onClick={() => setFilters((f) => ({ ...f, status: f.status.includes('valid') ? [] : ['valid'] }))}
          className="rounded-[12px] p-3 text-center transition-all hover:opacity-80"
          style={{
            backgroundColor: filters.status.includes('valid') ? `${COLORS.success}25` : `${COLORS.success}15`,
            boxShadow: filters.status.includes('valid') ? `0 0 0 2px ${COLORS.success}` : 'none',
          }}
        >
          <p className="text-xl font-bold" style={{ color: COLORS.success }}>{summary.valid}</p>
          <p className="text-xs text-on-surface-variant">Valid</p>
        </button>
        <button
          onClick={() => setFilters((f) => ({ ...f, status: f.status.includes('warning') ? [] : ['warning'] }))}
          className="rounded-[12px] p-3 text-center transition-all hover:opacity-80"
          style={{
            backgroundColor: filters.status.includes('warning') ? `${COLORS.warning}25` : `${COLORS.warning}15`,
            boxShadow: filters.status.includes('warning') ? `0 0 0 2px ${COLORS.warning}` : 'none',
          }}
        >
          <p className="text-xl font-bold" style={{ color: COLORS.warning }}>{summary.warnings}</p>
          <p className="text-xs text-on-surface-variant">Warnings</p>
        </button>
        <button
          onClick={() => setFilters((f) => ({ ...f, status: f.status.includes('error') ? [] : ['error'] }))}
          className="rounded-[12px] p-3 text-center transition-all hover:opacity-80"
          style={{
            backgroundColor: filters.status.includes('error') ? `${COLORS.failure}25` : `${COLORS.failure}15`,
            boxShadow: filters.status.includes('error') ? `0 0 0 2px ${COLORS.failure}` : 'none',
          }}
        >
          <p className="text-xl font-bold" style={{ color: COLORS.failure }}>{summary.errors}</p>
          <p className="text-xs text-on-surface-variant">Errors</p>
        </button>
        <button
          onClick={() => setFilters((f) => ({ ...f, status: f.status.includes('duplicate') ? [] : ['duplicate'] }))}
          className="rounded-[12px] p-3 text-center transition-all hover:opacity-80"
          style={{
            backgroundColor: filters.status.includes('duplicate') ? COLORS.muted : `${COLORS.brand}10`,
            boxShadow: filters.status.includes('duplicate') ? `0 0 0 2px ${COLORS.brand}60` : 'none',
          }}
        >
          <p className="text-xl font-bold text-on-surface-variant">{summary.duplicates}</p>
          <p className="text-xs text-on-surface-variant">Duplicates</p>
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search rules..."
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-56 pl-9 pr-4 py-1.5 border border-outline-variant/30 rounded-full bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-outline-variant placeholder:text-on-surface-variant/50"
            />
            <Icon name="search" className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2" />
          </div>

          {/* Only selected toggle */}
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filters.onlySelected}
              onChange={(e) => setFilters((f) => ({ ...f, onlySelected: e.target.checked }))}
              className="w-4 h-4 rounded border-outline-variant accent-[#783264]"
            />
            <span className="text-on-surface-variant">Only selected</span>
          </label>

          {/* Clear filters */}
          {(filters.status.length > 0 || filters.search) && (
            <button
              onClick={() => setFilters((f) => ({ ...f, status: [], search: '' }))}
              className="text-xs text-on-surface-variant hover:text-on-surface"
            >
              Reset
            </button>
          )}
        </div>

        {/* Bulk selection */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-on-surface-variant mr-1">Select:</span>
          <button
            onClick={selectAllValid}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-outline-variant/30 hover:bg-surface-container-high transition-colors"
            style={{ color: COLORS.success }}
            title="Select all valid rules"
          >
            <Icon name="check-circle" className="w-3 h-3" />
            <span>Valid</span>
          </button>
          {summary.warnings > 0 && (
            <button
              onClick={() => selectByCategory('warning', true)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-outline-variant/30 hover:bg-surface-container-high transition-colors"
              style={{ color: COLORS.warning }}
              title="Select all with warnings"
            >
              <Icon name="alert-triangle" className="w-3 h-3" />
              <span>Warnings</span>
            </button>
          )}
          {summary.duplicates > 0 && (
            <button
              onClick={() => selectByCategory('duplicate', true)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high transition-colors"
              title="Select all duplicates"
            >
              <Icon name="copy" className="w-3 h-3" />
              <span>Duplicates</span>
            </button>
          )}
          <button
            onClick={deselectAll}
            className="px-2.5 py-1 text-xs text-on-surface-variant hover:bg-surface-container rounded-full transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Rules table */}
      <PreviewTable rules={filteredRules} />

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-outline-variant/30">
        <p className="text-sm text-on-surface-variant">
          {summary.selected} of {summary.total} rules selected for import
        </p>

        {/* Embedding strategy selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-on-surface-variant">Embeddings:</span>
          <div className="flex rounded-full border border-outline-variant/40 overflow-hidden">
            {([
              { value: 'realtime' as EmbeddingStrategy, label: 'Now', title: 'Real-time embedding at full cost' },
              { value: 'batch' as EmbeddingStrategy, label: 'Batch (50% off)', title: 'Async via Gemini Batch API, 50% cheaper' },
              { value: 'skip' as EmbeddingStrategy, label: 'Skip', title: 'Do it later from Data Sync page' },
            ]).map((option) => (
              <button
                key={option.value}
                onClick={() => setEmbeddingStrategy(option.value)}
                title={option.title}
                className="px-3 py-1 text-xs font-medium transition-all border-r last:border-r-0 border-outline-variant/40"
                style={
                  embeddingStrategy === option.value
                    ? { backgroundColor: COLORS.brand, color: 'white' }
                    : {}
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentStep('source')}
            className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container rounded-full transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleImportClick}
            disabled={summary.selected === 0 || isImporting}
            className={`px-6 py-2 rounded-full font-medium transition-all flex items-center gap-2 ${
              summary.selected > 0 && !isImporting
                ? 'text-white hover:opacity-90'
                : 'bg-surface-variant text-on-surface-variant/50 cursor-not-allowed'
            }`}
            style={summary.selected > 0 && !isImporting ? { backgroundColor: COLORS.brand } : {}}
          >
            {isImporting ? (
              <>
                <Icon name="spinner" className="w-4 h-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                Import {summary.selected} Rules
                <Icon name="arrowRight" className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
