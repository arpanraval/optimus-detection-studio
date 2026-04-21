import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Icon } from '../Icon';

export interface DropdownOption {
  value: string;
  label: string;
  leadingIcon?: string;
  leadingBadge?: React.ReactNode;
  trailing?: React.ReactNode;
  disabled?: boolean;
}

export interface DropdownProps {
  triggerIcon: string;
  placeholder: string;
  options: DropdownOption[];
  value?: string;
  onChange: (value: string | undefined) => void;
  includeAllOption?: { label: string };
  searchable?: boolean;
  align?: 'start' | 'end';
  panelWidth?: string;
  className?: string;
}

/**
 * MITRE-style single-select dropdown. Controlled.
 * - Click outside / ESC / selection closes the panel.
 * - Search auto-enables when options.length > 10 or when `searchable` is set.
 * - `includeAllOption` adds a reset row at the top that calls onChange(undefined).
 */
export const Dropdown: React.FC<DropdownProps> = ({
  triggerIcon,
  placeholder,
  options,
  value,
  onChange,
  includeAllOption,
  searchable,
  align = 'start',
  panelWidth = 'w-64',
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const isActive = open || value !== undefined;
  const searchEnabled = searchable ?? options.length > 10;

  useEffect(() => {
    const listener = (event: MouseEvent) => {
      if (!containerRef.current || containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  useEffect(() => {
    if (open && searchEnabled) {
      searchInputRef.current?.focus();
    }
  }, [open, searchEnabled]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const handleSelect = (v: string | undefined) => {
    onChange(v);
    setOpen(false);
  };

  const triggerLabel = selected?.label ?? placeholder;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
          isActive
            ? 'bg-secondary-container text-on-secondary-container'
            : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
        }`}
      >
        <Icon name={triggerIcon} className="w-4 h-4" />
        <span className="hidden md:inline max-w-[160px] truncate">{triggerLabel}</span>
        <Icon
          name="chevron-down"
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className={`absolute top-full ${align === 'end' ? 'right-0' : 'left-0'} mt-2 ${panelWidth} bg-surface-container-high border border-outline-variant rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100`}
        >
          {searchEnabled && (
            <div className="p-2 border-b border-outline-variant/30">
              <div className="relative">
                <Icon
                  name="search"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-9 pr-3 py-1.5 bg-surface-container text-on-surface placeholder-on-surface-variant/50 rounded-lg text-sm font-medium border border-outline-variant/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                />
              </div>
            </div>
          )}

          <div className="max-h-80 overflow-y-auto p-2 space-y-0.5">
            {includeAllOption && (
              <>
                <button
                  type="button"
                  onClick={() => handleSelect(undefined)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                    value === undefined
                      ? 'bg-secondary-container text-on-secondary-container'
                      : 'text-on-surface hover:bg-surface-container-highest'
                  }`}
                >
                  {includeAllOption.label}
                  {value === undefined && <Icon name="spark" className="w-3 h-3" />}
                </button>
                <div className="h-px bg-outline-variant/30 my-1" />
              </>
            )}

            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-on-surface-variant">
                No matches{search && ` for "${search}"`}
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSel = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => !opt.disabled && handleSelect(opt.value)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between gap-2 ${
                      isSel
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'text-on-surface hover:bg-surface-container-highest'
                    } ${opt.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <span className="flex items-center gap-2 min-w-0 flex-1">
                      {opt.leadingBadge}
                      {opt.leadingIcon && <Icon name={opt.leadingIcon} className="w-3.5 h-3.5 flex-shrink-0" />}
                      <span className="truncate">{opt.label}</span>
                    </span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      {opt.trailing}
                      {isSel && <Icon name="spark" className="w-3 h-3" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dropdown;
