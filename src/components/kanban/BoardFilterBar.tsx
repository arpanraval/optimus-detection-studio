import React from 'react';
import { Severity } from '../../types';
import { Icon } from '../Icon';

export interface BoardFilters {
  severities: Severity[];
  queryLanguages: string[];
}

export const EMPTY_FILTERS: BoardFilters = {
  severities: [],
  queryLanguages: [],
};

export function hasActiveFilters(f: BoardFilters): boolean {
  return f.severities.length > 0 || f.queryLanguages.length > 0;
}

export function countActiveFilters(f: BoardFilters): number {
  return f.severities.length + f.queryLanguages.length;
}

interface BoardFilterBarProps {
  filters: BoardFilters;
  onChange: (filters: BoardFilters) => void;
  availableLanguages: string[];
}

const SEVERITY_CHIPS: { value: Severity; label: string; activeClass: string }[] = [
  { value: Severity.Critical, label: 'Critical', activeClass: 'bg-[#A63D40]/10 text-[#A63D40] border-[#A63D40]/20' },
  { value: Severity.High, label: 'High', activeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  { value: Severity.Medium, label: 'Medium', activeClass: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  { value: Severity.Low, label: 'Low', activeClass: 'bg-[#4D7C6F]/10 text-[#4D7C6F] border-[#4D7C6F]/20' },
];

const INACTIVE_CHIP = 'bg-transparent text-on-surface-variant/60 border-outline-variant/15';

export const BoardFilterBar: React.FC<BoardFilterBarProps> = ({ filters, onChange, availableLanguages }) => {
  const toggleSeverity = (sev: Severity) => {
    const next = filters.severities.includes(sev)
      ? filters.severities.filter(s => s !== sev)
      : [...filters.severities, sev];
    onChange({ ...filters, severities: next });
  };

  const toggleLanguage = (lang: string) => {
    const next = filters.queryLanguages.includes(lang)
      ? filters.queryLanguages.filter(l => l !== lang)
      : [...filters.queryLanguages, lang];
    onChange({ ...filters, queryLanguages: next });
  };

  const topLanguages = availableLanguages.slice(0, 5);
  const active = hasActiveFilters(filters);

  return (
    <div className="px-6 py-2 border-b border-outline-variant/10 bg-surface-container-low/50 overflow-x-auto scrollbar-thin">
      <div className="flex items-center gap-4 min-w-max">
        {/* Severity section */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-wider mr-1">Severity</span>
          {SEVERITY_CHIPS.map(chip => {
            const isActive = filters.severities.includes(chip.value);
            return (
              <button
                key={chip.value}
                onClick={() => toggleSeverity(chip.value)}
                className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all ${
                  isActive ? chip.activeClass : INACTIVE_CHIP
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        {topLanguages.length > 0 && (
          <div className="w-px h-5 bg-outline-variant/15" />
        )}

        {/* Language section */}
        {topLanguages.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-wider mr-1">Language</span>
            {topLanguages.map(lang => {
              const isActive = filters.queryLanguages.includes(lang);
              return (
                <button
                  key={lang}
                  onClick={() => toggleLanguage(lang)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all ${
                    isActive
                      ? 'bg-[#783264]/10 text-[#783264] border-[#783264]/20'
                      : INACTIVE_CHIP
                  }`}
                >
                  {lang}
                </button>
              );
            })}
          </div>
        )}

        {/* Clear button */}
        {active && (
          <>
            <div className="w-px h-5 bg-outline-variant/15" />
            <button
              onClick={() => onChange(EMPTY_FILTERS)}
              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border border-outline-variant/15 text-on-surface-variant/60 hover:text-on-surface-variant hover:border-outline-variant/30 transition-all"
            >
              <Icon name="filter-x" className="w-3 h-3" />
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
};
