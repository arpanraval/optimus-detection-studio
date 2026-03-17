import React, { forwardRef } from 'react';
import { Icon } from '../Icon';

export type ToggleSize = 'sm' | 'md' | 'lg';
export type ToggleColor = 'primary' | 'secondary' | 'error';

export interface ToggleProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  /** Toggle size variant */
  size?: ToggleSize;
  /** Toggle color when on */
  color?: ToggleColor;
  /** Label text */
  label?: string;
  /** Helper text below toggle */
  helperText?: string;
  /** Show icon inside toggle */
  showIcon?: boolean;
  /** Label position */
  labelPosition?: 'left' | 'right';
}

/**
 * Toggle (Switch) Component with Detection Studio Color System
 *
 * Colors:
 * - primary: #783264 (Magenta) - Default toggle color
 * - secondary: #4D7C6F (Sage Green) - Success/enabled states
 * - error: #A63D40 (Brick Red) - Destructive toggles
 *
 * Sizes:
 * - sm: 36x20px track
 * - md: 44x24px track (default)
 * - lg: 52x28px track
 *
 * @example
 * // Basic toggle
 * <Toggle label="Enable notifications" />
 *
 * // Toggle with icon
 * <Toggle label="Dark mode" showIcon />
 *
 * // Different colors
 * <Toggle color="secondary" label="Active" checked />
 *
 * // Label on left
 * <Toggle label="Setting" labelPosition="left" />
 */
export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(({
  size = 'md',
  color = 'primary',
  label,
  helperText,
  showIcon = false,
  labelPosition = 'right',
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
  const sizeStyles: Record<ToggleSize, {
    track: string;
    thumb: string;
    thumbTranslate: string;
    icon: number;
    text: string;
    gap: string;
  }> = {
    sm: {
      track: 'w-9 h-5',
      thumb: 'w-4 h-4',
      thumbTranslate: 'translate-x-4',
      icon: 10,
      text: 'text-xs',
      gap: 'gap-2',
    },
    md: {
      track: 'w-11 h-6',
      thumb: 'w-5 h-5',
      thumbTranslate: 'translate-x-5',
      icon: 12,
      text: 'text-sm',
      gap: 'gap-2.5',
    },
    lg: {
      track: 'w-[52px] h-7',
      thumb: 'w-6 h-6',
      thumbTranslate: 'translate-x-6',
      icon: 14,
      text: 'text-base',
      gap: 'gap-3',
    },
  };

  const currentSize = sizeStyles[size];

  const LabelContent = () => (
    (label || helperText) ? (
      <div className="flex flex-col">
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
    ) : null
  );

  return (
    <label
      className={[
        'inline-flex items-start cursor-pointer select-none',
        currentSize.gap,
        labelPosition === 'left' && 'flex-row-reverse',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      ].filter(Boolean).join(' ')}
    >
      {/* Hidden input */}
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        className="sr-only peer"
        {...props}
      />

      {/* Toggle track */}
      <span
        className={[
          currentSize.track,
          'flex-shrink-0 relative rounded-full',
          'transition-colors duration-200',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2',
        ].filter(Boolean).join(' ')}
        style={{
          backgroundColor: checked ? currentColor : 'var(--outline-variant, #9CA3AF)',
        }}
      >
        {/* Toggle thumb */}
        <span
          className={[
            currentSize.thumb,
            'absolute top-0.5 left-0.5',
            'bg-white rounded-full shadow-md',
            'flex items-center justify-center',
            'transition-transform duration-200',
            checked && currentSize.thumbTranslate,
          ].filter(Boolean).join(' ')}
        >
          {showIcon && (
            <Icon
              name={checked ? 'check' : 'x'}
              size={currentSize.icon}
              className={checked ? 'text-[#783264]' : 'text-on-surface-variant/50'}
              strokeWidth={3}
            />
          )}
        </span>
      </span>

      {/* Label and helper text */}
      <LabelContent />
    </label>
  );
});

Toggle.displayName = 'Toggle';

export default Toggle;
