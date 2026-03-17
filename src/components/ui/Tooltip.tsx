import React, { useState, useRef, useEffect, useCallback } from 'react';

export type TooltipPosition = 'top' | 'right' | 'bottom' | 'left';

export interface TooltipProps {
  /** Tooltip content text */
  content: string;
  /** Position relative to trigger */
  position?: TooltipPosition;
  /** Delay before showing (ms) */
  delay?: number;
  /** Children trigger element */
  children: React.ReactNode;
  /** Additional className for the tooltip */
  className?: string;
  /** Disable the tooltip */
  disabled?: boolean;
}

/**
 * M3-style Tooltip Component
 *
 * Shows a tooltip on hover with configurable position and delay.
 * Supports dark/light theme automatically via surface tokens.
 *
 * @example
 * <Tooltip content="Delete detection" position="top">
 *   <button><Icon name="trash-2" /></button>
 * </Tooltip>
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  position = 'top',
  delay = 200,
  children,
  className = '',
  disabled = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
  }, [delay, disabled]);

  const hide = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const positionClasses: Record<TooltipPosition, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {isVisible && content && (
        <div
          role="tooltip"
          className={`
            absolute z-50 px-3 py-1.5 text-xs font-medium whitespace-nowrap
            bg-inverse-surface text-inverse-on-surface
            rounded-lg shadow-lg
            animate-in fade-in duration-150
            pointer-events-none
            ${positionClasses[position]}
            ${className}
          `}
        >
          {content}
        </div>
      )}
    </div>
  );
};
