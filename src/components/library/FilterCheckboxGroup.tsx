import React, { useState, useMemo } from 'react';

interface FilterCheckboxGroupProps {
  label: string;
  field: string;
  options: string[];
  selected: string[];
  onChange: (field: string, values: string[]) => void;
  searchThreshold?: number;
}

export function FilterCheckboxGroup({
  label,
  field,
  options,
  selected,
  onChange,
  searchThreshold = 10,
}: FilterCheckboxGroupProps) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, search]);

  const toggleValue = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter(v => v !== value)
      : [...selected, value];
    onChange(field, next);
  };

  const hasSelected = selected.length > 0;
  const showSearch = options.length > searchThreshold;

  return (
    <div className="border-b border-outline-variant/10 last:border-b-0">
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2
                   hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3 h-3 text-on-surface-variant/50 transition-transform duration-200
                       ${expanded ? 'rotate-90' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-xs font-medium text-on-surface-variant">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {hasSelected && (
            <button
              onClick={e => { e.stopPropagation(); onChange(field, []); }}
              className="text-[10px] text-on-surface-variant/50 hover:text-on-surface-variant transition-colors"
            >
              Clear
            </button>
          )}
          {hasSelected && (
            <span className="text-[10px] font-bold text-on-surface-variant bg-on-surface-variant/15 rounded-full
                           min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {selected.length}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="pb-2">
          {showSearch && (
            <div className="px-3 mb-1.5">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="w-full px-2.5 py-1.5 text-xs bg-white/[0.04] rounded-lg
                           border border-outline-variant/15 focus:border-on-surface-variant/30
                           outline-none
                           text-on-surface placeholder:text-on-surface-variant/40"
              />
            </div>
          )}

          <div className="max-h-48 overflow-y-auto px-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-on-surface-variant/40 italic">
                No matches
              </div>
            ) : (
              filteredOptions.map(option => {
                const isChecked = selected.includes(option);
                return (
                  <button
                    key={option}
                    onClick={() => toggleValue(option)}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs rounded-lg
                               transition-colors text-left
                               ${isChecked
                                 ? 'bg-white/[0.06] text-on-surface font-medium'
                                 : 'text-on-surface-variant hover:bg-white/[0.03]'
                               }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center
                                 ${isChecked
                                   ? 'bg-on-surface-variant border-on-surface-variant'
                                   : 'border-outline-variant/40'
                                 }`}
                    >
                      {isChecked && (
                        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-surface" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </div>
                    <span className="truncate">{option}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
