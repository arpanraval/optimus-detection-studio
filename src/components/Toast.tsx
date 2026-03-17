import React, { useEffect, useState } from 'react';
import { Icon } from './Icon';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  /** Optional action button (e.g., "Undo") */
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastProps {
  toast: ToastMessage;
  onClose: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (toast.duration) {
      const timer = setTimeout(() => {
        setIsExiting(true);
        setTimeout(() => onClose(toast.id), 200);
      }, toast.duration);

      return () => clearTimeout(timer);
    }
  }, [toast, onClose]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onClose(toast.id), 200);
  };

  // Option A: Floating Card Toast with glow effect - Detection Studio colors
  const config = {
    success: {
      icon: 'check',
      iconBg: 'bg-gradient-to-br from-[#4D7C6F] to-[#3d6358]',
      glow: 'shadow-[0_8px_32px_rgba(77,124,111,0.25)]',
      border: 'border-[#4D7C6F]/30',
    },
    error: {
      icon: 'x',
      iconBg: 'bg-gradient-to-br from-[#A63D40] to-[#8a3234]',
      glow: 'shadow-[0_8px_32px_rgba(166,61,64,0.25)]',
      border: 'border-[#A63D40]/30',
    },
    warning: {
      icon: 'alert-triangle',
      iconBg: 'bg-gradient-to-br from-[#F97316] to-[#ea580c]',
      glow: 'shadow-[0_8px_32px_rgba(249,115,22,0.25)]',
      border: 'border-[#F97316]/30',
    },
    info: {
      icon: 'info',
      iconBg: 'bg-gradient-to-br from-[#005091] to-[#003d6e]',
      glow: 'shadow-[0_8px_32px_rgba(0,80,145,0.25)]',
      border: 'border-[#005091]/30',
    },
  };

  const { icon, iconBg, glow, border } = config[toast.type];

  return (
    <div
      className={`
        group w-[320px] p-4 bg-surface-container rounded-2xl ${glow} border ${border}
        ${isExiting
          ? 'animate-out fade-out slide-out-to-right-full duration-200'
          : 'animate-in fade-in slide-in-from-right-full duration-300'
        }
      `}
      role="alert"
    >
      <div className="flex items-center gap-3">
        {/* Icon Circle */}
        <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center shadow-lg flex-shrink-0`}>
          <Icon name={icon} className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-on-surface leading-tight">
            {toast.title}
          </p>
          {toast.message && (
            <p className="text-xs text-on-surface-variant leading-tight mt-0.5">
              {toast.message}
            </p>
          )}
        </div>

        {/* Action button (e.g., Undo) */}
        {toast.action && (
          <button
            onClick={() => {
              toast.action!.onClick();
              handleClose();
            }}
            className="flex-shrink-0 px-3 py-1 rounded-lg text-xs font-semibold
                       bg-primary/15 text-primary hover:bg-primary/25
                       transition-colors duration-150"
          >
            {toast.action.label}
          </button>
        )}

        {/* Close button - appears on hover */}
        <button
          onClick={handleClose}
          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
                     opacity-0 group-hover:opacity-100 hover:bg-surface-container-high
                     transition-all duration-150"
          aria-label="Dismiss"
        >
          <Icon name="x" className="w-3.5 h-3.5 text-on-surface-variant" />
        </button>
      </div>
    </div>
  );
};

export const ToastContainer: React.FC<{ toasts: ToastMessage[]; onClose: (id: string) => void }> = ({ toasts, onClose }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col-reverse gap-3 pointer-events-none" aria-live="polite" aria-atomic="false">
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} onClose={onClose} />
        </div>
      ))}
    </div>
  );
};
