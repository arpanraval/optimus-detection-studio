import React, { useEffect, useRef } from 'react';
import { Icon } from '../Icon';
import { Button } from './Button';

export interface ConfirmDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog is closed (cancelled) */
  onClose: () => void;
  /** Callback when action is confirmed */
  onConfirm: () => void;
  /** Dialog title */
  title: string;
  /** Dialog description/message */
  message: string;
  /** Confirm button text */
  confirmLabel?: string;
  /** Cancel button text */
  cancelLabel?: string;
  /** Visual variant - determines confirm button color */
  variant?: 'danger' | 'warning' | 'info';
  /** Icon name to display */
  icon?: string;
  /** Whether confirm action is loading */
  loading?: boolean;
}

/**
 * M3-style Confirmation Dialog
 *
 * Replaces browser confirm() with a styled modal matching the design system.
 * Use for destructive or irreversible actions (delete, bulk operations, etc.)
 *
 * @example
 * <ConfirmDialog
 *   isOpen={showDelete}
 *   onClose={() => setShowDelete(false)}
 *   onConfirm={handleDelete}
 *   title="Delete Detection"
 *   message="This action cannot be undone. The detection will be permanently removed."
 *   variant="danger"
 *   confirmLabel="Delete"
 * />
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  icon,
  loading = false,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap and escape key
  useEffect(() => {
    if (!isOpen) return;

    // Focus the dialog when opened
    dialogRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const variantConfig = {
    danger: {
      iconColor: 'text-error',
      iconBg: 'bg-error/10',
      confirmColor: 'error' as const,
      defaultIcon: 'alert-triangle',
    },
    warning: {
      iconColor: 'text-amber-500',
      iconBg: 'bg-amber-500/10',
      confirmColor: 'primary' as const,
      defaultIcon: 'alert-triangle',
    },
    info: {
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10',
      confirmColor: 'primary' as const,
      defaultIcon: 'info',
    },
  };

  const config = variantConfig[variant];
  const displayIcon = icon || config.defaultIcon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative w-full max-w-md bg-surface-container-high rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-outline-variant/10 outline-none"
      >
        <div className="p-6">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-full ${config.iconBg} flex items-center justify-center mb-4`}>
            <Icon name={displayIcon} className={`w-6 h-6 ${config.iconColor}`} />
          </div>

          {/* Title */}
          <h2 id="confirm-dialog-title" className="text-lg font-semibold text-on-surface mb-2">
            {title}
          </h2>

          {/* Message */}
          <p id="confirm-dialog-message" className="text-sm text-on-surface-variant leading-relaxed">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <Button
            variant="text"
            color="surface"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="filled"
            color={config.confirmColor}
            onClick={onConfirm}
            loading={loading}
            disabled={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
