/**
 * ScaleConfirmationDialog - Confirmation dialog for large-scale imports
 * Uses app's M3 design system
 *
 * Shows a warning when importing more than LARGE_IMPORT_THRESHOLD rules,
 * providing transparency about the operation's impact.
 */

import React from 'react';
import { Icon } from '../Icon';
import { LIBRARY_LABELS } from '../../types/detection';
import { LIBRARY_DEVELOPMENT, type LibraryType } from '../../constants/library';

/** Threshold for triggering the scale confirmation dialog */
export const LARGE_IMPORT_THRESHOLD = 500;

interface ScaleConfirmationDialogProps {
  /** Whether the dialog is visible */
  isOpen: boolean;
  /** Called when user confirms */
  onConfirm: () => void;
  /** Called when user cancels */
  onCancel: () => void;
  /** Number of rules to be imported */
  ruleCount: number;
  /** Target library */
  targetLibrary: LibraryType;
  /** Estimated MITRE techniques to be added (optional) */
  mitreCount?: number;
  /** Whether this is a resumable import */
  isResume?: boolean;
}

export function ScaleConfirmationDialog({
  isOpen,
  onConfirm,
  onCancel,
  ruleCount,
  targetLibrary,
  mitreCount,
  isResume = false,
}: ScaleConfirmationDialogProps) {
  const modalRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => modalRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus(), 50);
    return () => { document.removeEventListener('keydown', handleKeyDown); clearTimeout(timer); };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isUniversal = targetLibrary === LIBRARY_DEVELOPMENT;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scale-confirm-title"
        className={`relative bg-surface-container-high rounded-[28px] p-6 max-w-lg mx-4 shadow-xl border ${
          isUniversal
            ? 'border-tertiary/30'
            : 'border-outline-variant/20'
        }`}
      >
        {/* Header with icon */}
        <div className="flex items-start gap-4 mb-4">
          <div
            className={`p-3 rounded-full ${
              isUniversal
                ? 'bg-tertiary-container/30'
                : 'bg-primary-container/30'
            }`}
          >
            <Icon
              name={isUniversal ? 'globe' : 'database'}
              className={`w-6 h-6 ${isUniversal ? 'text-tertiary' : 'text-primary'}`}
            />
          </div>
          <div>
            <h2 id="scale-confirm-title" className="text-xl font-semibold text-on-surface">
              {isResume ? 'Resume Large Import?' : 'Confirm Large Import'}
            </h2>
            <p className="text-sm text-on-surface-variant mt-1">
              You are about to {isResume ? 'resume importing' : 'import'}{' '}
              <span className="font-semibold text-on-surface">{ruleCount.toLocaleString()}</span> rules
            </p>
          </div>
        </div>

        {/* Impact summary */}
        <div className="bg-surface-container rounded-[16px] p-4 mb-4">
          <h3 className="text-sm font-medium text-on-surface mb-3">
            Import Summary
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-surface-variant">Rules to import</span>
              <span className="text-sm font-medium text-on-surface">
                {ruleCount.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-surface-variant">Target library</span>
              <span
                className={`text-sm font-medium ${
                  isUniversal ? 'text-tertiary' : 'text-primary'
                }`}
              >
                {LIBRARY_LABELS[targetLibrary]}
              </span>
            </div>
            {mitreCount !== undefined && mitreCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-surface-variant">New MITRE techniques</span>
                <span className="text-sm font-medium text-secondary">
                  +{mitreCount}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-surface-variant">Estimated batches</span>
              <span className="text-sm font-medium text-on-surface">
                {Math.ceil(ruleCount / 50)} @ 50 rules/batch
              </span>
            </div>
          </div>
        </div>

        {/* Development library warning */}
        {isUniversal && (
          <div className="p-4 bg-tertiary-container/20 border border-tertiary/30 rounded-[12px] mb-4">
            <div className="flex items-start gap-3">
              <Icon name="alert-triangle" className="w-5 h-5 text-tertiary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-tertiary">
                  Organization-Wide Impact
                </p>
                <p className="text-xs text-on-surface-variant mt-1">
                  These rules will be visible to all members of your organization.
                  Ensure you have reviewed the rules before importing.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Safety info */}
        <div className="p-3 bg-secondary-container/20 rounded-[12px] mb-6">
          <div className="flex items-start gap-2">
            <Icon name="shield-check" className="w-4 h-4 text-secondary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-on-surface-variant">
              <span className="font-medium text-secondary">Safety features enabled:</span>{' '}
              Pre-flight permission check, batch checkpointing for resume capability, and
              targeted rollback are active for this import.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 text-sm font-medium text-on-surface-variant hover:bg-surface-container rounded-full transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-3 text-sm font-medium rounded-full transition-colors flex items-center justify-center gap-2 ${
              isUniversal
                ? 'bg-tertiary text-on-tertiary hover:bg-tertiary/90'
                : 'bg-primary text-on-primary hover:bg-primary/90'
            }`}
          >
            <Icon name="upload" className="w-4 h-4" />
            {isResume ? 'Resume Import' : 'Start Import'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ScaleConfirmationDialog;
