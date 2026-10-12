import React, { useState, useRef, useEffect, useLayoutEffect, useId, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';

export type SelectSize = 'sm' | 'md' | 'lg';
export type SelectState = 'default' | 'error' | 'success';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Optional heading for a contiguous group of options. */
  group?: string;
}

export interface SelectProps {
  id?: string;
  name?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
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
export const Select = forwardRef<HTMLDivElement, SelectProps>(
  (
    {
      id,
      name,
      style,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      'aria-describedby': ariaDescribedBy,
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
    },
    ref,
  ) => {
    const generatedId = useId();
    const triggerId = id ?? generatedId;
    const listId = `${triggerId}-listbox`;
    const messageId = `${triggerId}-message`;
    const triggerRef = useRef<HTMLButtonElement>(null);
    const nativeRef = useRef<HTMLSelectElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const searchRef = useRef({ text: '', time: 0 });
    const [internalValue, setInternalValue] = useState(defaultValue || '');
    const [menuPos, setMenuPos] = useState<{
      top?: number;
      bottom?: number;
      left?: number;
      right?: number;
      minWidth: number;
      maxWidth: number;
      maxHeight: number;
    } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const currentValue = value !== undefined ? value : internalValue;
    const selectedOption = options.find((opt) => opt.value === currentValue);

    // Position the portaled menu against the trigger's viewport rect so it
    // escapes any ancestor `overflow:hidden` (e.g. card chrome with rounded
    // corners). Keep it aligned on resize/scroll.
    useLayoutEffect(() => {
      if (!isOpen || !containerRef.current) return;

      const updatePosition = () => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const below = window.innerHeight - rect.bottom - 8;
        const above = rect.top - 8;
        const openAbove = below < 240 && above > below;
        const maxHeight = Math.max(0, Math.min(240, openAbove ? above : below));
        const minWidth = Math.min(Math.max(rect.width, 160), window.innerWidth - 16);
        const alignRight = rect.left + minWidth > window.innerWidth - 8;
        const left = Math.max(8, rect.left);
        const right = Math.max(8, window.innerWidth - rect.right);
        const availableWidth = window.innerWidth - (alignRight ? right : left) - 8;
        setMenuPos({
          top: openAbove ? undefined : rect.bottom + 4,
          bottom: openAbove ? window.innerHeight - rect.top + 4 : undefined,
          left: alignRight ? undefined : left,
          right: alignRight ? right : undefined,
          minWidth,
          maxWidth: Math.min(Math.max(rect.width, 420), availableWidth),
          maxHeight,
        });
      };

      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }, [isOpen, options]);

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

    useEffect(() => {
      if (isOpen) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
    }, [activeIndex, isOpen, listId]);

    useEffect(() => {
      if (disabled) setIsOpen(false);
    }, [disabled]);

    // Keep native form reset behavior for uncontrolled fields.
    useEffect(() => {
      const form = nativeRef.current?.form;
      const reset = () => {
        if (value === undefined) setInternalValue(defaultValue ?? '');
        setIsOpen(false);
      };
      form?.addEventListener('reset', reset);
      return () => form?.removeEventListener('reset', reset);
    }, [value, defaultValue]);

    const openMenu = (last = false) => {
      const selected = options.findIndex((opt) => opt.value === currentValue && !opt.disabled);
      const enabled = options.map((opt, index) => (opt.disabled ? -1 : index)).filter((index) => index >= 0);
      setActiveIndex(selected >= 0 ? selected : ((last ? enabled.at(-1) : enabled[0]) ?? -1));
      searchRef.current = { text: '', time: 0 };
      setIsOpen(true);
    };

    const handleSelect = (selectedValue: string) => {
      if (disabled || options.find((opt) => opt.value === selectedValue)?.disabled) return;
      if (value === undefined) setInternalValue(selectedValue);
      if (selectedValue !== currentValue) onChange?.(selectedValue);
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    // Focus stays on the trigger, including inside dialogs; arrows only highlight.
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (disabled) return;
      const enabled = options.map((opt, index) => (opt.disabled ? -1 : index)).filter((index) => index >= 0);
      if (
        ['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) ||
        (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)
      )
        e.stopPropagation();
      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (!isOpen) openMenu();
          else if (options[activeIndex] && !options[activeIndex].disabled) handleSelect(options[activeIndex].value);
          return;
        case 'Escape':
          if (isOpen) {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(false);
          }
          return;
        case 'Tab':
          setIsOpen(false);
          return;
        case 'ArrowDown':
        case 'ArrowUp': {
          e.preventDefault();
          if (!isOpen) openMenu(e.key === 'ArrowUp');
          else {
            const position = enabled.indexOf(activeIndex);
            const next = e.key === 'ArrowDown' ? Math.min(position + 1, enabled.length - 1) : Math.max(position - 1, 0);
            setActiveIndex(enabled[next] ?? -1);
          }
          return;
        }
        case 'Home':
        case 'End':
          e.preventDefault();
          if (!isOpen) openMenu();
          setActiveIndex((e.key === 'Home' ? enabled[0] : enabled.at(-1)) ?? -1);
          return;
        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            const now = Date.now();
            const text = (now - searchRef.current.time < 700 ? searchRef.current.text : '') + e.key.toLowerCase();
            if (!isOpen) openMenu();
            searchRef.current = { text, time: now };
            const prefix = [...text].every((char) => char === text[0]) ? text[0] : text;
            const start = prefix.length === 1 ? activeIndex + 1 : activeIndex;
            const ordered = [...enabled.filter((index) => index >= start), ...enabled.filter((index) => index < start)];
            const match = ordered.find((index) => options[index].label.toLowerCase().startsWith(prefix));
            if (match !== undefined) setActiveIndex(match);
          }
      }
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
      <div ref={ref} style={style} className={`${fullWidth ? 'w-full' : ''} ${className}`}>
        {/* Label */}
        {label && (
          <label htmlFor={triggerId} className="block text-sm font-medium text-on-surface mb-1.5">
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
            ref={triggerRef}
            id={triggerId}
            type="button"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-controls={isOpen ? listId : undefined}
            aria-activedescendant={isOpen && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={
              [ariaDescribedBy, displayedMessage ? messageId : undefined].filter(Boolean).join(' ') || undefined
            }
            aria-required={required || undefined}
            aria-invalid={state === 'error' || undefined}
            onClick={() => {
              if (isOpen) setIsOpen(false);
              else openMenu();
            }}
            onBlur={() => setIsOpen(false)}
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
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#783264]/40',
              'transition-all',
              disabled &&
                'bg-surface-container border-outline-variant/20 text-on-surface-variant/50 cursor-not-allowed',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
          </button>

          {/* Dropdown arrow */}
          <Icon
            name="chevron-down"
            className={[
              'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4',
              disabled ? 'text-on-surface-variant/30' : 'text-on-surface-variant/50',
              'transition-transform duration-200',
              isOpen && 'rotate-180',
            ]
              .filter(Boolean)
              .join(' ')}
          />

          {/* Success icon */}
          {state === 'success' && !isOpen && (
            <Icon name="check-circle" className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4D7C6F]" />
          )}

          {/* Dropdown menu — portaled so card chrome's overflow:hidden can't clip it */}
          {isOpen &&
            menuPos &&
            createPortal(
              <div
                ref={menuRef}
                id={listId}
                role="listbox"
                aria-label={ariaLabel ?? label}
                aria-labelledby={ariaLabelledBy ?? (!ariaLabel && !label ? triggerId : undefined)}
                onMouseDown={(event) => event.preventDefault()}
                style={{
                  position: 'fixed',
                  top: menuPos.top,
                  bottom: menuPos.bottom,
                  left: menuPos.left,
                  right: menuPos.right,
                  width: 'max-content',
                  minWidth: menuPos.minWidth,
                  maxWidth: menuPos.maxWidth,
                  maxHeight: menuPos.maxHeight,
                  zIndex: 1000,
                }}
                className={[
                  'bg-surface-container-high border border-outline-variant/30',
                  'rounded-xl shadow-lg overflow-hidden p-1',
                  'max-h-60 overflow-y-auto',
                ].join(' ')}
              >
                {options.map((option, index) => (
                  <React.Fragment key={option.value}>
                    {option.group && option.group !== options[index - 1]?.group && (
                      <div role="presentation" className="px-4 py-2 text-xs font-semibold text-on-surface-variant">
                        {option.group}
                      </div>
                    )}
                    <button
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={option.value === currentValue}
                      aria-label={option.group ? `${option.group}: ${option.label}` : undefined}
                      tabIndex={-1}
                      onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                      type="button"
                      onClick={() => !option.disabled && handleSelect(option.value)}
                      disabled={option.disabled}
                      className={[
                        'w-full flex items-center justify-between gap-3 rounded-lg',
                        size === 'sm' ? 'min-h-8' : size === 'lg' ? 'min-h-12' : 'min-h-10',
                        currentSize.text,
                        'px-3 py-2',
                        'text-left',
                        option.value === currentValue
                          ? 'bg-[#783264]/10 text-[#783264] dark:bg-[#783264]/20 dark:text-[#D9A8CB] font-medium'
                          : 'text-on-surface hover:bg-surface-container-highest',
                        index === activeIndex && option.value !== currentValue && 'bg-surface-container-highest',
                        option.disabled && 'text-on-surface-variant/40 cursor-not-allowed',
                        'transition-colors',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span className="min-w-0 flex-1 whitespace-normal break-words text-left">{option.label}</span>
                      {option.value === currentValue && (
                        <Icon name="check" className="w-4 h-4 shrink-0 text-[#783264] dark:text-[#D9A8CB]" />
                      )}
                    </button>
                  </React.Fragment>
                ))}
              </div>,
              document.body,
            )}
        </div>

        {/* Native form participation and constraint validation, visually replaced by the trigger. */}
        {(name || required) && (
          <select
            ref={nativeRef}
            aria-hidden="true"
            tabIndex={-1}
            className="sr-only"
            name={name}
            value={currentValue}
            required={required}
            disabled={disabled}
            onChange={(event) => handleSelect(event.target.value)}
            onInvalid={(event) => {
              event.preventDefault();
              triggerRef.current?.focus();
              openMenu();
            }}
          >
            {!options.some((option) => option.value === currentValue) && <option value={currentValue} />}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        )}

        {/* Helper/Error/Success message */}
        {displayedMessage && (
          <p
            id={messageId}
            className={[
              'text-xs mt-1.5 flex items-center gap-1',
              state === 'error' && 'text-[#A63D40]',
              state === 'success' && 'text-[#4D7C6F]',
              state === 'default' && 'text-on-surface-variant/60',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {state === 'error' && <Icon name="alert-circle" className="w-3 h-3" />}
            {state === 'success' && <Icon name="check" className="w-3 h-3" />}
            {displayedMessage}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';

export default Select;
