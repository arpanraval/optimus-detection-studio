import React from 'react';
import { Icon } from '../Icon';

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'elevated' | 'text';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonColor = 'primary' | 'secondary' | 'surface' | 'error';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button style variant following M3 specs */
  variant?: ButtonVariant;
  /** Button color - primary (#783264), secondary (#4D7C6F), surface (grey), error (#A63D40) */
  color?: ButtonColor;
  /** Button size */
  size?: ButtonSize;
  /** Leading icon name (uses Icon component) */
  leadingIcon?: string;
  /** Trailing icon name (uses Icon component) */
  trailingIcon?: string;
  /** Full width button */
  fullWidth?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Children content */
  children: React.ReactNode;
}

/**
 * M3 Button Component with Detection Studio Color System
 *
 * Colors:
 * - primary: #783264 (Magenta) - Save, Submit, Create, Confirm
 * - secondary: #4D7C6F (Sage Green) - Export, Filter, Sort, Settings
 * - surface: Grey - Cancel, Dismiss, Close
 * - error: #A63D40 (Brick Red) - Delete, Remove, Clear All
 *
 * Variants:
 * - filled: Solid background (default)
 * - tonal: Lighter/muted background
 * - outlined: Border only
 * - elevated: With shadow
 * - text: Text only, no background
 *
 * @example
 * <Button color="primary">Save</Button>
 * <Button color="secondary" variant="outlined" leadingIcon="download">Export</Button>
 * <Button color="error" leadingIcon="trash-2">Delete</Button>
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'filled',
  color = 'primary',
  size = 'md',
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  loading = false,
  disabled = false,
  className = '',
  children,
  style,
  ...props
}) => {
  const isDisabled = disabled || loading;

  // Color definitions
  const colors = {
    primary: { main: '#783264', onMain: '#FFFFFF', container: '#783264' },
    secondary: { main: '#4D7C6F', onMain: '#FFFFFF', container: '#4D7C6F' },
    surface: { main: '#6B7280', onMain: '#FFFFFF', container: 'transparent' },
    error: { main: '#A63D40', onMain: '#FFFFFF', container: '#A63D40' },
  };

  const currentColor = colors[color];

  // Base styles following M3 specs
  const baseStyles = [
    'inline-flex items-center justify-center',
    'font-medium transition-all duration-200',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
  ].join(' ');

  // Size variants
  const sizeStyles: Record<ButtonSize, string> = {
    sm: 'h-8 text-xs rounded-xl gap-1.5',
    md: 'h-10 text-sm rounded-xl gap-2',
    lg: 'h-12 text-base rounded-xl gap-2',
  };

  // Padding based on icons
  const getPadding = () => {
    const paddings: Record<ButtonSize, { default: string; withLeading: string; withTrailing: string; withBoth: string; iconOnly: string }> = {
      sm: {
        default: 'px-4',
        withLeading: 'pl-3 pr-4',
        withTrailing: 'pl-4 pr-3',
        withBoth: 'px-3',
        iconOnly: 'px-2',
      },
      md: {
        default: 'px-5',
        withLeading: 'pl-4 pr-5',
        withTrailing: 'pl-5 pr-4',
        withBoth: 'px-4',
        iconOnly: 'px-2.5',
      },
      lg: {
        default: 'px-6',
        withLeading: 'pl-5 pr-6',
        withTrailing: 'pl-6 pr-5',
        withBoth: 'px-5',
        iconOnly: 'px-3',
      },
    };

    const p = paddings[size];
    const hasText = React.Children.count(children) > 0 && children !== '';

    if (!hasText) return p.iconOnly;
    if (leadingIcon && trailingIcon) return p.withBoth;
    if (leadingIcon) return p.withLeading;
    if (trailingIcon) return p.withTrailing;
    return p.default;
  };

  // Get computed styles based on variant and color
  const getVariantStyles = (): { className: string; inlineStyle: React.CSSProperties } => {
    switch (variant) {
      case 'filled':
        return {
          className: 'shadow-sm hover:shadow-md active:shadow-sm',
          inlineStyle: {
            backgroundColor: currentColor.main,
            color: currentColor.onMain,
          },
        };
      case 'tonal':
        return {
          className: 'hover:shadow-sm',
          inlineStyle: {
            backgroundColor: `${currentColor.main}20`,
            color: currentColor.main,
          },
        };
      case 'outlined':
        return {
          className: 'border-2 hover:shadow-sm',
          inlineStyle: {
            borderColor: currentColor.main,
            color: currentColor.main,
            backgroundColor: 'transparent',
          },
        };
      case 'elevated':
        return {
          className: 'shadow-md hover:shadow-lg',
          inlineStyle: {
            backgroundColor: color === 'surface' ? 'var(--surface-container-high, #E5E7EB)' : `${currentColor.main}15`,
            color: currentColor.main,
          },
        };
      case 'text':
        return {
          className: 'hover:bg-black/5 dark:hover:bg-white/10',
          inlineStyle: {
            color: color === 'surface' ? 'var(--on-surface-variant, #6B7280)' : currentColor.main,
            backgroundColor: 'transparent',
          },
        };
      default:
        return { className: '', inlineStyle: {} };
    }
  };

  const variantConfig = getVariantStyles();

  // Icon size based on button size
  const iconSize: Record<ButtonSize, number> = {
    sm: 14,
    md: 16,
    lg: 18,
  };

  // Loading spinner
  const LoadingSpinner = () => (
    <svg
      className="animate-spin"
      width={iconSize[size]}
      height={iconSize[size]}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  return (
    <button
      className={[
        baseStyles,
        sizeStyles[size],
        getPadding(),
        variantConfig.className,
        fullWidth ? 'w-full' : '',
        className,
      ].filter(Boolean).join(' ')}
      style={{ ...variantConfig.inlineStyle, ...style }}
      disabled={isDisabled}
      {...props}
    >
      {loading ? <LoadingSpinner /> : (leadingIcon && <Icon name={leadingIcon} size={iconSize[size]} />)}
      {children}
      {!loading && trailingIcon && <Icon name={trailingIcon} size={iconSize[size]} />}
    </button>
  );
};

export default Button;
