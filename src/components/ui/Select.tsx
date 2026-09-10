import React, { useState, useRef, useEffect, useLayoutEffect, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';

export type SelectSize = 'sm' | 'md' | 'lg';
export type SelectState = 'default' | 'error' | 'success';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  /** Select size variant */
  size?: SelectSize;
  /** Select validation state */
  state?: SelectState;
  /** Options to display */
  options: SelectOption[];
  /** Currently selected value */
  value?: string;
  /** Default selected value */
  defaultValue?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Label text */
  label?: string;
  /** Helper text below select */
  helperText?: string;
  /** Error message (overrides helperText when state is error) */
  errorMessage?: string;
  /** Success message (overrides helperText when state is success) */
  successMessage?: string;
  /** Show required indicator */
  required?: boolean;
  /** Leading icon name */
  leadingIcon?: IconName;
  /** Disabled state */
  disabled?: boolean;
  /** Full width */
  fullWidth?: boolean;
  /** Callback when value changes */
  onChange?: (value: string) => void;
  /** Additional className */
  className?: string;
}

/**
 * Select Component with Detection Studio Color System
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
 * // Basic select
 * <Select
 *   options={[
 *     { value: 'opt1', label: 'Option 1' },
 *     { value: 'opt2', label: 'Option 2' },
 *   ]}
 *   placeholder="Select an option"
 * />
 *
 * // With label and helper text
 * <Select
 *   label="Category"
 *   helperText="Choose a category for your item"
 *   options={categories}
 * />
 *
 * // Error state
 * <Select state="error" errorMessage="Please select an option" options={options} />
 */
export const Select = forwardRef<HTMLDivElement, SelectProps>(({
  size = 'md',
  state = 'default',
  options,
  value,
  defaultValue,
  placeholder = 'Select...',
  label,
  helperText,
  errorMessage,
  successMessage,
  required = false,
  leadingIcon,
  disabled = false,
  fullWidth = false,
  onChange,
  className = '',
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue || '');
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentValue = value !== undefined ? value : internalValue;
  const selectedOption = options.find(opt => opt.value === currentValue);

  // Position the portaled menu against the trigger's viewport rect so it
  // escapes any ancestor `overflow:hidden` (e.g. card chrome with rounded
  // corners). Keep it aligned on resize/scroll.
  useLayoutEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const updatePosition = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  // Close on outside click — counts the portaled menu as "inside" so clicks
  // on options don't dismiss before selection registers.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insideMenu = menuRef.current?.contains(target);
      if (!insideTrigger && !insideMenu) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        setIsOpen(!isOpen);
        break;
      case 'Escape':
        setIsOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          // Move to next option
          const currentIndex = options.findIndex(opt => opt.value === currentValue);
          const nextIndex = Math.min(currentIndex + 1, options.length - 1);
          const nextOption = options[nextIndex];
          if (nextOption && !nextOption.disabled) {
            handleSelect(nextOption.value);
          }
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (isOpen) {
          // Move to previous option
          const currentIndex = options.findIndex(opt => opt.value === currentValue);
          const prevIndex = Math.max(currentIndex - 1, 0);
          const prevOption = options[prevIndex];
          if (prevOption && !prevOption.disabled) {
            handleSelect(prevOption.value);
          }
        }
        break;
    }
  };

  // Handle selection
  const handleSelect = (selectedValue: string) => {
    if (value === undefined) {
      setInternalValue(selectedValue);
    }
    onChange?.(selectedValue);
    setIsOpen(false);
  };

  // Size styles
  const sizeStyles: Record<SelectSize, { height: string; text: string; padding: string; radius: string }> = {
    sm: { height: 'h-8', text: 'text-xs', padding: 'px-3', radius: 'rounded-lg' },
    md: { height: 'h-10', text: 'text-sm', padding: 'px-4', radius: 'rounded-xl' },
    lg: { height: 'h-12', text: 'text-base', padding: 'px-5', radius: 'rounded-xl' },
  };

  // State styles
  const stateStyles: Record<SelectState, { border: string; ring: string }> = {
    default: { border: 'border-outline-variant/30', ring: 'ring-[#783264]/20' },
    error: { border: 'border-[#A63D40]', ring: 'ring-[#A63D40]/20' },
    success: { border: 'border-[#4D7C6F]', ring: 'ring-[#4D7C6F]/20' },
  };

  const currentSize = sizeStyles[size];
  const currentState = stateStyles[state];

  // Calculate padding based on icon
  const leftPadding = leadingIcon ? 'pl-10' : currentSize.padding.split(' ')[0] || 'pl-4';

  // Get displayed message
  const displayedMessage = state === 'error' ? errorMessage : state === 'success' ? successMessage : helperText;

  return (
    <div ref={ref} className={`${fullWidth ? 'w-full' : ''} ${className}`}>
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-on-surface mb-1.5">
          {label}
          {required && <span className="text-[#A63D40] ml-0.5">*</span>}
        </label>
      )}

      {/* Select container */}
      <div ref={containerRef} className="relative">
        {/* Leading icon */}
        {leadingIcon && (
          <Icon
            name={leadingIcon}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50 z-10 pointer-events-none"
          />
        )}

        {/* Select trigger */}
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={[
            'w-full flex items-center justify-between',
            currentSize.height,
            currentSize.text,
            currentSize.radius,
            leftPadding,
            'pr-10',
            'bg-surface-container-high border',
            currentState.border,
            isOpen && `border-[#783264] ring-2 ${currentState.ring}`,
            'text-left',
            selectedOption ? 'text-on-surface' : 'text-on-surface-variant/50',
            'focus:outline-none',
            'transition-all',
            disabled && 'bg-surface-container border-outline-variant/20 text-on-surface-variant/50 cursor-not-allowed',
          ].filter(Boolean).join(' ')}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </button>

        {/* Dropdown arrow */}
        <Icon
          name="chevron-down"
          className={[
            'absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4',
            disabled ? 'text-on-surface-variant/30' : 'text-on-surface-variant/50',
            'transition-transform duration-200',
            isOpen && 'rotate-180',
          ].filter(Boolean).join(' ')}
        />

        {/* Success icon */}
        {state === 'success' && !isOpen && (
          <Icon
            name="check-circle"
            className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4D7C6F]"
          />
        )}

        {/* Dropdown menu — portaled so card chrome's overflow:hidden can't clip it */}
        {isOpen && menuPos && createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              zIndex: 1000,
            }}
            className={[
              'bg-surface-container-high border border-outline-variant/30',
              'rounded-xl shadow-lg overflow-hidden',
              'max-h-60 overflow-y-auto',
            ].join(' ')}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => !option.disabled && handleSelect(option.value)}
                disabled={option.disabled}
                className={[
                  'w-full flex items-center gap-2',
                  currentSize.height,
                  currentSize.text,
                  'px-4',
                  'text-left',
                  option.value === currentValue
                    ? 'bg-[#783264]/10 text-[#783264] font-medium'
                    : 'text-on-surface hover:bg-surface-container-highest',
                  option.disabled && 'text-on-surface-variant/40 cursor-not-allowed',
                  'transition-colors',
                ].filter(Boolean).join(' ')}
              >
                {option.value === currentValue && (
                  <Icon name="check" className="w-4 h-4 text-[#783264]" />
                )}
                <span className={option.value === currentValue ? '' : 'ml-6'}>
                  {option.label}
                </span>
              </button>
            ))}
          </div>,
          document.body,
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

Select.displayName = 'Select';

export default Select;
