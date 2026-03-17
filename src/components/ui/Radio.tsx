import React, { forwardRef } from 'react';

export type RadioSize = 'sm' | 'md' | 'lg';
export type RadioColor = 'primary' | 'secondary' | 'error';

export interface RadioOption {
  value: string;
  label: string;
  helperText?: string;
  disabled?: boolean;
}

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  /** Radio size variant */
  size?: RadioSize;
  /** Radio color */
  color?: RadioColor;
  /** Label text */
  label?: string;
  /** Helper text below radio */
  helperText?: string;
}

export interface RadioGroupProps {
  /** Group name (required for proper radio behavior) */
  name: string;
  /** Radio options */
  options: RadioOption[];
  /** Currently selected value */
  value?: string;
  /** Default selected value */
  defaultValue?: string;
  /** Radio size variant */
  size?: RadioSize;
  /** Radio color */
  color?: RadioColor;
  /** Layout direction */
  direction?: 'horizontal' | 'vertical';
  /** Disabled state for entire group */
  disabled?: boolean;
  /** Callback when value changes */
  onChange?: (value: string) => void;
  /** Additional className */
  className?: string;
}

/**
 * Radio Component with Detection Studio Color System
 *
 * Colors:
 * - primary: #783264 (Magenta) - Default radio color
 * - secondary: #4D7C6F (Sage Green) - Alternative emphasis
 * - error: #A63D40 (Brick Red) - Error state radios
 *
 * Sizes:
 * - sm: 16px
 * - md: 20px (default)
 * - lg: 24px
 *
 * @example
 * // Single radio
 * <Radio label="Option A" name="options" value="a" />
 *
 * // Radio group
 * <RadioGroup
 *   name="plan"
 *   options={[
 *     { value: 'free', label: 'Free', helperText: 'Basic features' },
 *     { value: 'pro', label: 'Pro', helperText: 'Advanced features' },
 *   ]}
 *   value={selectedPlan}
 *   onChange={setSelectedPlan}
 * />
 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(({
  size = 'md',
  color = 'primary',
  label,
  helperText,
  disabled = false,
  checked,
  className = '',
  ...props
}, ref) => {
  // Color definitions
  const colors = {
    primary: '#783264',
    secondary: '#4D7C6F',
    error: '#A63D40',
  };

  const currentColor = colors[color];

  // Size styles
  const sizeStyles: Record<RadioSize, { outer: string; inner: string; text: string; gap: string }> = {
    sm: { outer: 'w-4 h-4', inner: 'w-2 h-2', text: 'text-xs', gap: 'gap-2' },
    md: { outer: 'w-5 h-5', inner: 'w-2.5 h-2.5', text: 'text-sm', gap: 'gap-2.5' },
    lg: { outer: 'w-6 h-6', inner: 'w-3 h-3', text: 'text-base', gap: 'gap-3' },
  };

  const currentSize = sizeStyles[size];

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
        ref={ref}
        type="radio"
        checked={checked}
        disabled={disabled}
        className="sr-only peer"
        {...props}
      />

      {/* Custom radio */}
      <span
        className={[
          currentSize.outer,
          'flex-shrink-0 flex items-center justify-center',
          'border-2 rounded-full transition-all duration-200',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2',
        ].filter(Boolean).join(' ')}
        style={{
          borderColor: checked ? currentColor : 'var(--outline-variant, #9CA3AF)',
        }}
      >
        {checked && (
          <span
            className={`${currentSize.inner} rounded-full`}
            style={{ backgroundColor: currentColor }}
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

Radio.displayName = 'Radio';

/**
 * RadioGroup Component - Manages a group of radio buttons
 */
export const RadioGroup: React.FC<RadioGroupProps> = ({
  name,
  options,
  value,
  defaultValue,
  size = 'md',
  color = 'primary',
  direction = 'vertical',
  disabled = false,
  onChange,
  className = '',
}) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue || '');
  const currentValue = value !== undefined ? value : internalValue;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (value === undefined) {
      setInternalValue(newValue);
    }
    onChange?.(newValue);
  };

  return (
    <div
      className={[
        'flex',
        direction === 'vertical' ? 'flex-col gap-3' : 'flex-wrap gap-4',
        className,
      ].filter(Boolean).join(' ')}
      role="radiogroup"
    >
      {options.map((option) => (
        <Radio
          key={option.value}
          name={name}
          value={option.value}
          checked={currentValue === option.value}
          onChange={handleChange}
          size={size}
          color={color}
          label={option.label}
          helperText={option.helperText}
          disabled={disabled || option.disabled}
        />
      ))}
    </div>
  );
};

export default Radio;
