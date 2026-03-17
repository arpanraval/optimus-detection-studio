import React, { forwardRef } from 'react';
import { Icon } from '../Icon';

export type CheckboxSize = 'sm' | 'md' | 'lg';
export type CheckboxColor = 'primary' | 'secondary' | 'error';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  /** Checkbox size variant */
  size?: CheckboxSize;
  /** Checkbox color */
  color?: CheckboxColor;
  /** Label text */
  label?: string;
  /** Helper text below checkbox */
  helperText?: string;
  /** Indeterminate state (partially checked) */
  indeterminate?: boolean;
}

/**
 * Checkbox Component with Detection Studio Color System
 *
 * Colors:
 * - primary: #783264 (Magenta) - Default checkbox color
 * - secondary: #4D7C6F (Sage Green) - Success/completion checkboxes
 * - error: #A63D40 (Brick Red) - Error state checkboxes
 *
 * Sizes:
 * - sm: 16px
 * - md: 20px (default)
 * - lg: 24px
 *
 * @example
 * // Basic checkbox
 * <Checkbox label="Accept terms and conditions" />
 *
 * // Checked checkbox
 * <Checkbox label="Newsletter" checked />
 *
 * // Indeterminate state
 * <Checkbox label="Select all" indeterminate />
 *
 * // Different colors
 * <Checkbox color="secondary" label="Completed" checked />
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({
  size = 'md',
  color = 'primary',
  label,
  helperText,
  indeterminate = false,
  disabled = false,
  checked,
  className = '',
  ...props
}, ref) => {
  // Sync indeterminate state with DOM
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  // Combine refs
  React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  // Color definitions
  const colors = {
    primary: '#783264',
    secondary: '#4D7C6F',
    error: '#A63D40',
  };

  const currentColor = colors[color];

  // Size styles
  const sizeStyles: Record<CheckboxSize, { box: string; icon: number; text: string; gap: string }> = {
    sm: { box: 'w-4 h-4', icon: 12, text: 'text-xs', gap: 'gap-2' },
    md: { box: 'w-5 h-5', icon: 14, text: 'text-sm', gap: 'gap-2.5' },
    lg: { box: 'w-6 h-6', icon: 16, text: 'text-base', gap: 'gap-3' },
  };

  const currentSize = sizeStyles[size];

  // Determine visual state
  const isChecked = checked || indeterminate;

  return (
    <label
      className={[
        'inline-flex items-start cursor-pointer select-none',
        currentSize.gap,
        disabled && 'cursor-not-allowed opacity-50',
        className,
      ].filter(Boolean).join(' ')}
    >
      {/* Hidden input */}
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        className="sr-only peer"
        {...props}
      />

      {/* Custom checkbox */}
      <span
        className={[
          currentSize.box,
          'flex-shrink-0 flex items-center justify-center',
          'border-2 rounded-md transition-all duration-200',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2',
        ].filter(Boolean).join(' ')}
        style={{
          borderColor: isChecked ? currentColor : 'var(--outline-variant, #9CA3AF)',
          backgroundColor: isChecked ? currentColor : 'transparent',
          ...(isChecked ? {} : {}),
        }}
      >
        {isChecked && (
          <Icon
            name={indeterminate ? 'minus' : 'check'}
            size={currentSize.icon}
            className="text-white"
            strokeWidth={3}
          />
        )}
      </span>

      {/* Label and helper text */}
      {(label || helperText) && (
        <div className="flex flex-col pt-0.5">
          {label && (
            <span className={`${currentSize.text} text-on-surface`}>
              {label}
            </span>
          )}
          {helperText && (
            <span className="text-xs text-on-surface-variant/60 mt-0.5">
              {helperText}
            </span>
          )}
        </div>
      )}
    </label>
  );
});

Checkbox.displayName = 'Checkbox';

export default Checkbox;
