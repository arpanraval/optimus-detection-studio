import React, { useState, useRef, useEffect } from 'react';
import { useGroups, Group, GroupFilters } from '../../hooks/useGroups';
import { GroupCard } from './GroupCard';
import { Icon } from '../Icon';
import { routeHelpers } from '../../router/routes';
import { getCountryCode, getFlagUrl } from '../../lib/countries';

interface GroupsLibraryProps {
  onSelectGroup: (group: Group) => void;
}

export const GroupsLibrary: React.FC<GroupsLibraryProps> = ({ onSelectGroup }) => {
  const { groups, loading, error, filters, setFilters, filterOptions, refetch } = useGroups();
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Count active targeting filters
  const activeTargetingFilterCount =
    filters.originCountries.length +
    filters.targetCountries.length +
    filters.targetSectors.length +
    (filters.hasTargetingData !== null ? 1 : 0);

  // Helper to toggle a value in a filter array
  const toggleFilterValue = (
    filterKey: 'originCountries' | 'targetCountries' | 'targetSectors',
    value: string
  ) => {
    const current = filters[filterKey];
    const newValue = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    setFilters({ ...filters, [filterKey]: newValue });
  };

  // Clear all targeting filters
  const clearTargetingFilters = () => {
    setFilters({
      ...filters,
      originCountries: [],
      targetCountries: [],
      targetSectors: [],
      hasTargetingData: null,
    });
  };

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full bg-background">
        <Icon name="spinner" className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-on-surface-variant animate-pulse font-medium font-mono text-sm">
          LOADING THREAT GROUPS...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full bg-background">
        <div className="text-center max-w-md">
          <Icon name="alert-circle" className="w-16 h-16 text-error mx-auto mb-4" />
          <p className="text-error mb-4 text-lg font-semibold">Failed to load threat groups</p>
          <p className="text-on-surface-variant mb-6 text-sm">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="px-6 py-3 bg-primary text-on-primary rounded-lg hover:bg-primary/90
                     transition-colors font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Content Area with integrated toolbar */}
      <div className="flex-1 overflow-auto p-4 custom-scrollbar">
        {/* Inline Toolbar - feels like part of content, not a header */}
        <div className="flex items-center gap-2 mb-4">
          {/* Search Input - primary action */}
          <div className="relative w-64">
            <Icon
              name="search"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Filter groups..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-8 pr-3 py-1.5 bg-transparent border-b border-outline-variant/30
                       text-on-surface placeholder-on-surface-variant/40
                       focus:outline-none focus:border-primary transition-colors text-sm"
            />
          </div>

          {/* Results Count - subtle */}
          <span className="text-xs text-on-surface-variant/60 tabular-nums">
            {groups.length} results
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Controls - minimal styling */}
          <div className="flex items-center gap-1">
            {/* Targeting Filter */}
            <div className="relative" ref={filterDropdownRef}>
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                  activeTargetingFilterCount > 0
                    ? 'bg-primary/10 text-primary'
                    : 'text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container'
                }`}
              >
                <Icon name="filter" className="w-3.5 h-3.5" />
                {activeTargetingFilterCount > 0 && (
                  <span className="text-[10px] font-bold">{activeTargetingFilterCount}</span>
                )}
              </button>

              {/* Filter Dropdown */}
              {showFilterDropdown && (
                <div className="absolute right-0 top-full mt-1 w-80 bg-surface-container-high border border-outline-variant/30 rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-outline-variant/20 flex items-center justify-between">
                    <span className="text-xs font-semibold text-on-surface">Targeting Filters</span>
                    {activeTargetingFilterCount > 0 && (
                      <button onClick={clearTargetingFilters} className="text-xs text-primary hover:underline">
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="p-3 space-y-3">
                    {/* Origin Country - searchable input */}
                    <div>
                      <label className="block text-[10px] text-on-surface-variant/70 uppercase tracking-wider mb-1">
                        Origin Country
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. China, Russia, Iran..."
                        value={filters.originCountries.join(', ')}
                        onChange={(e) => {
                          const values = e.target.value.split(',').map(v => v.trim()).filter(Boolean);
                          setFilters({ ...filters, originCountries: values });
                        }}
                        className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-md
                                 text-sm text-on-surface placeholder-on-surface-variant/50
                                 focus:outline-none focus:border-primary transition-colors"
                      />
                      <p className="text-[10px] text-on-surface-variant/50 mt-1">
                        Separate multiple countries with commas
                      </p>
                    </div>

                    {/* Target Countries - searchable input */}
                    <div>
                      <label className="block text-[10px] text-on-surface-variant/70 uppercase tracking-wider mb-1">
                        Target Countries
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. United States, Germany..."
                        value={filters.targetCountries.join(', ')}
                        onChange={(e) => {
                          const values = e.target.value.split(',').map(v => v.trim()).filter(Boolean);
                          setFilters({ ...filters, targetCountries: values });
                        }}
                        className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-md
                                 text-sm text-on-surface placeholder-on-surface-variant/50
                                 focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>

                    {/* Target Sectors - searchable input */}
                    <div>
                      <label className="block text-[10px] text-on-surface-variant/70 uppercase tracking-wider mb-1">
                        Target Sectors
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Government, Finance, Energy..."
                        value={filters.targetSectors.join(', ')}
                        onChange={(e) => {
                          const values = e.target.value.split(',').map(v => v.trim()).filter(Boolean);
                          setFilters({ ...filters, targetSectors: values });
                        }}
                        className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-md
                                 text-sm text-on-surface placeholder-on-surface-variant/50
                                 focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>

                    {/* Intel availability toggle */}
                    <div className="pt-2 border-t border-outline-variant/20">
                      <label className="block text-[10px] text-on-surface-variant/70 uppercase tracking-wider mb-2">
                        Data Availability
                      </label>
                      <div className="flex gap-2">
                        {[
                          { value: null, label: 'All Groups' },
                          { value: true, label: 'With Intel' },
                          { value: false, label: 'Without Intel' },
                        ].map(opt => (
                          <button
                            key={String(opt.value)}
                            onClick={() => setFilters({ ...filters, hasTargetingData: opt.value })}
                            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                              filters.hasTargetingData === opt.value
                                ? 'bg-primary text-on-primary'
                                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-highest'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sort */}
            <select
              value={filters.sortBy}
              onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as any })}
              className="px-2 py-1 bg-transparent text-on-surface-variant/70 text-xs
                       focus:outline-none cursor-pointer hover:text-on-surface"
            >
              <option value="name">Name</option>
              <option value="technique_count">TTPs</option>
              <option value="software_count">Tools</option>
              <option value="modified">Modified</option>
            </select>

            <button
              onClick={() => setFilters({ ...filters, sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' })}
              className="p-1 text-on-surface-variant/50 hover:text-on-surface transition-colors"
            >
              <Icon name={filters.sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'} className="w-3.5 h-3.5" />
            </button>

            {/* Divider */}
            <div className="w-px h-4 bg-outline-variant/20 mx-1" />

            {/* View Toggle */}
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1 rounded transition-colors ${
                viewMode === 'cards' ? 'text-primary' : 'text-on-surface-variant/50 hover:text-on-surface'
              }`}
            >
              <Icon name="grid" className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1 rounded transition-colors ${
                viewMode === 'list' ? 'text-primary' : 'text-on-surface-variant/50 hover:text-on-surface'
              }`}
            >
              <Icon name="list" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Groups Content */}
        {groups.length === 0 ? (
          <div className="text-center py-12">
            <Icon name="inbox" className="w-12 h-12 text-on-surface-variant/50 mx-auto mb-3" />
            <p className="text-on-surface-variant mb-1">No threat groups found</p>
            {filters.search && (
              <button
                onClick={() => setFilters({ ...filters, search: '' })}
                className="text-primary hover:underline text-sm mt-2"
              >
                Clear search
              </button>
            )}
          </div>
        ) : viewMode === 'cards' ? (
          // Card View - tighter grid
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                to={routeHelpers.groupDetail(group.mitre_id)}
                onClick={() => onSelectGroup(group)}
              />
            ))}
          </div>
        ) : (
          // List View - more compact
          <div className="bg-surface-container-low rounded-lg border border-outline-variant/30 overflow-hidden">
            <table className="w-full">
              <thead className="bg-surface-container border-b border-outline-variant/30">
                <tr>
                  {[
                    { key: 'name', label: 'Threat Group', align: 'text-left' },
                    { key: null, label: 'Origin', align: 'text-center' },
                    { key: 'technique_count', label: 'Techniques', align: 'text-center' },
                    { key: 'software_count', label: 'Software', align: 'text-center' },
                    { key: null, label: 'Campaigns', align: 'text-center' },
                  ].map((col, i) => (
                    <th
                      key={i}
                      className={`px-4 py-2.5 ${col.align} text-[10px] font-bold text-on-surface-variant uppercase tracking-wider ${col.key ? 'cursor-pointer hover:text-on-surface select-none' : ''}`}
                      onClick={col.key ? () => setFilters({ ...filters, sortBy: col.key as any, sortOrder: filters.sortBy === col.key ? (filters.sortOrder === 'asc' ? 'desc' : 'asc') : 'desc' }) : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {col.key && filters.sortBy === col.key && (
                          <Icon name={filters.sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'} className="w-3 h-3" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group, idx) => {
                  const targeting = group.data.targeting_intel;
                  const originCountry = targeting?.origin_country;

                  return (
                    <tr
                      key={group.id}
                      onClick={(e) => {
                        const url = routeHelpers.groupDetail(group.mitre_id);
                        if (e.ctrlKey || e.metaKey) { window.open(url, '_blank'); return; }
                        onSelectGroup(group);
                      }}
                      onAuxClick={(e) => { if (e.button === 1) window.open(routeHelpers.groupDetail(group.mitre_id), '_blank'); }}
                      className={`cursor-pointer transition-colors hover:bg-surface-container-high
                                ${idx !== groups.length - 1 ? 'border-b border-outline-variant/10' : ''}`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-primary font-bold">
                            {group.mitre_id}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-on-surface font-medium truncate">{group.name}</div>
                            {group.data.aliases && group.data.aliases[0] && (
                              <div className="text-[10px] text-on-surface-variant truncate">
                                {group.data.aliases[0]}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {originCountry ? (() => {
                          const code = getCountryCode(originCountry);
                          return (
                            <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap" title={originCountry}>
                              {code && <img src={getFlagUrl(code)} alt="" className="w-4 h-3 rounded-[1px] object-cover" />}
                              {originCountry.length > 12 ? originCountry.slice(0, 10) + '...' : originCountry}
                            </span>
                          );
                        })() : (
                          <span className="text-on-surface-variant/40 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-primary font-bold text-sm">
                          {group.technique_count || 0}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-secondary font-bold text-sm">
                          {group.software_count || 0}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-tertiary font-bold text-sm">
                          {group.campaign_count || 0}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
