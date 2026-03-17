
import React, { useState } from 'react';
import { useCampaigns, Campaign } from '../../hooks/useCampaigns';
import { CampaignCard } from './CampaignCard';
import { Icon } from '../Icon';
import { routeHelpers } from '../../router/routes';

interface CampaignsLibraryProps {
  onSelectCampaign: (campaign: Campaign) => void;
  onNavigateToGroup?: (mitreId: string) => void;
}

export const CampaignsLibrary: React.FC<CampaignsLibraryProps> = ({ onSelectCampaign, onNavigateToGroup }) => {
  const { campaigns, loading, error, filters, setFilters, stats, refetch } = useCampaigns();
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full bg-background">
        <Icon name="spinner" className="w-12 h-12 text-tertiary animate-spin mb-4" />
        <p className="text-on-surface-variant animate-pulse font-medium font-mono text-sm">
          LOADING CAMPAIGNS...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full bg-background">
        <div className="text-center max-w-md">
          <Icon name="alert-circle" className="w-16 h-16 text-error mx-auto mb-4" />
          <p className="text-error mb-4 text-lg font-semibold">
            Failed to load campaigns
          </p>
          <p className="text-on-surface-variant mb-6 text-sm">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="px-6 py-3 bg-tertiary text-on-tertiary rounded-lg hover:bg-tertiary/90
                     transition-colors font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header Toolbar */}
      <div className="flex-shrink-0 px-6 py-4 bg-background border-b border-outline-variant/30 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-on-surface mb-1 font-brand tracking-wide">
              CAMPAIGNS
            </h1>
            <p className="text-sm text-on-surface-variant">
              {stats.total} campaigns tracked ({stats.withAttribution} attributed, {stats.active} recent)
            </p>
          </div>

          {/* View Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-3 rounded-lg transition-all ${
                viewMode === 'cards'
                  ? 'bg-tertiary text-on-tertiary shadow-lg shadow-tertiary/30'
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
                  ? 'bg-tertiary text-on-tertiary shadow-lg shadow-tertiary/30'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
              }`}
              title="List View"
              aria-pressed={viewMode === 'list'}
            >
              <Icon name="list" className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Attribution Filter Tabs */}
        <div className="flex gap-2 mb-4">
          {[
            { value: 'all', label: `All (${stats.total})` },
            { value: 'yes', label: `Attributed (${stats.withAttribution})` },
            { value: 'no', label: `Unattributed (${stats.total - stats.withAttribution})` }
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilters({ ...filters, hasGroup: tab.value as any })}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                filters.hasGroup === tab.value
                  ? 'bg-tertiary-container text-on-tertiary-container border-tertiary/30'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search and Sort */}
        <div className="flex gap-4 flex-wrap">
          {/* Search Input */}
          <div className="flex-1 min-w-[300px] relative">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search by name, MITRE ID, alias, or group..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-10 pr-4 py-3 bg-surface-container-high border border-outline-variant/30 
                       rounded-lg text-on-surface placeholder-on-surface-variant/70
                       focus:outline-none focus:border-tertiary transition-colors text-sm"
            />
          </div>

          {/* Sort By Dropdown */}
          <select
            value={filters.sortBy}
            onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as any })}
            className="px-4 py-3 bg-surface-container-high border border-outline-variant/30 rounded-lg 
                     text-on-surface focus:outline-none focus:border-tertiary transition-colors
                     text-sm cursor-pointer"
          >
            <option value="last_seen">Sort by Last Seen</option>
            <option value="first_seen">Sort by First Seen</option>
            <option value="name">Sort by Name</option>
            <option value="modified">Sort by Modified</option>
          </select>

          {/* Sort Order Toggle */}
          <button
            onClick={() =>
              setFilters({
                ...filters,
                sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc'
              })
            }
            className="px-4 py-3 bg-surface-container-high border border-outline-variant/30 rounded-lg 
                     text-on-surface hover:border-tertiary transition-colors"
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

      {/* Campaigns Display Area */}
      <div className="flex-1 overflow-auto p-6 custom-scrollbar">
        {campaigns.length === 0 ? (
          <div className="text-center py-16">
            <Icon name="flag" className="w-20 h-20 text-on-surface-variant/50 mx-auto mb-4" />
            <p className="text-on-surface-variant mb-2 text-lg">No campaigns found</p>
            {(filters.search || filters.hasGroup !== 'all') && (
              <button
                onClick={() => setFilters({ ...filters, search: '', hasGroup: 'all' })}
                className="text-tertiary hover:underline text-sm mt-4"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : viewMode === 'cards' ? (
          // Card View
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {campaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                to={routeHelpers.campaignDetail(campaign.mitre_id)}
                onClick={() => onSelectCampaign(campaign)}
                onNavigateToGroup={onNavigateToGroup}
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
                    { key: 'name', label: 'Campaign', align: 'text-left' },
                    { key: null, label: 'Attributed To', align: 'text-left' },
                    { key: 'first_seen', label: 'Timeline', align: 'text-center' },
                    { key: null, label: 'Techniques', align: 'text-center' },
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
                {campaigns.map((campaign, idx) => (
                  <tr
                    key={campaign.id}
                    onClick={(e) => {
                      const url = routeHelpers.campaignDetail(campaign.mitre_id);
                      if (e.ctrlKey || e.metaKey) { window.open(url, '_blank'); return; }
                      onSelectCampaign(campaign);
                    }}
                    onAuxClick={(e) => { if (e.button === 1) window.open(routeHelpers.campaignDetail(campaign.mitre_id), '_blank'); }}
                    className={`cursor-pointer transition-colors hover:bg-surface-container-high
                              ${idx !== campaigns.length - 1 ? 'border-b border-outline-variant/10' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-tertiary font-bold">
                          {campaign.mitre_id}
                        </span>
                        <div className="flex-1">
                          <div className="text-on-surface font-semibold">{campaign.name}</div>
                          {campaign.data.aliases && campaign.data.aliases[0] && (
                            <div className="text-xs text-on-surface-variant mt-0.5">
                              {campaign.data.aliases[0]}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {campaign.attributed_group ? (
                        <div className="flex items-center gap-2">
                            <span className="bg-primary-container text-primary text-xs font-bold px-2 py-0.5 rounded">
                                {campaign.attributed_group.mitre_id}
                            </span>
                            <span className="text-primary font-medium">
                                {campaign.attributed_group.name}
                            </span>
                        </div>
                      ) : (
                        <span className="text-on-surface-variant/50 italic text-xs">Unknown</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-xs text-on-surface-variant font-mono">
                        {campaign.first_seen ? new Date(campaign.first_seen).getFullYear() : '?'} 
                        {' - '}
                        {campaign.last_seen ? new Date(campaign.last_seen).getFullYear() : 'Present'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-tertiary font-bold text-lg">
                        {campaign.technique_count || 0}
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
  );
};
