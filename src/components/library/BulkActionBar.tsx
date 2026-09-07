/**
 * BulkActionBar - Floating action bar for bulk operations on selected detections
 * Supports both page-level selections and "select all matching filters" for server-side bulk ops
 */

import React, { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { LibraryType } from '../../types';
import { LIBRARY_PRODUCTION } from '../../constants/library';
import type { IconName } from '../Icon';

// Design tokens
const SOLID_TERTIARY = '#783264';
const SOLID_BLUE = '#005091';

interface BulkActionBarProps {
  isProcessing?: boolean;
  processingMessage?: string;
  selectedCount: number;
  selectedIds: string[];
  libraryType: LibraryType;
  onClearSelection: () => void;
  onSelectAll: () => void;
  totalCount: number; // Visible on current page
  totalFilteredCount?: number; // Total matching filters (from server)
  currentFilters?: Record<string, any>; // Current active filters for server-side ops
  externalSelectAllMatching?: boolean; // Controlled from parent (e.g. banner click)
  onSelectAllMatchingChange?: (value: boolean) => void; // Notify parent of mode changes
  // Action handlers (by ID - page level)
  onDelete?: (ids: string[]) => Promise<any>;
  onExport?: (ids: string[]) => void;
  onChangeStatus?: (ids: string[], status: string) => Promise<any>;
  onChangeSeverity?: (ids: string[], severity: string) => Promise<any>;
  onAddTags?: (ids: string[], tags: string[]) => Promise<any>;
  onCopyToLibrary?: (ids: string[]) => Promise<any>;
  onPublishToUniversal?: (ids: string[]) => Promise<any>;
  onDeploy?: (ids: string[]) => void;
  onAddToPack?: (ids: string[]) => void;
  // Server-side bulk actions (by filter)
  onDeleteByFilter?: (filters: Record<string, any>) => Promise<any>;
  onChangeStatusByFilter?: (filters: Record<string, any>, status: string) => Promise<any>;
  onChangeSeverityByFilter?: (filters: Record<string, any>, severity: string) => Promise<any>;
}

const STATUS_OPTIONS = ['Draft', 'Backlog', 'Development', 'Review', 'Testing', 'Production', 'Deprecated', 'Archived'];
const SEVERITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low', 'Informational'];

// Dropdown component for actions with sub-options
const ActionDropdown: React.FC<{
  label: string;
  icon: IconName;
  options: string[];
  onSelect: (option: string) => void;
  disabled?: boolean;
}> = ({ label, icon, options, onSelect, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="h-9 px-3 text-sm font-medium rounded-lg text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
      >
        <Icon name={icon} className="w-4 h-4" />
        <span>{label}</span>
        <Icon name="chevron-down" className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 w-44 bg-surface-container border border-outline-variant/30 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto py-1">
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => { onSelect(opt); setIsOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  isProcessing,
  processingMessage,
  selectedCount,
  selectedIds,
  libraryType,
  onClearSelection,
  onSelectAll,
  totalCount,
  totalFilteredCount,
  currentFilters,
  externalSelectAllMatching,
  onSelectAllMatchingChange,
  onDelete,
  onExport,
  onChangeStatus,
  onChangeSeverity,
  onAddTags,
  onCopyToLibrary,
  onPublishToUniversal,
  onDeploy,
  onAddToPack,
  onDeleteByFilter,
  onChangeStatusByFilter,
  onChangeSeverityByFilter,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [_internalSelectAll, _setInternalSelectAll] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'delete' | 'status' | 'severity'; value?: string } | null>(null);

  // Use external prop if provided, otherwise internal state
  const selectAllMatchingMode = externalSelectAllMatching ?? _internalSelectAll;
  const setSelectAllMatchingMode = (value: boolean) => {
    _setInternalSelectAll(value);
    onSelectAllMatchingChange?.(value);
  };

  // Reset select all matching mode when selection changes
  useEffect(() => {
    if (selectedCount === 0) {
      setSelectAllMatchingMode(false);
    }
  }, [selectedCount]);

  // Whether we can use "select all matching" mode
  const hasFilters = currentFilters && Object.keys(currentFilters).some(k => {
    const v = currentFilters[k];
    return v && (Array.isArray(v) ? v.length > 0 : true);
  });
  const showSelectAllMatching = totalFilteredCount !== undefined && totalFilteredCount > totalCount && hasFilters;
  const effectiveCount = selectAllMatchingMode ? totalFilteredCount! : selectedCount;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      if (selectAllMatchingMode && onDeleteByFilter && currentFilters) {
        await onDeleteByFilter(currentFilters);
      } else if (onDelete) {
        await onDelete(selectedIds);
      }
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setPendingAction(null);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (selectAllMatchingMode && onChangeStatusByFilter && currentFilters) {
      // Show confirmation for bulk operations
      setPendingAction({ type: 'status', value: status });
      setShowDeleteConfirm(true);
    } else if (onChangeStatus) {
      await onChangeStatus(selectedIds, status);
    }
  };

  const handleSeverityChange = async (severity: string) => {
    if (selectAllMatchingMode && onChangeSeverityByFilter && currentFilters) {
      setPendingAction({ type: 'severity', value: severity });
      setShowDeleteConfirm(true);
    } else if (onChangeSeverity) {
      await onChangeSeverity(selectedIds, severity);
    }
  };

  const handleConfirmedAction = async () => {
    if (!pendingAction) return;

    setIsDeleting(true);
    try {
      if (pendingAction.type === 'delete') {
        await handleDelete();
      } else if (pendingAction.type === 'status' && onChangeStatusByFilter && currentFilters && pendingAction.value) {
        await onChangeStatusByFilter(currentFilters, pendingAction.value);
      } else if (pendingAction.type === 'severity' && onChangeSeverityByFilter && currentFilters && pendingAction.value) {
        await onChangeSeverityByFilter(currentFilters, pendingAction.value);
      }
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setPendingAction(null);
      setSelectAllMatchingMode(false);
      onClearSelection();
    }
  };

  const handleExport = () => {
    if (onExport) {
      onExport(selectedIds);
    }
  };

  const handleCopyToLibrary = async () => {
    if (onCopyToLibrary) {
      await onCopyToLibrary(selectedIds);
    }
  };

  const handlePublishToUniversal = async () => {
    if (onPublishToUniversal) {
      await onPublishToUniversal(selectedIds);
    }
  };

  const handleSelectAllMatching = () => {
    setSelectAllMatchingMode(true);
  };

  if (selectedCount === 0 && !selectAllMatchingMode) return null;

  const allPageSelected = selectedCount === totalCount;
  const isUserLibrary = libraryType === LIBRARY_PRODUCTION;

  // Confirmation modal content based on action type
  const getConfirmationContent = () => {
    if (pendingAction?.type === 'status') {
      return {
        icon: 'circle' as const,
        iconBg: 'bg-primary/10',
        iconColor: 'text-primary',
        title: `Change status of ${effectiveCount.toLocaleString()} detection${effectiveCount > 1 ? 's' : ''}?`,
        description: `This will set the status to "${pendingAction.value}" for all ${selectAllMatchingMode ? 'matching' : 'selected'} detections.`,
        buttonText: 'Update Status',
        buttonClass: 'bg-primary text-on-primary',
      };
    }
    if (pendingAction?.type === 'severity') {
      return {
        icon: 'alert-triangle' as const,
        iconBg: 'bg-warning/10',
        iconColor: 'text-warning',
        title: `Change severity of ${effectiveCount.toLocaleString()} detection${effectiveCount > 1 ? 's' : ''}?`,
        description: `This will set the severity to "${pendingAction.value}" for all ${selectAllMatchingMode ? 'matching' : 'selected'} detections.`,
        buttonText: 'Update Severity',
        buttonClass: 'bg-warning text-on-warning',
      };
    }
    return {
      icon: 'alert-triangle' as const,
      iconBg: 'bg-error/10',
      iconColor: 'text-error',
      title: `Delete ${effectiveCount.toLocaleString()} detection${effectiveCount > 1 ? 's' : ''}?`,
      description: `This action cannot be undone. ${selectAllMatchingMode ? 'All detections matching your current filters' : 'The selected detections'} will be permanently removed.`,
      buttonText: 'Delete',
      buttonClass: 'bg-error text-on-error',
    };
  };

  const confirmContent = getConfirmationContent();

  return (
    <>
      {/* Floating action bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200">
        <div className="relative bg-surface-container-high border border-outline-variant/30 rounded-2xl shadow-2xl px-3 py-2.5 flex items-center gap-2">
          {isProcessing && (
            <div className="absolute inset-0 bg-surface-container/80 backdrop-blur-sm rounded-xl flex items-center justify-center gap-3 z-10">
              <Icon name="loader" className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm font-medium text-on-surface">{processingMessage || 'Processing...'}</span>
            </div>
          )}
          {/* Selection count chip */}
          <div className="flex items-center gap-2 pr-2 border-r border-outline-variant/30">
            <div
              className="min-w-7 h-7 px-1.5 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: selectAllMatchingMode ? `${SOLID_BLUE}20` : `${SOLID_TERTIARY}20` }}
            >
              <span className="text-sm font-bold" style={{ color: selectAllMatchingMode ? SOLID_BLUE : SOLID_TERTIARY }}>
                {selectAllMatchingMode ? totalFilteredCount?.toLocaleString() : selectedCount}
              </span>
            </div>
            <span className="text-sm text-on-surface-variant">
              {selectAllMatchingMode ? 'matching' : 'selected'}
            </span>
          </div>

          {/* Selection controls */}
          <div className="flex items-center gap-0.5">
            {!allPageSelected && !selectAllMatchingMode && (
              <button
                onClick={onSelectAll}
                className="h-8 px-2.5 text-sm font-medium rounded-lg text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all"
              >
                Select Page ({totalCount})
              </button>
            )}

            {allPageSelected && showSelectAllMatching && !selectAllMatchingMode && (
              <button
                onClick={handleSelectAllMatching}
                className="h-8 px-2.5 text-sm font-medium rounded-lg transition-all inline-flex items-center gap-1.5"
                style={{ color: SOLID_BLUE, backgroundColor: `${SOLID_BLUE}10` }}
              >
                <Icon name="check-check" className="w-3.5 h-3.5" />
                All {totalFilteredCount?.toLocaleString()} matching
              </button>
            )}

            {selectAllMatchingMode && (
              <button
                onClick={() => setSelectAllMatchingMode(false)}
                className="h-8 px-2.5 text-sm font-medium rounded-lg text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all inline-flex items-center gap-1.5"
              >
                <Icon name="corner-up-left" className="w-3.5 h-3.5" />
                Page only
              </button>
            )}

            <button
              onClick={onClearSelection}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all"
              title="Clear selection"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>

          <div className="w-px h-5 bg-outline-variant/30" />

          {/* Actions */}
          <div className="flex items-center gap-0.5">
            {/* Status change - only for production library */}
            {isUserLibrary && (onChangeStatus || onChangeStatusByFilter) && (
              <ActionDropdown
                label="Status"
                icon="circle"
                options={STATUS_OPTIONS}
                onSelect={handleStatusChange}
              />
            )}

            {/* Severity change - only for production library */}
            {isUserLibrary && (onChangeSeverity || onChangeSeverityByFilter) && (
              <ActionDropdown
                label="Severity"
                icon="alert-triangle"
                options={SEVERITY_OPTIONS}
                onSelect={handleSeverityChange}
              />
            )}

            {/* Promote to Production - only for Lab (universal) library, not in select-all-matching mode */}
            {!isUserLibrary && onPublishToUniversal && !selectAllMatchingMode && (
              <button
                onClick={handlePublishToUniversal}
                className="h-8 px-2.5 text-sm font-medium rounded-lg transition-all inline-flex items-center gap-1.5 hover:brightness-110 text-white"
                style={{ backgroundColor: SOLID_BLUE }}
              >
                <Icon name="publish" className="w-3.5 h-3.5" />
                <span>Promote</span>
              </button>
            )}

            {/* Fork to Lab - only for Production (user) library, not available in select-all-matching mode */}
            {isUserLibrary && onCopyToLibrary && !selectAllMatchingMode && (
              <button
                onClick={handleCopyToLibrary}
                className="h-8 px-2.5 text-sm font-medium rounded-lg text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all inline-flex items-center gap-1.5"
              >
                <Icon name="copy" className="w-3.5 h-3.5" />
                <span>Fork to Lab</span>
              </button>
            )}

            {/* Deploy to SIEM - not available in select-all-matching mode */}
            {onDeploy && !selectAllMatchingMode && (
              <button
                onClick={() => onDeploy(selectedIds)}
                className="h-8 px-2.5 text-sm font-medium rounded-lg text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all inline-flex items-center gap-1.5"
              >
                <Icon name="upload" className="w-3.5 h-3.5" />
                <span>Deploy</span>
              </button>
            )}

            {/* Add to Pack - not available in select-all-matching mode */}
            {onAddToPack && !selectAllMatchingMode && (
              <button
                onClick={() => onAddToPack(selectedIds)}
                className="h-8 px-2.5 text-sm font-medium rounded-lg text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all inline-flex items-center gap-1.5"
              >
                <Icon name="archive" className="w-3.5 h-3.5" />
                <span>Add to Pack</span>
              </button>
            )}

            {/* Export - not available in select-all-matching mode */}
            {onExport && !selectAllMatchingMode && (
              <button
                onClick={handleExport}
                className="h-8 px-2.5 text-sm font-medium rounded-lg text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all inline-flex items-center gap-1.5"
              >
                <Icon name="download" className="w-3.5 h-3.5" />
                <span>Export</span>
              </button>
            )}

            {/* Delete - only for production library */}
            {isUserLibrary && (onDelete || onDeleteByFilter) && (
              <button
                onClick={() => {
                  setPendingAction({ type: 'delete' });
                  setShowDeleteConfirm(true);
                }}
                disabled={isDeleting}
                className="h-8 px-2.5 text-sm font-medium rounded-lg text-error hover:bg-error/10 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Icon name="trash" className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-scrim/50 flex items-center justify-center z-[60]" onClick={() => { setShowDeleteConfirm(false); setPendingAction(null); }}>
          <div className="bg-surface-container rounded-2xl shadow-2xl w-[420px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className={`w-12 h-12 rounded-xl ${confirmContent.iconBg} flex items-center justify-center mb-4`}>
                <Icon name={confirmContent.icon} className={`w-6 h-6 ${confirmContent.iconColor}`} />
              </div>
              <h3 className="text-lg font-semibold text-on-surface mb-2">
                {confirmContent.title}
              </h3>
              <p className="text-sm text-on-surface-variant">
                {confirmContent.description}
              </p>

              {selectAllMatchingMode && (
                <div className="mt-4 p-3 bg-surface-container-highest rounded-xl border border-outline-variant/30">
                  <div className="flex items-center gap-2 text-sm">
                    <Icon name="info" className="w-4 h-4 text-on-surface-variant" />
                    <span className="text-on-surface-variant">
                      This is a server-side bulk operation affecting all {totalFilteredCount?.toLocaleString()} detections matching your filters.
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 bg-surface-container-highest/50 border-t border-outline-variant/20">
              <button
                onClick={() => { setShowDeleteConfirm(false); setPendingAction(null); }}
                className="h-10 px-4 text-sm font-medium rounded-xl text-on-surface-variant hover:bg-surface-container-highest transition-all"
              >
                Cancel
              </button>
              <button
                onClick={pendingAction?.type === 'delete' ? handleDelete : handleConfirmedAction}
                disabled={isDeleting}
                className={`h-10 px-5 text-sm font-medium rounded-xl hover:brightness-110 transition-all disabled:opacity-50 inline-flex items-center gap-2 ${confirmContent.buttonClass}`}
              >
                {isDeleting ? (
                  <>
                    <Icon name="spinner" className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Icon name={confirmContent.icon} className="w-4 h-4" />
                    {confirmContent.buttonText}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
