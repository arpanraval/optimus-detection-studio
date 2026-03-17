/**
 * NavigationBlockerModal - Modal shown when user tries to navigate during import
 * Uses app's M3 design system
 */

import React from 'react';
import { Icon } from '../Icon';

interface NavigationBlockerModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Called when user chooses to stay */
  onStay: () => void;
  /** Called when user chooses to leave */
  onLeave: () => void;
  /** Custom message */
  message?: string;
  /** Current import progress (optional) */
  progress?: {
    inserted: number;
    total: number;
  };
}

export function NavigationBlockerModal({
  isOpen,
  onStay,
  onLeave,
  message = 'Import in progress. Leaving this page will cancel the current operation.',
  progress,
}: NavigationBlockerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onStay}
      />

      {/* Modal */}
      <div className="relative bg-surface-container-high rounded-[28px] p-6 max-w-md mx-4 shadow-xl border border-outline-variant/20">
        {/* Warning icon */}
        <div className="flex items-center justify-center mb-4">
          <div className="p-4 rounded-full bg-tertiary-container/30">
            <Icon name="alert-triangle" className="w-8 h-8 text-tertiary" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-on-surface text-center mb-2">
          Import in Progress
        </h2>

        {/* Message */}
        <p className="text-on-surface-variant text-center mb-4">
          {message}
        </p>

        {/* Progress indicator if available */}
        {progress && (
          <div className="mb-6 p-4 bg-surface-container rounded-[12px]">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-on-surface-variant">Progress</span>
              <span className="text-on-surface font-medium">
                {progress.inserted} / {progress.total} rules
              </span>
            </div>
            <div className="w-full bg-surface-variant rounded-full h-2">
              <div
                className="h-2 bg-primary rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round((progress.inserted / Math.max(progress.total, 1)) * 100)}%`,
                }}
              />
            </div>
            <p className="text-xs text-on-surface-variant mt-2 text-center">
              Rules already imported will remain in your library if you leave.
            </p>
          </div>
        )}

        {/* Warning message */}
        <div className="p-3 bg-error-container/20 rounded-[12px] mb-6">
          <p className="text-sm text-error text-center">
            <Icon name="alert-circle" className="w-4 h-4 inline mr-1" />
            Leaving now will stop the import. This cannot be undone.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onLeave}
            className="flex-1 px-4 py-3 text-sm font-medium text-error hover:bg-error-container/20 rounded-full transition-colors"
          >
            Leave Anyway
          </button>
          <button
            onClick={onStay}
            className="flex-1 px-4 py-3 text-sm font-medium bg-primary text-on-primary hover:bg-primary/90 rounded-full transition-colors"
          >
            Stay on Page
          </button>
        </div>
      </div>
    </div>
  );
}

export default NavigationBlockerModal;
