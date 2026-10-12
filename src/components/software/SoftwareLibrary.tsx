import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { PagePending } from '@/components/ui/PagePending';
import { Select } from '@/components/ui/Select';

import React, { useState } from 'react';
import { useSoftware, Software } from '../../hooks/useSoftware';
import { SoftwareCard } from './SoftwareCard';
import { Icon } from '../Icon';
import { routeHelpers } from '../../router/routes';

interface SoftwareLibraryProps {
  onSelectSoftware: (software: Software) => void;
}

export const SoftwareLibrary: React.FC<SoftwareLibraryProps> = ({ onSelectSoftware }) => {
  const { software, loading, error, filters, setFilters, stats, refetch } = useSoftware();
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');

  const initialLoading = useInitialLoading(loading);
  if (initialLoading) {
    return <PagePending layout="list" />;
  }

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full bg-background">
        <div className="text-center max-w-md">
          <Icon name="alert-circle" className="w-16 h-16 text-error mx-auto mb-4" />
          <p className="text-error mb-4 text-lg font-semibold">
            Failed to load software catalog
          </p>
          <p className="text-on-surface-variant mb-6 text-sm">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="px-6 py-3 bg-secondary text-on-secondary rounded-lg hover:bg-secondary/90 
                     transition-colors font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return <> {loading && <div className="px-6 py-2"><LoadingStatus /></div>} {(
    <div className="flex flex-col h-full bg-background">
      {/* Header Toolbar */}
      <div className="flex-shrink-0 px-6 py-4 bg-background border-b border-outline-variant/30 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-on-surface mb-1 font-brand tracking-wide">
              SOFTWARE CATALOG
            </h1>
            <p className="text-sm text-on-surface-variant">
              {stats.total} items ({stats.malware} malware, {stats.tools} tools)
            </p>
          </div>

          {/* View Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-3 rounded-lg transition-all ${
                viewMode === 'cards'
                  ? 'bg-secondary text-on-secondary shadow-lg shadow-secondary/30'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
              }`}
              title="Card View"
              aria-pressed={viewMode === 'cards'}
            >
              <Icon name="grid" className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-3 rounded-lg transition-all ${
                viewMode === 'list'
                  ? 'bg-secondary text-on-secondary shadow-lg shadow-secondary/30'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
              }`}
              title="List View"
              aria-pressed={viewMode === 'list'}
            >
              <Icon name="list" className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Type Filter Tabs */}
        <div className="flex gap-2 mb-4">
          {[
            { value: 'all', label: `All (${stats.total})` },
            { value: 'malware', label: `Malware (${stats.malware})` },
            { value: 'tool', label: `Tools (${stats.tools})` }
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilters({ ...filters, type: tab.value as any })}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                filters.type === tab.value
                  ? tab.value === 'malware'
                    ? 'bg-error-container text-on-error-container border-error/30'
                    : tab.value === 'tool'
                    ? 'bg-primary-container text-on-primary-container border-primary/30'
                    : 'bg-secondary-container text-on-secondary-container border-secondary/30'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search and Sort */}
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[300px] relative">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search by name, MITRE ID, or alias..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-10 pr-4 py-3 bg-surface-container-high border border-outline-variant/30 
                       rounded-lg text-on-surface placeholder-on-surface-variant/70
                       focus:outline-none focus:border-secondary transition-colors text-sm"
            />
          </div>

          <Select
            value={filters.sortBy}
            onChange={(nextValue) => setFilters({ ...filters, sortBy: nextValue as any })}
            aria-label="Sort by"
            size="md"
            options={[
              { value: 'name', label: 'Sort by Name' },
              { value: 'technique_count', label: 'Sort by Techniques' },
              { value: 'group_count', label: 'Sort by Groups' },
              { value: 'modified', label: 'Sort by Modified' },
            ]}
          />

          <button
            onClick={() =>
              setFilters({
                ...filters,
                sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc'
              })
            }
            className="px-4 py-3 bg-surface-container-high border border-outline-variant/30 rounded-lg 
                     text-on-surface hover:border-secondary transition-colors"
            title={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            aria-label={`Sort ${filters.sortOrder === 'asc' ? 'ascending' : 'descending'}`}
          >
            <Icon
              name={filters.sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
              className="w-5 h-5"
            />
          </button>
        </div>
      </div>

      {/* Software Display Area */}
      <div className="flex-1 overflow-auto p-6 custom-scrollbar">
        {software.length === 0 ? (
          <div className="text-center py-16">
            <Icon name="package" className="w-20 h-20 text-on-surface-variant/50 mx-auto mb-4" />
            <p className="text-on-surface-variant mb-2 text-lg">No software found</p>
            {(filters.search || filters.type !== 'all') && (
              <button
                onClick={() => setFilters({ ...filters, search: '', type: 'all' })}
                className="text-secondary hover:underline text-sm mt-4"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : viewMode === 'cards' ? (
          // Card View
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {software.map((sw) => (
              <SoftwareCard
                key={sw.id}
                software={sw}
                to={routeHelpers.softwareDetail(sw.mitre_id)}
                onClick={() => onSelectSoftware(sw)}
              />
            ))}
          </div>
        ) : (
          // List View
          <div className="bg-surface-container-low rounded-lg border border-outline-variant/30 overflow-hidden">
            <table className="w-full">
              <thead className="bg-surface-container border-b border-outline-variant/30">
                <tr>
                  {[
                    { key: 'name', label: 'Software', align: 'text-left' },
                    { key: null, label: 'Type', align: 'text-center' },
                    { key: 'technique_count', label: 'Techniques', align: 'text-center' },
                    { key: 'group_count', label: 'Groups', align: 'text-center' },
                  ].map((col, i) => (
                    <th
                      key={i}
                      className={`px-6 py-4 ${col.align} text-xs font-bold text-on-surface-variant uppercase tracking-wider ${col.key ? 'cursor-pointer hover:text-on-surface select-none' : ''}`}
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
                {software.map((sw, idx) => (
                  <tr
                    key={sw.id}
                    onClick={(e) => {
                      const url = routeHelpers.softwareDetail(sw.mitre_id);
                      if (e.ctrlKey || e.metaKey) { window.open(url, '_blank'); return; }
                      onSelectSoftware(sw);
                    }}
                    onAuxClick={(e) => { if (e.button === 1) window.open(routeHelpers.softwareDetail(sw.mitre_id), '_blank'); }}
                    className={`cursor-pointer transition-colors hover:bg-surface-container-high
                              ${idx !== software.length - 1 ? 'border-b border-outline-variant/10' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-secondary font-bold">
                          {sw.mitre_id}
                        </span>
                        <div className="flex-1">
                          <div className="text-on-surface font-semibold">{sw.name}</div>
                          {sw.data.aliases && sw.data.aliases[0] && (
                            <div className="text-xs text-on-surface-variant mt-0.5">
                              {sw.data.aliases[0]}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1 text-xs font-bold rounded uppercase border ${
                        sw.software_type === 'malware'
                          ? 'bg-error-container text-on-error-container border-error/30'
                          : 'bg-primary-container text-on-primary-container border-primary/30'
                      }`}>
                        {sw.software_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-primary font-bold text-lg">
                        {sw.technique_count || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-tertiary font-bold text-lg">
                        {sw.group_count || 0}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )} </>;
};
