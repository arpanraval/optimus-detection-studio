/**
 * BulkActionBar - Floating action bar for bulk operations on selected detections
 * Supports both page-level selections and "select all matching filters" for server-side bulk ops
 */

import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../Icon';
import { useClickOutside } from '../../hooks/useClickOutside';
import { LibraryType } from '../../types';
import { LIBRARY_PRODUCTION } from '../../constants/library';
import type { DeletePreflight } from '../../context/LibraryContext';
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
  /** Resolves which of the targeted rows can actually be removed. Runs before the confirmation. */
  onPreflightDelete?: (ids: string[]) => Promise<DeletePreflight>;
  onPreflightDeleteByFilter?: () => Promise<DeletePreflight>;
  onExport?: (ids: string[]) => void;
  onChangeStatus?: (ids: string[], status: string) => Promise<any>;
  onChangeSeverity?: (ids: string[], severity: string) => Promise<any>;
  onAddTags?: (ids: string[], tags: string[]) => Promise<any>;
  onCopyToLibrary?: (ids: string[]) => Promise<any>;
  onPublishToUniversal?: (ids: string[]) => Promise<any>;
  onDeploy?: (ids: string[]) => void;
  onAddToPack?: (ids: string[]) => void;
  onResolveMitre?: (ids: string[], allMatching: boolean) => void;
  // Server-side bulk actions — operate on everything matching the current filters
  onDeleteByFilter?: () => Promise<any>;
  onChangeStatusByFilter?: (status: string) => Promise<any>;
  onChangeSeverityByFilter?: (severity: string) => Promise<any>;
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
        aria-expanded={isOpen}
        className="w-full h-10 px-3 text-sm font-medium rounded-lg text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
      >
        <Icon name={icon} className="w-4 h-4" />
        <span className="flex-1 text-left">{label}</span>
        <Icon name="chevron-down" className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="ml-5 border-l border-outline-variant/30 py-1">
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
  onPreflightDelete,
  onPreflightDeleteByFilter,
  onExport,
  onChangeStatus,
  onChangeSeverity,
  onAddTags,
  onCopyToLibrary,
  onPublishToUniversal,
  onDeploy,
  onAddToPack,
  onResolveMitre,
  onDeleteByFilter,
  onChangeStatusByFilter,
  onChangeSeverityByFilter,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);
  useClickOutside(moreRef, () => setMoreOpen(false));
  useEffect(() => {
    if (moreOpen) morePanelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [moreOpen]);
  useEffect(() => { setMoreOpen(false); }, [selectedCount, externalSelectAllMatching, isProcessing]);
  const runFromMore = (action: () => void) => {
    setMoreOpen(false);
    moreTriggerRef.current?.focus();
    action();
  };
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [_internalSelectAll, _setInternalSelectAll] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'delete' | 'status' | 'severity'; value?: string } | null>(null);
  // Populated before a delete confirmation opens, so the dialog can name what will be kept back.
  const [preflight, setPreflight] = useState<DeletePreflight | null>(null);
  const [isPreflighting, setIsPreflighting] = useState(false);

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

  /**
   * Run the preflight, then open the confirmation.
   *
   * Nothing is deleted until the user confirms, and only `preflight.deletableIds` is ever sent —
   * rules that are live in a SIEM stay put instead of failing the whole statement.
   */
  const handleRequestDelete = async () => {
    setPendingAction({ type: 'delete' });
    const runPreflight = selectAllMatchingMode ? onPreflightDeleteByFilter : undefined;
    if (!runPreflight && !onPreflightDelete) {
      setPreflight(null);
      setShowDeleteConfirm(true);
      return;
    }
    setIsPreflighting(true);
    setShowDeleteConfirm(true);
    try {
      const result = runPreflight ? await runPreflight() : await onPreflightDelete!(selectedIds);
      setPreflight(result);
    } finally {
      setIsPreflighting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      // With a preflight, delete exactly the rows it cleared. Without one (no handler wired),
      // fall back to the previous behaviour so the bar still works.
      if (preflight) {
        if (preflight.deletableIds.length > 0) await onDelete?.(preflight.deletableIds);
      } else if (selectAllMatchingMode && onDeleteByFilter) {
        await onDeleteByFilter();
      } else if (onDelete) {
        await onDelete(selectedIds);
      }
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setPendingAction(null);
      setPreflight(null);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (selectAllMatchingMode && onChangeStatusByFilter) {
      // Show confirmation for bulk operations
      setPendingAction({ type: 'status', value: status });
      setShowDeleteConfirm(true);
    } else if (onChangeStatus) {
      await onChangeStatus(selectedIds, status);
    }
  };

  const handleSeverityChange = async (severity: string) => {
    if (selectAllMatchingMode && onChangeSeverityByFilter) {
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
      } else if (pendingAction.type === 'status' && onChangeStatusByFilter && pendingAction.value) {
        await onChangeStatusByFilter(pendingAction.value);
      } else if (pendingAction.type === 'severity' && onChangeSeverityByFilter && pendingAction.value) {
        await onChangeSeverityByFilter(pendingAction.value);
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
    // With a preflight, the headline count is what will actually be removed, not what was selected.
    const deletableCount = preflight ? preflight.deletableIds.length : effectiveCount;
    return {
      icon: 'alert-triangle' as const,
      iconBg: 'bg-error/10',
      iconColor: 'text-error',
      title: deletableCount === 0 && preflight
        ? 'Nothing can be deleted'
        : `Delete ${deletableCount.toLocaleString()} detection${deletableCount === 1 ? '' : 's'}?`,
      description: `This action cannot be undone. ${selectAllMatchingMode ? 'All detections matching your current filters' : 'The selected detections'} will be permanently removed from the library, including imported version history. Rules in connected SIEMs are not deleted. Fetching them again can import new library copies.`,
      buttonText: 'Delete',
      buttonClass: 'bg-error text-on-error',
    };
  };

  const confirmContent = getConfirmationContent();
  const isDeleteAction = pendingAction?.type === 'delete';
  const deletableCount = preflight ? preflight.deletableIds.length : effectiveCount;
  // Nothing to confirm while the preflight runs, if it failed, or if every row is protected.
  const confirmDisabled = isDeleteAction && (isPreflighting || !!preflight?.error || (!!preflight && deletableCount === 0));
  const confirmButtonText = isDeleteAction && preflight && preflight.blocked.length > 0
    ? `Delete ${deletableCount.toLocaleString()}`
    : confirmContent.buttonText;

  const closeConfirm = () => {
    setShowDeleteConfirm(false);
    setPendingAction(null);
    setPreflight(null);
  };

  return (
    <>
      {/* A compact action dock: secondary operations stay in one upward-opening panel. */}
      <div aria-label="Bulk detection actions"
        className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] sm:w-max max-w-[calc(100%-2rem)] animate-in slide-in-from-bottom-4 duration-200">
        <div className="relative bg-surface-container-high border border-outline-variant/30 rounded-2xl shadow-2xl p-2 flex flex-col sm:flex-row sm:items-center gap-2 [&_button]:whitespace-nowrap [&_button]:shrink-0 [&_svg]:shrink-0">
          {isProcessing && (
            <div role="status" className="absolute inset-0 bg-surface-container/95 rounded-2xl flex items-center justify-center gap-3 z-20 px-4">
              <Icon name="loader" className="w-5 h-5 shrink-0 animate-spin text-primary" />
              <span className="text-sm font-medium text-on-surface">{processingMessage || 'Processing...'}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 px-1 pb-2 sm:pb-0 sm:pr-3 border-b sm:border-b-0 sm:border-r border-outline-variant/30 shrink-0">
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="min-w-8 h-8 px-2 rounded-lg inline-flex items-center justify-center text-sm font-bold"
                style={{ backgroundColor: selectAllMatchingMode ? `${SOLID_BLUE}15` : `${SOLID_TERTIARY}15`, color: selectAllMatchingMode ? SOLID_BLUE : SOLID_TERTIARY }}>
                {effectiveCount.toLocaleString()}
              </span>
              <span className="text-sm text-on-surface-variant">{selectAllMatchingMode ? 'matching' : 'selected'}</span>
            </div>
            <button onClick={onClearSelection} title="Clear selection" aria-label="Clear selection"
              className="h-9 w-9 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-highest">
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-1.5">
            {onResolveMitre && (
              <button onClick={() => onResolveMitre(selectedIds, !!selectAllMatchingMode)}
                aria-label="Resolve MITRE with AI" title="Analyze selected detection queries with AI and save contextual ATT&CK mappings"
                className="h-10 px-3 text-sm font-medium rounded-xl text-primary bg-primary/10 hover:bg-primary/15 inline-flex items-center gap-2">
                <Icon name="spark" className="w-4 h-4 shrink-0" />
                <span>Resolve MITRE<span className="hidden md:inline"> with AI</span></span>
              </button>
            )}
            {onDeploy && !selectAllMatchingMode && (
              <button onClick={() => onDeploy(selectedIds)}
                className="hidden lg:inline-flex h-10 px-3 text-sm font-medium rounded-xl text-on-surface-variant hover:bg-surface-container-highest items-center gap-2">
                <Icon name="upload" className="w-4 h-4 shrink-0" />Deploy
              </button>
            )}
            {!isUserLibrary && onPublishToUniversal && !selectAllMatchingMode && (
              <button onClick={handlePublishToUniversal}
                className="hidden lg:inline-flex h-10 px-3 text-sm font-medium rounded-xl text-white hover:brightness-110 items-center gap-2"
                style={{ backgroundColor: SOLID_BLUE }}>
                <Icon name="publish" className="w-4 h-4 shrink-0" />Promote
              </button>
            )}
            <div ref={moreRef} className="relative" onKeyDown={event => {
              if (event.key === 'Escape' && moreOpen) {
                event.stopPropagation(); setMoreOpen(false); moreTriggerRef.current?.focus();
              }
            }}>
              <button ref={moreTriggerRef} onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen}
                aria-label="More bulk actions"
                className="h-10 px-3 text-sm font-medium rounded-xl text-on-surface-variant hover:bg-surface-container-highest inline-flex items-center gap-2">
                More<Icon name="chevron-down" className={`w-4 h-4 shrink-0 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
              </button>
              {moreOpen && (
                <div ref={morePanelRef} aria-label="More bulk actions" className="absolute bottom-full right-0 mb-3 w-64 max-w-[calc(100vw-3rem)] max-h-[60dvh] overflow-y-auto rounded-2xl border border-outline-variant/30 bg-surface-container-high shadow-2xl p-1.5">
                  {!allPageSelected && !selectAllMatchingMode && (
                    <button className="w-full text-left px-3 py-2.5 text-sm rounded-lg hover:bg-surface-container-highest" onClick={() => runFromMore(onSelectAll)}>Select page ({totalCount})</button>
                  )}
                  {allPageSelected && showSelectAllMatching && !selectAllMatchingMode && (
                    <button className="w-full text-left px-3 py-2.5 text-sm rounded-lg text-primary hover:bg-primary/10" onClick={() => runFromMore(handleSelectAllMatching)}>Select all {totalFilteredCount?.toLocaleString()} matching</button>
                  )}
                  {selectAllMatchingMode && (
                    <button className="w-full text-left px-3 py-2.5 text-sm rounded-lg hover:bg-surface-container-highest" onClick={() => runFromMore(() => setSelectAllMatchingMode(false))}>Select page only</button>
                  )}
                  {(onChangeStatus || onChangeStatusByFilter) && (
                    <ActionDropdown label="Status" icon="circle" options={STATUS_OPTIONS} onSelect={status => runFromMore(() => { void handleStatusChange(status); })} />
                  )}
                  {(onChangeSeverity || onChangeSeverityByFilter) && (
                    <ActionDropdown label="Severity" icon="alert-triangle" options={SEVERITY_OPTIONS} onSelect={severity => runFromMore(() => { void handleSeverityChange(severity); })} />
                  )}
                  {[
                    { show: !isUserLibrary && !!onPublishToUniversal && !selectAllMatchingMode, label: 'Promote', icon: 'publish' as const, action: handlePublishToUniversal, className: 'lg:hidden' },
                    { show: !!onDeploy && !selectAllMatchingMode, label: 'Deploy to SIEM', icon: 'upload' as const, action: () => onDeploy?.(selectedIds), className: 'lg:hidden' },
                    { show: isUserLibrary && !!onCopyToLibrary && !selectAllMatchingMode, label: 'Fork to Lab', icon: 'copy' as const, action: handleCopyToLibrary },
                    { show: !!onAddToPack && !selectAllMatchingMode, label: 'Add to Pack', icon: 'archive' as const, action: () => onAddToPack?.(selectedIds) },
                    { show: !!onExport && !selectAllMatchingMode, label: 'Export', icon: 'download' as const, action: handleExport },
                  ].filter(action => action.show).map(action => (
                    <button key={action.label} onClick={() => runFromMore(action.action)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-on-surface-variant text-left rounded-lg hover:bg-surface-container-highest ${action.className || ''}`}>
                      <Icon name={action.icon} className="w-4 h-4 shrink-0" />{action.label}
                    </button>
                  ))}
                  {(onDelete || onDeleteByFilter) && (
                    <div className="mt-1 pt-1 border-t border-outline-variant/30">
                      <button onClick={() => runFromMore(() => { void handleRequestDelete(); })} disabled={isDeleting}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-error text-left rounded-lg hover:bg-error/10 disabled:opacity-50">
                        <Icon name="trash" className="w-4 h-4 shrink-0" />Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-scrim/50 flex items-center justify-center z-[60]" onClick={closeConfirm}>
          <div className="bg-surface-container rounded-2xl shadow-2xl w-[460px] max-w-[calc(100%-2rem)] max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 overflow-y-auto">
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

              {isDeleteAction && isPreflighting && (
                <div className="mt-4 flex items-center gap-2 text-sm text-on-surface-variant">
                  <Icon name="spinner" className="w-4 h-4 animate-spin" />
                  Checking which rules can be deleted...
                </div>
              )}

              {isDeleteAction && preflight?.error && (
                <div className="mt-4 p-3 bg-error/10 rounded-xl border border-error/20 text-sm text-error">
                  Could not check these detections: {preflight.error}
                </div>
              )}

              {/* Rules the database will refuse to delete - named, with the reason, so the user
                  can go detach or undeploy them rather than hitting an opaque constraint error. */}
              {isDeleteAction && preflight && preflight.blocked.length > 0 && (
                <div className="mt-4 p-3 bg-surface-container-highest rounded-xl border border-outline-variant/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="shield" className="w-4 h-4 text-warning" />
                    <span className="text-sm font-semibold text-on-surface">
                      {preflight.blocked.length} will be kept
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mb-2">
                    These are still live in a SIEM or hold revision history, so they cannot be deleted.
                    Detach or remove them from the SIEM first.
                  </p>
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {preflight.blocked.slice(0, 20).map(b => (
                      <li key={b.id} className="text-xs">
                        <span className="text-on-surface font-medium">{b.name}</span>
                        <span className="text-on-surface-variant"> &mdash; {b.reason}</span>
                      </li>
                    ))}
                  </ul>
                  {preflight.blocked.length > 20 && (
                    <p className="text-xs text-on-surface-variant mt-1.5">
                      and {preflight.blocked.length - 20} more
                    </p>
                  )}
                </div>
              )}

              {/* Deletable, but something else loses a link. Worth seeing before confirming. */}
              {isDeleteAction && preflight && preflight.warnings.length > 0 && (
                <div className="mt-3 p-3 bg-surface-container-highest rounded-xl border border-outline-variant/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="alert-triangle" className="w-4 h-4 text-warning" />
                    <span className="text-sm font-semibold text-on-surface">
                      {preflight.warnings.length} linked to other rules
                    </span>
                  </div>
                  <ul className="space-y-1 max-h-32 overflow-y-auto">
                    {preflight.warnings.slice(0, 10).map(w => (
                      <li key={w.id} className="text-xs">
                        <span className="text-on-surface font-medium">{w.name}</span>
                        <span className="text-on-surface-variant"> &mdash; {w.reason}</span>
                      </li>
                    ))}
                  </ul>
                  {preflight.warnings.length > 10 && (
                    <p className="text-xs text-on-surface-variant mt-1.5">
                      and {preflight.warnings.length - 10} more
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 bg-surface-container-highest/50 border-t border-outline-variant/20 flex-shrink-0">
              <button
                onClick={closeConfirm}
                className="h-10 px-4 text-sm font-medium rounded-xl text-on-surface-variant hover:bg-surface-container-highest transition-all"
              >
                {confirmDisabled && isDeleteAction && !isPreflighting ? 'Close' : 'Cancel'}
              </button>
              <button
                onClick={pendingAction?.type === 'delete' ? handleDelete : handleConfirmedAction}
                disabled={isDeleting || confirmDisabled}
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
                    {confirmButtonText}
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
