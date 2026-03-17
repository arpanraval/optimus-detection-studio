import React from 'react';
import { Icon } from '../Icon';

export type FABSize = 'small' | 'medium' | 'large';
export type FABColor = 'primary' | 'secondary' | 'surface' | 'error';

export interface FABProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** FAB size variant */
  size?: FABSize;
  /** FAB color - primary (#783264), secondary (#4D7C6F), surface (grey), error (#A63D40) */
  color?: FABColor;
  /** Icon name (uses Icon component) */
  icon: string;
  /** Label text (makes it an Extended FAB) */
  label?: string;
  /** Position fixed in viewport */
  fixed?: boolean;
  /** Fixed position placement */
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
}

/**
 * M3 Floating Action Button (FAB) with Detection Studio Color System
 *
 * Colors:
 * - primary: #783264 (Magenta) - Main FAB for primary actions
 * - secondary: #4D7C6F (Sage Green) - Secondary FABs
 * - surface: Grey - Low emphasis FABs
 * - error: #A63D40 (Brick Red) - Destructive FABs (rare)
 *
 * Sizes:
 * - small: 40x40px, 12px radius
 * - medium: 56x56px, 16px radius (default)
 * - large: 96x96px, 28px radius
 * - Extended: 56px height with label
 *
 * @example
 * // Standard FAB
 * <FAB icon="plus" color="primary" />
 *
 * // Extended FAB
 * <FAB icon="plus" label="Create Detection" color="primary" />
 *
 * // Fixed position FAB
 * <FAB icon="plus" fixed position="bottom-right" />
 */
export const FAB: React.FC<FABProps> = ({
  size = 'medium',
  color = 'primary',
  icon,
  label,
  fixed = false,
  position = 'bottom-right',
  className = '',
  disabled = false,
  style,
  ...props
}) => {
  const isExtended = !!label;

  // Color definitions matching Button component
  const colors = {
    primary: { main: '#783264', onMain: '#FFFFFF' },
    secondary: { main: '#4D7C6F', onMain: '#FFFFFF' },
    surface: { main: '#6B7280', onMain: '#FFFFFF' },
    error: { main: '#A63D40', onMain: '#FFFFFF' },
  };

  const currentColor = colors[color];

  // Base styles
  const baseStyles = [
    'inline-flex items-center justify-center',
    'font-medium transition-all duration-200',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
    'shadow-lg hover:shadow-xl active:shadow-lg',
  ].join(' ');

  // Size styles (only for non-extended FAB)
  const sizeStyles: Record<FABSize, string> = {
    small: 'w-10 h-10 rounded-xl',      // 40px, 12px radius
    medium: 'w-14 h-14 rounded-2xl',    // 56px, 16px radius
    large: 'w-24 h-24 rounded-[28px]',  // 96px, 28px radius
  };

  // Extended FAB styles
  const extendedStyles = 'h-14 px-5 rounded-2xl gap-3'; // 56px height, 16px radius

  // Icon sizes
  const iconSizes: Record<FABSize, number> = {
    small: 20,
    medium: 24,
    large: 32,
  };

  // Fixed position styles
  const positionStyles: Record<string, string> = {
    'bottom-right': 'fixed bottom-6 right-6 z-50',
    'bottom-left': 'fixed bottom-6 left-6 z-50',
    'bottom-center': 'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
  };

  // Color-specific styles
  const colorStyle: React.CSSProperties = color === 'surface'
    ? {
        backgroundColor: 'var(--surface-container-high, #E5E7EB)',
        color: 'var(--on-surface, #1F2937)',
      }
    : {
        backgroundColor: currentColor.main,
        color: currentColor.onMain,
      };

  return (
    <button
      className={[
        baseStyles,
        isExtended ? extendedStyles : sizeStyles[size],
        fixed ? positionStyles[position] : '',
        className,
      ].filter(Boolean).join(' ')}
      style={{ ...colorStyle, ...style }}
      disabled={disabled}
      {...props}
    >
      <Icon name={icon} size={iconSizes[isExtended ? 'medium' : size]} />
      {label && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
};

export default FAB;
