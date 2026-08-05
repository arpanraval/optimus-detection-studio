import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';
import { LLM_MODELS, DEFAULT_MODEL } from '../../lib/aiService';
import { Select } from '../ui/Select';

const PROVIDER_LABEL: Record<string, string> = {
  google: 'Google',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

export interface FieldGroup {
  id: string;
  label: string;
  section?: string; // Optional section grouping
}

interface AISuggestDropdownProps {
  label: string;
  fieldGroups: FieldGroup[];
  isLoading: boolean;
  onFillAll: () => void;
  onFillSelected: (groupIds: string[], model?: string) => void;
  variant?: 'link' | 'pill';
  disabled?: boolean;
}

export const AISuggestDropdown: React.FC<AISuggestDropdownProps> = ({
  label,
  fieldGroups,
  isLoading,
  onFillAll,
  onFillSelected,
  variant = 'link',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(fieldGroups.map(g => g.id))
  );
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calculate position when opening
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 8,
      left: rect.right,
    });
  }, []);

  // Reset all checked when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setCheckedIds(new Set(fieldGroups.map(g => g.id)));
      updatePosition();
    }
  }, [isOpen, fieldGroups, updatePosition]);

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!isOpen) return;
    const handleReposition = () => updatePosition();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [isOpen, updatePosition]);

  // Click-outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const toggleCheck = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSection = (section: string) => {
    const sectionIds = fieldGroups.filter(g => g.section === section).map(g => g.id);
    const allChecked = sectionIds.every(id => checkedIds.has(id));
    setCheckedIds(prev => {
      const next = new Set(prev);
      sectionIds.forEach(id => allChecked ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const handleFillSelected = () => {
    const selected = Array.from(checkedIds);
    if (selected.length === 0) return;
    setIsOpen(false);
    onFillSelected(selected, selectedModel !== DEFAULT_MODEL ? selectedModel : undefined);
  };

  const isAllChecked = checkedIds.size === fieldGroups.length;
  const selectedCount = checkedIds.size;

  // Group fields by section
  const sections = fieldGroups.reduce<{ section: string | undefined; groups: FieldGroup[] }[]>((acc, group) => {
    const last = acc[acc.length - 1];
    if (last && last.section === group.section) {
      last.groups.push(group);
    } else {
      acc.push({ section: group.section, groups: [group] });
    }
    return acc;
  }, []);

  // Gradient styling: brand magenta → teal so the trigger stays legible in
  // both light and dark themes (avoids the flat blue link that disappeared
  // against dark surfaces).
  const mainButtonClass = variant === 'link'
    ? 'text-xs font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#783264] to-[#4D7C6F] hover:brightness-110 flex items-center gap-1 disabled:opacity-50'
    : 'inline-flex items-center gap-1.5 h-8 px-3 rounded-l-lg text-xs font-semibold transition-all bg-gradient-to-r from-[#783264] to-[#4D7C6F] text-white hover:brightness-110 shadow-sm disabled:opacity-50';

  const chevronClass = variant === 'link'
    ? 'text-xs text-[#783264] hover:opacity-80 disabled:opacity-50 px-0.5'
    : 'inline-flex items-center h-8 px-1.5 rounded-r-lg text-xs font-semibold transition-all bg-gradient-to-r from-[#4D7C6F] to-[#4D7C6F] text-white hover:brightness-110 border-l border-white/20 disabled:opacity-50';

  const dropdown = isOpen && dropdownPos ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[100] rounded-2xl border border-outline-variant/30 bg-surface-container-low shadow-xl min-w-[260px] overflow-hidden"
      style={{
        top: dropdownPos.top,
        left: dropdownPos.left,
        transform: 'translateX(-100%)',
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-outline-variant/20 flex items-center justify-between">
        <span className="text-xs font-semibold text-on-surface">Select Fields</span>
        <button
          type="button"
          onClick={() => {
            if (isAllChecked) setCheckedIds(new Set());
            else setCheckedIds(new Set(fieldGroups.map(g => g.id)));
          }}
          className="text-[10px] font-medium text-tertiary hover:text-tertiary/80 transition-colors"
        >
          {isAllChecked ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      {/* Field groups */}
      <div className="py-1.5 max-h-[200px] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.1)_transparent] [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-on-surface/10">
        {sections.map((sec, si) => (
          <div key={sec.section || si}>
            {sec.section && (
              <button
                type="button"
                onClick={() => toggleSection(sec.section!)}
                className="w-full flex items-center gap-2 px-4 pt-3 pb-1 group cursor-pointer relative"
              >
                {si > 0 && <div className="absolute left-4 right-4 top-0 h-px bg-outline-variant/20" />}
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/70 group-hover:text-on-surface-variant transition-colors">
                  {sec.section}
                </span>
                <div className="flex-1 h-px bg-outline-variant/15" />
              </button>
            )}
            {sec.groups.map(group => (
              <label
                key={group.id}
                className="flex items-center gap-3 px-4 py-2 hover:bg-surface-container-high/60 cursor-pointer transition-colors"
              >
                <div className={`w-4 h-4 rounded-[5px] border flex items-center justify-center transition-all ${
                  checkedIds.has(group.id)
                    ? 'bg-tertiary border-tertiary'
                    : 'border-outline-variant/50 hover:border-outline-variant'
                }`}>
                  {checkedIds.has(group.id) && (
                    <svg className="w-2.5 h-2.5 text-on-tertiary" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={checkedIds.has(group.id)}
                  onChange={() => toggleCheck(group.id)}
                  className="sr-only"
                />
                <span className="text-xs text-on-surface">{group.label}</span>
              </label>
            ))}
          </div>
        ))}
      </div>

      {/* Model selector */}
      <div className="px-4 py-3 border-t border-outline-variant/20 bg-surface-container-low/50">
        <div className="flex items-center gap-2 mb-1.5">
          <Icon name="zap" className="w-3 h-3 text-on-surface-variant/60" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/70">Model</span>
        </div>
        <Select
          size="sm"
          fullWidth
          value={selectedModel}
          options={[
            ...LLM_MODELS.filter((m) => m.provider === 'google' && m.capabilities.json),
            ...LLM_MODELS.filter((m) => m.provider === 'openai' && m.capabilities.json),
            ...LLM_MODELS.filter((m) => m.provider === 'anthropic' && m.capabilities.json),
          ].map((m) => ({
            value: m.id,
            label: `${PROVIDER_LABEL[m.provider] || m.provider} · ${m.name}`,
          }))}
          onChange={(next) => setSelectedModel(next)}
        />
      </div>

      {/* Action button */}
      <div className="px-4 py-3 border-t border-outline-variant/20">
        <button
          type="button"
          onClick={handleFillSelected}
          disabled={selectedCount === 0}
          className="w-full inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl text-xs font-semibold transition-all bg-tertiary text-on-tertiary hover:brightness-110 active:scale-[0.98] shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          <Icon name="spark" className="w-3.5 h-3.5" />
          {isAllChecked ? 'Generate All' : `Generate Selected (${selectedCount})`}
        </button>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div ref={triggerRef}>
      <div className="flex items-center">
        {/* Main button - Fill All */}
        <button
          type="button"
          onClick={onFillAll}
          disabled={isLoading || disabled}
          className={mainButtonClass}
        >
          {isLoading ? (
            <Icon name="spinner" className="w-3 h-3 animate-spin" />
          ) : (
            <Icon name="spark" className="w-3 h-3" />
          )}
          {label}
        </button>

        {/* Chevron - Toggle dropdown */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading || disabled}
          className={chevronClass}
          aria-label="Toggle field suggestions"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {dropdown}
    </div>
  );
};
