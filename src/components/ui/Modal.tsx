import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';

interface ModalProps {
  /** The action this modal performs — the modal heading (e.g. "Deploy to SIEM"). */
  title: string;
  /**
   * The object the modal acts on, shown in its own labelled band under the
   * header. `label` names what the thing is ("Detection"); `value` is its name.
   */
  subject?: { label: string; value: string };
  /** Called on close — backdrop click, Escape, or the close button. */
  onClose: () => void;
  /** Card width. Defaults to 'lg' (max-w-2xl). */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Optional sticky footer region (actions). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const SIZE_CLASS: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
  xl: 'max-w-6xl',
};

/**
 * Shared modal shell for the app's dialogs.
 *
 * Portals to <body> so it escapes every clipped / stacked ancestor, and sits
 * above the layout's decorative corner overlays (z-[70]).
 *
 * The header carries only the action ("Deploy to SIEM") — it reads like any
 * modal title. The thing being acted on is never mixed into that line; it gets
 * its own band below the header, with an explicit label so the user always
 * knows it is the detection (not a subtitle of the heading).
 *
 * Provides a fixed header, an optional subject band, a scrolling body, an
 * optional sticky footer, backdrop-click / Escape close, body-scroll lock,
 * and focus handling.
 */
export const Modal: React.FC<ModalProps> = ({
  title, subject, onClose, size = 'lg', footer, children,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`modal-${Math.random().toString(36).slice(2, 9)}`).current;

  useEffect(() => {
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={cardRef}
        tabIndex={-1}
        className={`relative flex w-full ${SIZE_CLASS[size]} max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container shadow-2xl outline-none animate-in fade-in zoom-in-95 duration-200`}
      >
        {/* Header — the action only */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-outline-variant px-5 py-3.5">
          <h2 id={titleId} className="text-sm font-semibold text-on-surface">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        {/* Subject band — the labelled object the modal acts on.
            Label and value sit inline on one line. An inline "Detection <name>"
            field cannot be misread as a heading the way a stacked
            small-label / big-value pair can — the label word does the work,
            not the font size. */}
        {subject && (
          <div className="flex shrink-0 items-baseline gap-3 border-b border-outline-variant bg-surface-container-high/50 px-5 py-3">
            <span className="shrink-0 text-xs font-medium text-on-surface-variant">
              {subject.label}
            </span>
            <span className="text-sm font-semibold text-on-surface">
              {subject.value}
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-outline-variant px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
