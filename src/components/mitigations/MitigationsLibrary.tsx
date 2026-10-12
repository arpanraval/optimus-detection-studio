import { LoadingStatus } from '@/components/ui/LoadingStatus';
import { useInitialLoading } from '@/hooks/useInitialLoading';
import { PagePending } from '@/components/ui/PagePending';
import { Select } from '@/components/ui/Select';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMitigations, Mitigation } from '../../hooks/useMitigations';
import { Icon } from '../Icon';
import { ImpactScoreBadge } from '../impact/ImpactScoreBadge';
import { routeHelpers } from '../../router/routes';

interface MitigationsLibraryProps {
  onSelectMitigation: (mitigationId: string) => void;
  onNavigateToTechnique?: (techniqueId: string) => void;
}

export const MitigationsLibrary: React.FC<MitigationsLibraryProps> = ({
  onSelectMitigation,
  onNavigateToTechnique
}) => {
  const { mitigations, loading, error, filters, setFilters, stats } = useMitigations();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const initialLoading = useInitialLoading(loading);
  if (initialLoading) {
    return <PagePending layout="list" />;
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center p-8 bg-error/5 rounded-2xl border border-error/20 max-w-md">
          <Icon name="alert-triangle" className="w-10 h-10 text-error/60 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-on-surface mb-2">Failed to Load</h3>
          <p className="text-sm text-on-surface-variant">{error.message}</p>
        </div>
      </div>
    );
  }

  return <> {loading && <div className="px-6 py-2"><LoadingStatus /></div>} {(
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-6 lg:px-8 py-5 border-b border-outline-variant/10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-secondary/20 flex items-center justify-center">
                <Icon name="shield" className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-on-surface">Mitigations</h1>
                <p className="text-sm text-on-surface-variant/60">
                  {stats.total} mitigations • Preventive controls from MITRE ATT&CK
                </p>
              </div>
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-surface-container rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md transition-colors ${
                    viewMode === 'grid' 
                      ? 'bg-surface-container-highest text-on-surface' 
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <Icon name="grid" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md transition-colors ${
                    viewMode === 'list' 
                      ? 'bg-surface-container-highest text-on-surface' 
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <Icon name="list" className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <div className="relative flex-1">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40" />
              <input
                type="text"
                placeholder="Search mitigations..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="w-full pl-10 pr-4 py-2.5 bg-surface-container rounded-xl border border-outline-variant/10 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <Select
              value={`${filters.sortBy}-${filters.sortOrder}`}
              onChange={(nextValue) => {
                const [sortBy, sortOrder] = nextValue.split('-') as [typeof filters.sortBy, typeof filters.sortOrder];
                setFilters({ ...filters, sortBy, sortOrder });
              }}
              aria-label="Sort by"
              size="md"
              options={[
                { value: 'impact_score-desc', label: 'Impact Score (High → Low)' },
                { value: 'technique_count-desc', label: 'Most Techniques' },
                { value: 'technique_count-asc', label: 'Least Techniques' },
                { value: 'name-asc', label: 'Name (A-Z)' },
                { value: 'name-desc', label: 'Name (Z-A)' },
                { value: 'modified-desc', label: 'Recently Modified' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6">
          {mitigations.length === 0 ? (
            <div className="text-center py-12">
              <Icon name="shield" className="w-12 h-12 text-on-surface-variant/20 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-on-surface mb-2">No Mitigations Found</h3>
              <p className="text-sm text-on-surface-variant/60">
                {filters.search ? 'Try adjusting your search criteria' : 'No mitigations in the database'}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mitigations.map(mitigation => (
                <MitigationCard 
                  key={mitigation.stix_id} 
                  mitigation={mitigation}
                  onClick={() => onSelectMitigation(mitigation.mitre_id)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {mitigations.map(mitigation => (
                <MitigationRow
                  key={mitigation.stix_id}
                  mitigation={mitigation}
                  onClick={() => onSelectMitigation(mitigation.mitre_id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )} </>;
};

// Card component for grid view
const MitigationCard: React.FC<{ mitigation: Mitigation; onClick: () => void }> = ({ mitigation, onClick }) => {
  const mitreUrl = mitigation.data.external_references?.find(
    ref => ref.source_name === 'mitre-attack'
  )?.url;

  return (
    <Link
      to={routeHelpers.mitigationDetail(mitigation.mitre_id)}
      onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) onClick?.(); }}
      className="block no-underline text-inherit group p-5 bg-surface-container rounded-xl border border-outline-variant/10 hover:border-secondary/30 hover:bg-surface-container-high cursor-pointer transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-secondary bg-secondary/10 px-2 py-0.5 rounded">
            {mitigation.mitre_id}
          </span>
          {mitigation.impact_score !== undefined && mitigation.impact_score > 0 && (
            <ImpactScoreBadge score={mitigation.impact_score} size="sm" showLabel={false} animate={false} />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {mitreUrl && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(mitreUrl, '_blank', 'noopener,noreferrer'); }}
              className="p-1 text-on-surface-variant/40 hover:text-on-surface-variant opacity-0 group-hover:opacity-100 transition-all"
              title="View on MITRE"
            >
              <Icon name="external-link" className="w-3.5 h-3.5" />
            </button>
          )}
          <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/30 group-hover:text-on-surface-variant transition-colors" />
        </div>
      </div>

      <h3 className="font-medium text-on-surface mb-2 line-clamp-2 group-hover:text-secondary transition-colors">
        {mitigation.name}
      </h3>

      <p className="text-xs text-on-surface-variant/60 line-clamp-3 mb-4">
        {mitigation.description || 'No description available'}
      </p>

      <div className="flex items-center justify-between pt-3 border-t border-outline-variant/10">
        <div className="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
          <Icon name="shield-check" className="w-3.5 h-3.5" />
          <span>{mitigation.technique_count} technique{mitigation.technique_count !== 1 ? 's' : ''}</span>
        </div>
        {mitigation.impact_score !== undefined && mitigation.impact_score > 0 && (
          <div className="text-xs text-on-surface-variant/60">
            Impact: <span className="font-semibold text-on-surface">{Math.round(mitigation.impact_score)}</span>
          </div>
        )}
      </div>
    </Link>
  );
};

// Row component for list view
const MitigationRow: React.FC<{ mitigation: Mitigation; onClick: () => void }> = ({ mitigation, onClick }) => {
  return (
    <Link
      to={routeHelpers.mitigationDetail(mitigation.mitre_id)}
      onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) onClick?.(); }}
      className="block no-underline text-inherit group flex items-center gap-4 p-4 bg-surface-container rounded-xl border border-outline-variant/10 hover:border-secondary/30 hover:bg-surface-container-high cursor-pointer transition-all"
    >
      <div className="flex-shrink-0 flex items-center gap-2">
        <span className="font-mono text-xs font-bold text-secondary bg-secondary/10 px-2 py-1 rounded">
          {mitigation.mitre_id}
        </span>
        {mitigation.impact_score !== undefined && mitigation.impact_score > 0 && (
          <ImpactScoreBadge score={mitigation.impact_score} size="sm" showLabel={false} animate={false} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-on-surface truncate group-hover:text-secondary transition-colors">
          {mitigation.name}
        </h3>
        <p className="text-xs text-on-surface-variant/60 truncate mt-0.5">
          {mitigation.description || 'No description available'}
        </p>
      </div>

      <div className="flex-shrink-0 flex items-center gap-6">
        <div className="text-right">
          <div className="text-sm font-medium text-on-surface">{mitigation.technique_count}</div>
          <div className="text-[10px] text-on-surface-variant/50 uppercase">Techniques</div>
        </div>
        {mitigation.impact_score !== undefined && mitigation.impact_score > 0 && (
          <div className="text-right">
            <div className="text-sm font-medium text-on-surface">{Math.round(mitigation.impact_score)}</div>
            <div className="text-[10px] text-on-surface-variant/50 uppercase">Impact</div>
          </div>
        )}
        <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/30 group-hover:text-on-surface-variant transition-colors" />
      </div>
    </Link>
  );
};

export default MitigationsLibrary;
