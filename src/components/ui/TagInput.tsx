import React, { useState, useRef, forwardRef, KeyboardEvent } from 'react';
import { Icon } from '../Icon';

export type TagInputSize = 'sm' | 'md' | 'lg';
export type TagInputState = 'default' | 'error' | 'success';

export interface TagInputProps {
  /** TagInput size variant */
  size?: TagInputSize;
  /** TagInput validation state */
  state?: TagInputState;
  /** Current tags */
  value?: string[];
  /** Default tags */
  defaultValue?: string[];
  /** Placeholder text */
  placeholder?: string;
  /** Label text */
  label?: string;
  /** Helper text below input */
  helperText?: string;
  /** Error message */
  errorMessage?: string;
  /** Success message */
  successMessage?: string;
  /** Show required indicator */
  required?: boolean;
  /** Maximum number of tags */
  maxTags?: number;
  /** Maximum length per tag */
  maxTagLength?: number;
  /** Allow duplicates */
  allowDuplicates?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Full width */
  fullWidth?: boolean;
  /** Callback when tags change */
  onChange?: (tags: string[]) => void;
  /** Additional className */
  className?: string;
}

/**
 * TagInput Component with Detection Studio Color System
 *
 * Colors:
 * - Focus: #783264 (Primary Magenta)
 * - Tags: #783264 (Primary Magenta)
 * - Success: #4D7C6F (Sage Green)
 * - Error: #A63D40 (Brick Red)
 *
 * Features:
 * - Add tags by pressing Enter or comma
 * - Remove tags with backspace or click X
 * - Keyboard navigation
 * - Max tags limit
 * - Duplicate prevention
 *
 * @example
 * // Basic tag input
 * <TagInput
 *   label="Tags"
 *   placeholder="Add tags..."
 *   onChange={(tags) => console.log(tags)}
 * />
 *
 * // With max tags
 * <TagInput maxTags={5} helperText="Add up to 5 tags" />
 *
 * // Controlled
 * <TagInput value={tags} onChange={setTags} />
 */
export const TagInput = forwardRef<HTMLInputElement, TagInputProps>(({
  size = 'md',
  state = 'default',
  value,
  defaultValue = [],
  placeholder = 'Add tag...',
  label,
  helperText,
  errorMessage,
  successMessage,
  required = false,
  maxTags,
  maxTagLength = 50,
  allowDuplicates = false,
  disabled = false,
  fullWidth = false,
  onChange,
  className = '',
}, ref) => {
  const [internalTags, setInternalTags] = useState<string[]>(defaultValue);
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Combine refs
  React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  const currentTags = value !== undefined ? value : internalTags;

  // Size styles
  const sizeStyles: Record<TagInputSize, { minHeight: string; text: string; padding: string; tagPadding: string; radius: string }> = {
    sm: { minHeight: 'min-h-8', text: 'text-xs', padding: 'p-1.5', tagPadding: 'px-2 py-0.5', radius: 'rounded-lg' },
    md: { minHeight: 'min-h-10', text: 'text-sm', padding: 'p-2', tagPadding: 'px-2.5 py-1', radius: 'rounded-xl' },
    lg: { minHeight: 'min-h-12', text: 'text-base', padding: 'p-2.5', tagPadding: 'px-3 py-1.5', radius: 'rounded-xl' },
  };

  // State styles
  const stateStyles: Record<TagInputState, { border: string; ring: string }> = {
    default: { border: 'border-outline-variant/30', ring: 'ring-[#783264]/20' },
    error: { border: 'border-[#A63D40]', ring: 'ring-[#A63D40]/20' },
    success: { border: 'border-[#4D7C6F]', ring: 'ring-[#4D7C6F]/20' },
  };

  const currentSize = sizeStyles[size];
  const currentState = stateStyles[state];

  // Update tags
  const updateTags = (newTags: string[]) => {
    if (value === undefined) {
      setInternalTags(newTags);
    }
    onChange?.(newTags);
  };

  // Add tag
  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();

    if (!trimmedTag) return;
    if (trimmedTag.length > maxTagLength) return;
    if (maxTags && currentTags.length >= maxTags) return;
    if (!allowDuplicates && currentTags.includes(trimmedTag)) return;

    updateTags([...currentTags, trimmedTag]);
    setInputValue('');
  };

  // Remove tag
  const removeTag = (index: number) => {
    const newTags = currentTags.filter((_, i) => i !== index);
    updateTags(newTags);
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;

    // Check for comma to add tag
    if (newValue.includes(',')) {
      const parts = newValue.split(',');
      parts.forEach((part, i) => {
        if (i < parts.length - 1) {
          addTag(part);
        } else {
          setInputValue(part);
        }
      });
    } else {
      setInputValue(newValue);
    }
  };

  // Handle key down
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && currentTags.length > 0) {
      removeTag(currentTags.length - 1);
    }
  };

  // Handle container click
  const handleContainerClick = () => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  };

  // Get displayed message
  const displayedMessage = state === 'error' ? errorMessage : state === 'success' ? successMessage : helperText;

  // Check if at max tags
  const isAtMax = maxTags ? currentTags.length >= maxTags : false;

  return (
    <div className={`${fullWidth ? 'w-full' : ''} ${className}`}>
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-on-surface mb-1.5">
          {label}
          {required && <span className="text-[#A63D40] ml-0.5">*</span>}
        </label>
      )}

      {/* Input container */}
      <div
        onClick={handleContainerClick}
        className={[
          'flex flex-wrap items-center gap-1.5',
          currentSize.minHeight,
          currentSize.padding,
          currentSize.radius,
          'bg-surface-container-high border',
          currentState.border,
          isFocused && `border-[#783264] ring-2 ${currentState.ring}`,
          'cursor-text transition-all',
          disabled && 'bg-surface-container border-outline-variant/20 cursor-not-allowed',
        ].filter(Boolean).join(' ')}
      >
        {/* Tags */}
        {currentTags.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className={[
              'inline-flex items-center gap-1',
              currentSize.tagPadding,
              currentSize.text,
              'bg-[#783264]/15 text-[#783264] rounded-lg',
              'font-medium',
            ].join(' ')}
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(index);
                }}
                className="p-0.5 rounded hover:bg-[#783264]/20 transition-colors"
              >
                <Icon name="x" className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}

        {/* Input */}
        {!isAtMax && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false);
              if (inputValue.trim()) {
                addTag(inputValue);
              }
            }}
            placeholder={currentTags.length === 0 ? placeholder : ''}
            disabled={disabled}
            className={[
              'flex-1 min-w-[100px] bg-transparent outline-none',
              currentSize.text,
              'text-on-surface placeholder-on-surface-variant/50',
              disabled && 'cursor-not-allowed',
            ].join(' ')}
          />
        )}
      </div>

      {/* Footer: Message and Tag Count */}
      <div className="flex items-start justify-between mt-1.5 gap-4">
        {/* Helper/Error/Success message */}
        {displayedMessage ? (
          <p className={[
            'text-xs flex items-center gap-1 flex-1',
            state === 'error' && 'text-[#A63D40]',
            state === 'success' && 'text-[#4D7C6F]',
            state === 'default' && 'text-on-surface-variant/60',
          ].filter(Boolean).join(' ')}>
            {state === 'error' && <Icon name="alert-circle" className="w-3 h-3" />}
            {state === 'success' && <Icon name="check" className="w-3 h-3" />}
            {displayedMessage}
          </p>
        ) : (
          <div className="flex-1" />
        )}

        {/* Tag count */}
        {maxTags && (
          <span className={[
            'text-xs tabular-nums',
            isAtMax && 'text-[#A63D40] font-medium',
            !isAtMax && 'text-on-surface-variant/60',
          ].filter(Boolean).join(' ')}>
            {currentTags.length}/{maxTags}
          </span>
        )}
      </div>
    </div>
  );
});

TagInput.displayName = 'TagInput';

export default TagInput;
