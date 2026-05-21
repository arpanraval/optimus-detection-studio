import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../Icon';
import { useMitreEntityPicker } from '../../hooks/useMitreEntityPicker';

interface MitreTechniqueSearchProps {
  /** Existing comma-separated MITRE ID string in the form. */
  existingIds: string;
  /** Called with the new comma-separated string when the user picks a technique. */
  onAppend: (next: string) => void;
}

/**
 * Autocomplete search that lets users find MITRE techniques by ID or name
 * (e.g. typing "credential" finds T1003 - OS Credential Dumping). Selecting
 * a result appends the technique ID to the parent's comma-separated input
 * so the existing parse/resolve pipeline does the rest.
 */
export const MitreTechniqueSearch: React.FC<MitreTechniqueSearchProps> = ({
  existingIds,
  onAppend,
}) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { filteredOptions, loading, setSearch } = useMitreEntityPicker('technique');

  // Keep the picker's internal search in sync with our local query.
  useEffect(() => {
    setSearch(query);
  }, [query, setSearch]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const trimmedQuery = query.trim();

  // Already-selected IDs (uppercased) so we can disable duplicates.
  const selectedIds = new Set(
    existingIds
      .split(/[,;\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );

  // Show top matches when the query has at least 1 character.
  const visibleResults = trimmedQuery.length > 0 ? filteredOptions.slice(0, 8) : [];

  const handlePick = (mitreId: string) => {
    const idUpper = mitreId.toUpperCase();
    if (selectedIds.has(idUpper)) return;
    const trimmedExisting = existingIds.trim();
    const next = trimmedExisting
      ? trimmedExisting.endsWith(',')
        ? `${trimmedExisting} ${idUpper}`
        : `${trimmedExisting}, ${idUpper}`
      : idUpper;
    onAppend(next);
    setQuery('');
  };

  return (
    <div ref={wrapperRef} className="relative space-y-1.5">
      <label className="block text-sm font-medium text-on-surface-variant">
        Search techniques by name or ID
      </label>
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50">
          <Icon name="search" className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder="e.g. PowerShell, OS Credential Dumping, T1059"
          className="w-full h-11 pl-10 pr-4 rounded-xl text-sm focus:outline-none bg-surface-container-high border border-outline-variant/30 text-on-surface focus:border-primary/50 placeholder-on-surface-variant/60"
        />
      </div>

      {isFocused && trimmedQuery.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl border border-outline-variant/30 bg-surface-container-high shadow-lg overflow-hidden max-h-72 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-on-surface-variant text-sm">
              <Icon name="spinner" className="w-4 h-4 animate-spin mr-2" />
              Loading techniques...
            </div>
          ) : visibleResults.length === 0 ? (
            <div className="px-4 py-3 text-sm text-on-surface-variant italic">
              No techniques match "{trimmedQuery}".
            </div>
          ) : (
            visibleResults.map((opt) => {
              const alreadyAdded = selectedIds.has(opt.mitre_id.toUpperCase());
              return (
                <button
                  key={opt.mitre_id}
                  type="button"
                  onClick={() => handlePick(opt.mitre_id)}
                  disabled={alreadyAdded}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    alreadyAdded
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-surface-container-highest'
                  }`}
                >
                  <span className="text-xs font-mono font-bold text-on-surface-variant px-2 py-0.5 rounded bg-surface-container border border-outline-variant/30 min-w-[80px] text-center">
                    {opt.mitre_id}
                  </span>
                  <span className="flex-1 text-sm text-on-surface truncate">{opt.name}</span>
                  {opt.tactic && opt.tactic !== 'Unknown' && (
                    <span className="text-[11px] text-on-surface-variant whitespace-nowrap">
                      {opt.tactic}
                    </span>
                  )}
                  {alreadyAdded && (
                    <Icon name="check" className="w-3.5 h-3.5 text-on-surface-variant" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
