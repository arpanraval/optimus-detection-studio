import React, { useState, forwardRef } from 'react';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';

export type InputSize = 'sm' | 'md' | 'lg';
export type InputState = 'default' | 'error' | 'success';
export type InputType = 'text' | 'password' | 'email' | 'number' | 'date' | 'search';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Input size variant */
  size?: InputSize;
  /** Input validation state */
  state?: InputState;
  /** Label text */
  label?: string;
  /** Helper text below input */
  helperText?: string;
  /** Error message (overrides helperText when state is error) */
  errorMessage?: string;
  /** Success message (overrides helperText when state is success) */
  successMessage?: string;
  /** Show required indicator */
  required?: boolean;
  /** Leading icon name */
  leadingIcon?: IconName;
  /** Show clear button (for search/text inputs) */
  clearable?: boolean;
  /** Callback when clear button is clicked */
  onClear?: () => void;
  /** Full width */
  fullWidth?: boolean;
}

/**
 * Input Component with Detection Studio Color System
 *
 * Colors:
 * - Focus: #783264 (Primary Magenta)
 * - Success: #4D7C6F (Sage Green)
 * - Error: #A63D40 (Brick Red)
 *
 * Sizes:
 * - sm: 32px height
 * - md: 40px height (default)
 * - lg: 48px height
 *
 * @example
 * // Basic input
 * <Input placeholder="Enter text..." />
 *
 * // Labeled input with helper text
 * <Input label="Email" helperText="We'll never share your email" />
 *
 * // Search input with clear button
 * <Input type="search" leadingIcon="search" clearable />
 *
 * // Error state
 * <Input state="error" errorMessage="This field is required" />
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(({
  size = 'md',
  state = 'default',
  type = 'text',
  label,
  helperText,
  errorMessage,
  successMessage,
  required = false,
  leadingIcon,
  clearable = false,
  onClear,
  fullWidth = false,
  disabled = false,
  readOnly = false,
  className = '',
  value,
  defaultValue,
  onChange,
  ...props
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue || '');

  const isPassword = type === 'password';
  const isSearch = type === 'search';
  const isNumber = type === 'number';
  const currentValue = value !== undefined ? value : internalValue;
  const hasValue = currentValue !== '';

  // Size styles
  const sizeStyles: Record<InputSize, { height: string; text: string; padding: string; radius: string }> = {
    sm: { height: 'h-8', text: 'text-xs', padding: 'px-3', radius: 'rounded-lg' },
    md: { height: 'h-10', text: 'text-sm', padding: 'px-4', radius: 'rounded-xl' },
    lg: { height: 'h-12', text: 'text-base', padding: 'px-5', radius: 'rounded-xl' },
  };

  // State styles
  const stateStyles: Record<InputState, { border: string; ring: string }> = {
    default: { border: 'border-outline-variant/30 focus:border-[#783264]', ring: 'focus:ring-[#783264]/20' },
    error: { border: 'border-[#A63D40] focus:border-[#A63D40]', ring: 'focus:ring-[#A63D40]/20' },
    success: { border: 'border-[#4D7C6F] focus:border-[#4D7C6F]', ring: 'focus:ring-[#4D7C6F]/20' },
  };

  const currentSize = sizeStyles[size];
  const currentState = stateStyles[state];

  // Calculate padding based on icons
  const leftPadding = leadingIcon ? 'pl-10' : currentSize.padding.split(' ')[0] || 'pl-4';
  const rightPadding = (isPassword || (clearable && hasValue)) ? 'pr-10' : currentSize.padding.split(' ')[1] || currentSize.padding;

  // Handle internal change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (value === undefined) {
      setInternalValue(e.target.value);
    }
    onChange?.(e);
  };

  // Handle clear
  const handleClear = () => {
    if (value === undefined) {
      setInternalValue('');
    }
    onClear?.();
  };

  // Get displayed message
  const displayedMessage = state === 'error' ? errorMessage : state === 'success' ? successMessage : helperText;

  return (
    <div className={`${fullWidth ? 'w-full' : ''}`}>
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-on-surface mb-1.5">
          {label}
          {required && <span className="text-[#A63D40] ml-0.5">*</span>}
        </label>
      )}

      {/* Input wrapper */}
      <div className="relative">
        {/* Leading icon */}
        {leadingIcon && (
          <Icon
            name={leadingIcon}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50"
          />
        )}

        {/* Input */}
        <input
          ref={ref}
          type={isPassword && showPassword ? 'text' : type}
          value={value}
          defaultValue={value === undefined ? defaultValue : undefined}
          onChange={handleChange}
          disabled={disabled}
          readOnly={readOnly}
          className={[
            'w-full',
            currentSize.height,
            currentSize.text,
            currentSize.radius,
            leftPadding,
            rightPadding,
            'bg-surface-container-high border',
            currentState.border,
            'text-on-surface placeholder-on-surface-variant/50',
            'focus:outline-none focus:ring-2',
            currentState.ring,
            'transition-all',
            disabled && 'bg-surface-container border-outline-variant/20 text-on-surface-variant/50 cursor-not-allowed',
            readOnly && 'bg-surface-container border-outline-variant/20 cursor-default focus:ring-0',
            isNumber && '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
            className,
          ].filter(Boolean).join(' ')}
          {...props}
        />

        {/* Password toggle */}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface-variant transition-colors"
            tabIndex={-1}
          >
            <Icon name={showPassword ? 'eye-off' : 'eye'} className="w-4 h-4" />
          </button>
        )}

        {/* Clear button */}
        {clearable && hasValue && !isPassword && !disabled && !readOnly && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-surface-container-highest hover:bg-surface-container-high flex items-center justify-center transition-colors"
            tabIndex={-1}
          >
            <Icon name="x" className="w-3 h-3 text-on-surface-variant" />
          </button>
        )}

        {/* Success icon */}
        {state === 'success' && !isPassword && !clearable && (
          <Icon
            name="check-circle"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4D7C6F]"
          />
        )}
      </div>

      {/* Helper/Error/Success message */}
      {displayedMessage && (
        <p className={[
          'text-xs mt-1.5 flex items-center gap-1',
          state === 'error' && 'text-[#A63D40]',
          state === 'success' && 'text-[#4D7C6F]',
          state === 'default' && 'text-on-surface-variant/60',
        ].filter(Boolean).join(' ')}>
          {state === 'error' && <Icon name="alert-circle" className="w-3 h-3" />}
          {state === 'success' && <Icon name="check" className="w-3 h-3" />}
          {displayedMessage}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
