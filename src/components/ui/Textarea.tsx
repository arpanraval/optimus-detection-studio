import React, { useState, forwardRef, useEffect } from 'react';

export type TextareaSize = 'sm' | 'md' | 'lg';
export type TextareaState = 'default' | 'error' | 'success';

export interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  /** Textarea size variant */
  size?: TextareaSize;
  /** Textarea validation state */
  state?: TextareaState;
  /** Label text */
  label?: string;
  /** Helper text below textarea */
  helperText?: string;
  /** Error message (overrides helperText when state is error) */
  errorMessage?: string;
  /** Success message (overrides helperText when state is success) */
  successMessage?: string;
  /** Show required indicator */
  required?: boolean;
  /** Show character count */
  showCharCount?: boolean;
  /** Maximum character count (enables counter) */
  maxLength?: number;
  /** Minimum rows */
  minRows?: number;
  /** Maximum rows (for auto-resize) */
  maxRows?: number;
  /** Enable auto-resize */
  autoResize?: boolean;
  /** Full width */
  fullWidth?: boolean;
}

/**
 * Textarea Component with Detection Studio Color System
 *
 * Colors:
 * - Focus: #783264 (Primary Magenta)
 * - Success: #4D7C6F (Sage Green)
 * - Error: #A63D40 (Brick Red)
 *
 * Sizes:
 * - sm: Smaller padding and text
 * - md: Default size
 * - lg: Larger padding and text
 *
 * @example
 * // Basic textarea
 * <Textarea placeholder="Enter description..." />
 *
 * // With character count
 * <Textarea label="Bio" maxLength={500} showCharCount />
 *
 * // Auto-resizing textarea
 * <Textarea autoResize minRows={3} maxRows={10} />
 *
 * // Error state
 * <Textarea state="error" errorMessage="This field is required" />
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  size = 'md',
  state = 'default',
  label,
  helperText,
  errorMessage,
  successMessage,
  required = false,
  showCharCount = false,
  maxLength,
  minRows = 3,
  maxRows = 10,
  autoResize = false,
  fullWidth = false,
  disabled = false,
  readOnly = false,
  className = '',
  value,
  defaultValue,
  onChange,
  ...props
}, ref) => {
  const [internalValue, setInternalValue] = useState(defaultValue?.toString() || '');
  const [textareaHeight, setTextareaHeight] = useState<string | undefined>(undefined);

  const currentValue = value !== undefined ? value.toString() : internalValue;
  const charCount = currentValue.length;

  // Size styles
  const sizeStyles: Record<TextareaSize, { text: string; padding: string; radius: string }> = {
    sm: { text: 'text-xs', padding: 'p-3', radius: 'rounded-lg' },
    md: { text: 'text-sm', padding: 'p-4', radius: 'rounded-xl' },
    lg: { text: 'text-base', padding: 'p-5', radius: 'rounded-xl' },
  };

  // State styles
  const stateStyles: Record<TextareaState, { border: string; ring: string }> = {
    default: { border: 'border-outline-variant/30 focus:border-[#783264]', ring: 'focus:ring-[#783264]/20' },
    error: { border: 'border-[#A63D40] focus:border-[#A63D40]', ring: 'focus:ring-[#A63D40]/20' },
    success: { border: 'border-[#4D7C6F] focus:border-[#4D7C6F]', ring: 'focus:ring-[#4D7C6F]/20' },
  };

  const currentSize = sizeStyles[size];
  const currentState = stateStyles[state];

  // Calculate row height based on size
  const getLineHeight = () => {
    switch (size) {
      case 'sm': return 18;
      case 'lg': return 26;
      default: return 22;
    }
  };

  // Handle internal change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;

    // Respect maxLength if set
    if (maxLength && newValue.length > maxLength) {
      return;
    }

    if (value === undefined) {
      setInternalValue(newValue);
    }
    onChange?.(e);

    // Auto-resize logic
    if (autoResize) {
      const lineHeight = getLineHeight();
      const minHeight = minRows * lineHeight;
      const maxHeight = maxRows * lineHeight;

      // Reset height to auto to get the correct scrollHeight
      e.target.style.height = 'auto';
      const scrollHeight = e.target.scrollHeight;

      // Clamp between min and max
      const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
      setTextareaHeight(`${newHeight}px`);
    }
  };

  // Initialize auto-resize height
  useEffect(() => {
    if (autoResize) {
      const lineHeight = getLineHeight();
      const minHeight = minRows * lineHeight;
      setTextareaHeight(`${minHeight}px`);
    }
  }, [autoResize, minRows, size]);

  // Get displayed message
  const displayedMessage = state === 'error' ? errorMessage : state === 'success' ? successMessage : helperText;

  // Calculate if near/over limit
  const isNearLimit = maxLength ? charCount >= maxLength * 0.9 : false;
  const isAtLimit = maxLength ? charCount >= maxLength : false;

  return (
    <div className={`${fullWidth ? 'w-full' : ''}`}>
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-on-surface mb-1.5">
          {label}
          {required && <span className="text-[#A63D40] ml-0.5">*</span>}
        </label>
      )}

      {/* Textarea */}
      <textarea
        ref={ref}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={handleChange}
        disabled={disabled}
        readOnly={readOnly}
        rows={autoResize ? undefined : minRows}
        maxLength={maxLength}
        style={autoResize ? { height: textareaHeight, overflow: 'hidden' } : undefined}
        className={[
          'w-full resize-none',
          currentSize.text,
          currentSize.padding,
          currentSize.radius,
          'bg-surface-container-high border',
          currentState.border,
          'text-on-surface placeholder-on-surface-variant/50',
          'focus:outline-none focus:ring-2',
          currentState.ring,
          'transition-all',
          disabled && 'bg-surface-container border-outline-variant/20 text-on-surface-variant/50 cursor-not-allowed',
          readOnly && 'bg-surface-container border-outline-variant/20 cursor-default focus:ring-0',
          className,
        ].filter(Boolean).join(' ')}
        {...props}
      />

      {/* Footer: Message and Character Count */}
      <div className="flex items-start justify-between mt-1.5 gap-4">
        {/* Helper/Error/Success message */}
        {displayedMessage ? (
          <p className={[
            'text-xs flex items-center gap-1 flex-1',
            state === 'error' && 'text-[#A63D40]',
            state === 'success' && 'text-[#4D7C6F]',
            state === 'default' && 'text-on-surface-variant/60',
          ].filter(Boolean).join(' ')}>
            {displayedMessage}
          </p>
        ) : (
          <div className="flex-1" />
        )}

        {/* Character count */}
        {(showCharCount || maxLength) && (
          <span className={[
            'text-xs tabular-nums',
            isAtLimit && 'text-[#A63D40] font-medium',
            isNearLimit && !isAtLimit && 'text-[#A63D40]/70',
            !isNearLimit && 'text-on-surface-variant/60',
          ].filter(Boolean).join(' ')}>
            {charCount}{maxLength ? `/${maxLength}` : ''}
          </span>
        )}
      </div>
    </div>
  );
});

Textarea.displayName = 'Textarea';

export default Textarea;
