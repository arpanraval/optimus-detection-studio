import React, { useState, useMemo, useRef, useEffect } from 'react';
import { FilterCheckboxGroup } from './FilterCheckboxGroup';
import type { FilterOptions } from '../../hooks/useFilterOptions';
import { Status, Severity, DetectionType, Maturity, Confidence } from '../../types';
import { QUERY_LANGUAGES } from '../../constants';

export interface FilterPreset {
  id: string;
  name: string;
  filters: Record<string, string[]>;
}

interface FilterPanelProps {
  filters: Record<string, string[]>;
  onChange: (field: string, values: string[]) => void;
  filterOptions: FilterOptions;
  filterOptionsLoading: boolean;
  libraryType: string;
  isOpen: boolean;
  onToggle: () => void;
  presets: FilterPreset[];
  activePreset: string | null;
  onApplyPreset: (preset: FilterPreset) => void;
}

const STATUS_OPTIONS = Object.values(Status);
const SEVERITY_OPTIONS = Object.values(Severity);
const TYPE_OPTIONS = Object.values(DetectionType);
const MATURITY_OPTIONS = Object.values(Maturity);
const CONFIDENCE_OPTIONS = Object.values(Confidence);
const QUALITY_GRADE_OPTIONS = ['A', 'B', 'C', 'D', 'F'];
const REVIEW_STATUS_OPTIONS = ['none', 'requested', 'in_review', 'approved', 'rejected'];
const PUBLISH_STATUS_OPTIONS = ['unpublished', 'pending', 'published', 'rejected'];
const VALIDATED_OPTIONS = ['true', 'false'];
const QUERY_LANGUAGE_OPTIONS = [...QUERY_LANGUAGES];
const SOURCE_OPTIONS = ['custom', 'sigmahq', 'splunk_escu', 'elastic', 'microsoft_sentinel', 'crowdstrike', 'chronicle', 'community'];

/** All filter fields with their static/dynamic options */
interface FilterFieldDef {
  field: string;
  label: string;
  options: string[] | 'dynamic';
  dynamicKey?: keyof FilterOptions;
  librarySpecific?: 'user' | 'universal';
}

const FILTER_FIELDS: FilterFieldDef[] = [
  { field: 'status', label: 'Status', options: STATUS_OPTIONS },
  { field: 'severity', label: 'Severity', options: SEVERITY_OPTIONS },
  { field: 'detectionType', label: 'Detection Type', options: TYPE_OPTIONS },
  { field: 'maturity', label: 'Maturity', options: MATURITY_OPTIONS },
  { field: 'confidence', label: 'Confidence', options: CONFIDENCE_OPTIONS },
  { field: 'testedAndValidated', label: 'Validated', options: VALIDATED_OPTIONS },
  { field: 'mitreTactics', label: 'MITRE Tactics', options: 'dynamic', dynamicKey: 'mitre_tactics' },
  { field: 'mitreTechniques', label: 'MITRE Techniques', options: 'dynamic', dynamicKey: 'mitre_techniques' },
  { field: 'technology', label: 'Technology', options: 'dynamic', dynamicKey: 'technologies' },
  { field: 'logSource', label: 'Log Source', options: 'dynamic', dynamicKey: 'log_sources' },
  { field: 'platforms', label: 'Platforms', options: 'dynamic', dynamicKey: 'platforms' },
  { field: 'queryLanguage', label: 'Query Language', options: QUERY_LANGUAGE_OPTIONS },
  { field: 'threatActors', label: 'Threat Actors', options: 'dynamic', dynamicKey: 'threat_actors' },
  { field: 'campaigns', label: 'Campaigns', options: 'dynamic', dynamicKey: 'campaigns' },
  { field: 'software', label: 'Software', options: 'dynamic', dynamicKey: 'software' },
  { field: 'associatedCVEs', label: 'CVEs', options: 'dynamic', dynamicKey: 'cves' },
  { field: 'qualityGrade', label: 'Quality Grade', options: QUALITY_GRADE_OPTIONS },
  { field: 'review_status', label: 'Review Status', options: REVIEW_STATUS_OPTIONS },
  { field: 'publish_status', label: 'Publish Status', options: PUBLISH_STATUS_OPTIONS, librarySpecific: 'user' },
  { field: 'author', label: 'Author', options: 'dynamic', dynamicKey: 'authors' },
  { field: 'tags', label: 'Tags', options: 'dynamic', dynamicKey: 'tags' },
  { field: 'source', label: 'Source', options: SOURCE_OPTIONS, librarySpecific: 'universal' },
];

interface SearchMatch {
  field: string;
  label: string;
  value: string;
  isSelected: boolean;
}

export function FilterPanel({
  filters,
  onChange,
  filterOptions,
  filterOptionsLoading,
  libraryType,
  isOpen,
  onToggle,
  presets,
  activePreset,
  onApplyPreset,
}: FilterPanelProps) {
  const [globalSearch, setGlobalSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Resolve options for a field
  const getOptions = (def: FilterFieldDef): string[] => {
    if (def.options === 'dynamic' && def.dynamicKey) {
      return filterOptions[def.dynamicKey] || [];
    }
    return def.options as string[];
  };

  // Visible fields for current library type
  const visibleFields = useMemo(
    () => FILTER_FIELDS.filter(f => !f.librarySpecific || f.librarySpecific === libraryType),
    [libraryType]
  );

  // Global search results
  const searchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return null;

    const matches: SearchMatch[] = [];
    for (const def of visibleFields) {
      const opts = getOptions(def);
      // Match field label itself
      const labelMatches = def.label.toLowerCase().includes(q);
      for (const value of opts) {
        if (labelMatches || value.toLowerCase().includes(q)) {
          matches.push({
            field: def.field,
            label: def.label,
            value,
            isSelected: (filters[def.field] || []).includes(value),
          });
        }
      }
    }
    return matches.slice(0, 50); // cap results
  }, [globalSearch, visibleFields, filters, filterOptions]);

  // Toggle a search result
  const toggleSearchResult = (field: string, value: string) => {
    const current = filters[field] || [];
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    onChange(field, next);
  };

  // Focus search on Ctrl+F when panel is open
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && searchRef.current) {
        // Only capture if focus is within the panel or no active input
        const active = document.activeElement;
        if (!active || active === document.body || active.closest('[data-filter-panel]')) {
          e.preventDefault();
          searchRef.current.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="flex-shrink-0 w-10 flex flex-col items-center pt-4 gap-2
                   bg-surface-container-high rounded-xl
                   hover:bg-surface-container-highest transition-colors cursor-pointer"
        title="Show filters"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-on-surface-variant">
          <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z" clipRule="evenodd" />
        </svg>
        <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/50"
              style={{ writingMode: 'vertical-rl' }}>
          Filters
        </span>
      </button>
    );
  }

  const isSearching = globalSearch.trim().length > 0;

  return (
    <div data-filter-panel className="flex-shrink-0 w-[280px] bg-surface-container-high rounded-xl
                    flex flex-col overflow-hidden">
      {/* Panel header — collapse chevron */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-outline-variant/10">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-on-surface-variant/60">
            <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-semibold text-on-surface">Filters</span>
        </div>
        <button
          onClick={onToggle}
          className="p-1 rounded-lg hover:bg-white/[0.05] transition-colors"
          title="Collapse filters"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-on-surface-variant/60">
            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Global search */}
      <div className="px-2.5 py-2 border-b border-outline-variant/10">
        <div className="relative">
          <svg viewBox="0 0 20 20" fill="currentColor"
               className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant/40 pointer-events-none">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
            placeholder="Search all filters..."
            className="w-full pl-8 pr-8 py-1.5 text-xs bg-white/[0.04] rounded-lg
                       border border-outline-variant/15 focus:border-on-surface-variant/30
                       outline-none text-on-surface placeholder:text-on-surface-variant/40"
          />
          {globalSearch && (
            <button
              onClick={() => setGlobalSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant/40 hover:text-on-surface-variant"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Predefined Views */}
      {!isSearching && (
        <div className="px-2 py-2 border-b border-outline-variant/10">
          <div className="flex flex-wrap gap-1">
            {presets.map(preset => {
              const isActive = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => onApplyPreset(preset)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors
                             ${isActive
                               ? 'bg-on-surface-variant/20 text-on-surface'
                               : 'text-on-surface-variant/60 hover:bg-white/[0.04] hover:text-on-surface-variant'
                             }`}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search results OR filter list */}
      <div className="flex-1 overflow-y-auto">
        {isSearching ? (
          // Global search results
          <div className="py-1">
            {searchResults && searchResults.length > 0 ? (
              <>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/40">
                  {searchResults.length} match{searchResults.length !== 1 ? 'es' : ''}
                </div>
                {searchResults.map(match => (
                  <button
                    key={`${match.field}-${match.value}`}
                    onClick={() => toggleSearchResult(match.field, match.value)}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs
                               transition-colors text-left
                               ${match.isSelected
                                 ? 'bg-white/[0.06] text-on-surface font-medium'
                                 : 'text-on-surface-variant hover:bg-white/[0.03]'
                               }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center
                                 ${match.isSelected
                                   ? 'bg-on-surface-variant border-on-surface-variant'
                                   : 'border-outline-variant/40'
                                 }`}
                    >
                      {match.isSelected && (
                        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-surface" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="truncate">{match.value}</span>
                    </div>
                    <span className="text-[10px] text-on-surface-variant/30 flex-shrink-0">{match.label}</span>
                  </button>
                ))}
              </>
            ) : (
              <div className="px-3 py-6 text-center text-xs text-on-surface-variant/40">
                No filters match "{globalSearch}"
              </div>
            )}
          </div>
        ) : (
          // Normal filter list
          <>
            {visibleFields.map(def => (
              <FilterCheckboxGroup
                key={def.field}
                label={def.label}
                field={def.field}
                options={getOptions(def)}
                selected={filters[def.field] || []}
                onChange={onChange}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
