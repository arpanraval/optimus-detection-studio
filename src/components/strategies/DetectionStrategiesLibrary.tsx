import React, { useState, useMemo } from 'react';
import { useDetectionStrategies, DetectionStrategy } from '../../hooks/useDetectionStrategies';
import { Icon } from '../Icon';
import { ImpactScoreBadge } from '../impact/ImpactScoreBadge';
import type { IconName } from '../Icon';

export interface DetectionPrefill {
  name?: string;
  description?: string;
  mitreAttackIds?: string[];
  logSources?: string[];
  platforms?: string[];
  technology?: string;
  sourceStrategy?: {
    strategyId: string;
    strategyName: string;
    analyticCount: number;
  };
}

interface DetectionStrategiesLibraryProps {
  onSelectStrategy: (strategyStixId: string) => void;
  onNavigateToTechnique?: (techniqueId: string) => void;
  onCreateDetection?: (prefill: DetectionPrefill) => void;
}

type SortOption = 'name' | 'analytic_count' | 'technique' | 'impact_score';
type ViewMode = 'grid' | 'list';

export const DetectionStrategiesLibrary: React.FC<DetectionStrategiesLibraryProps> = ({
  onSelectStrategy,
  onNavigateToTechnique,
  onCreateDetection
}) => {
  const { strategies, loading, error } = useDetectionStrategies();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('impact_score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  // Extract unique platforms from strategies
  const availablePlatforms = useMemo(() => {
    const platforms = new Set<string>();
    strategies.forEach(s => {
      const domains = s.domains as string[] | null;
      if (domains) {
        domains.forEach(d => platforms.add(d));
      }
    });
    return Array.from(platforms).sort();
  }, [strategies]);

  // Filter and sort strategies
  const filteredStrategies = useMemo(() => {
    let result = [...strategies];

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      result = result.filter(s =>
        s.name?.toLowerCase().includes(search) ||
        s.mitre_id?.toLowerCase().includes(search) ||
        s.description?.toLowerCase().includes(search) ||
        s.technique_id?.toLowerCase().includes(search) ||
        s.technique_name?.toLowerCase().includes(search)
      );
    }

    // Platform/domain filter
    if (platformFilter !== 'all') {
      result = result.filter(s => {
        const domains = s.domains as string[] | null;
        return domains?.includes(platformFilter);
      });
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '');
          break;
        case 'analytic_count':
          comparison = (a.analytic_count || 0) - (b.analytic_count || 0);
          break;
        case 'impact_score':
          comparison = (a.impact_score || 0) - (b.impact_score || 0);
          break;
        case 'technique':
          comparison = (a.technique_id || '').localeCompare(b.technique_id || '');
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [strategies, searchTerm, sortBy, sortOrder, platformFilter]);

  // Stats
  const stats = useMemo(() => {
    const totalAnalytics = strategies.reduce((sum, s) => sum + (s.analytic_count || 0), 0);
    const uniqueTechniques = new Set(strategies.map(s => s.technique_id).filter(Boolean)).size;
    return {
      totalStrategies: strategies.length,
      totalAnalytics,
      uniqueTechniques,
      filtered: filteredStrategies.length
    };
  }, [strategies, filteredStrategies]);

  // Handler for creating detection from strategy
  const handleCreateFromStrategy = (strategy: DetectionStrategy) => {
    if (!onCreateDetection) return;
    
    const prefill: DetectionPrefill = {
      name: `${strategy.technique_id || ''} - ${strategy.name}`.trim(),
      description: strategy.description || `Detection based on MITRE strategy: ${strategy.name}`,
      mitreAttackIds: strategy.technique_id ? [strategy.technique_id] : [],
      sourceStrategy: {
        strategyId: strategy.stix_id,
        strategyName: strategy.name,
        analyticCount: strategy.analytic_count
      }
    };
    
    onCreateDetection(prefill);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Icon name="spinner" className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-on-surface-variant">Loading detection strategies...</p>
        </div>
      </div>
    );
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

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-6 lg:px-8 py-5 border-b border-outline-variant/10">
        <div className="max-w-7xl mx-auto">
          {/* Title Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-tertiary/20 flex items-center justify-center">
                <Icon name="spark" className="w-5 h-5 text-tertiary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-on-surface">Detection Strategies</h1>
                <p className="text-sm text-on-surface-variant/60">
                  {stats.totalStrategies} strategies • {stats.totalAnalytics.toLocaleString()} analytics • ATT&CK v18
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

          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard label="Strategies" value={stats.totalStrategies} icon="radar" color="tertiary" />
            <StatCard label="Analytics" value={stats.totalAnalytics} icon="spark" color="primary" />
            <StatCard label="Techniques Covered" value={stats.uniqueTechniques} icon="shield-check" color="secondary" />
            <StatCard label="Showing" value={stats.filtered} icon="filter" color="on-surface-variant" />
          </div>

          {/* Filters Row */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40" />
              <input
                type="text"
                placeholder="Search strategies, techniques, or descriptions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-surface-container rounded-xl border border-outline-variant/10 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Domain Filter */}
            {availablePlatforms.length > 0 && (
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="px-4 py-2.5 bg-surface-container rounded-xl border border-outline-variant/10 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="all">All Domains</option>
                {availablePlatforms.map(p => (
                  <option key={p} value={p}>{p.replace('enterprise-attack', 'Enterprise').replace('ics-attack', 'ICS').replace('mobile-attack', 'Mobile')}</option>
                ))}
              </select>
            )}

            {/* Sort */}
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [newSort, newOrder] = e.target.value.split('-') as [SortOption, 'asc' | 'desc'];
                setSortBy(newSort);
                setSortOrder(newOrder);
              }}
              className="px-4 py-2.5 bg-surface-container rounded-xl border border-outline-variant/10 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="impact_score-desc">Impact Score (High → Low)</option>
              <option value="impact_score-asc">Impact Score (Low → High)</option>
              <option value="analytic_count-desc">Most Analytics</option>
              <option value="analytic_count-asc">Least Analytics</option>
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="technique-asc">Technique (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6">
          {filteredStrategies.length === 0 ? (
            <div className="text-center py-12">
              <Icon name="spark" className="w-12 h-12 text-on-surface-variant/20 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-on-surface mb-2">No Strategies Found</h3>
              <p className="text-sm text-on-surface-variant/60">
                {searchTerm || platformFilter !== 'all' 
                  ? 'Try adjusting your search or filters' 
                  : 'No detection strategies in the database'}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStrategies.map(strategy => (
                <StrategyCard 
                  key={strategy.stix_id} 
                  strategy={strategy}
                  onClick={() => onSelectStrategy(strategy.stix_id)}
                  onTechniqueClick={onNavigateToTechnique}
                  onCreateDetection={onCreateDetection ? handleCreateFromStrategy : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredStrategies.map(strategy => (
                <StrategyRow
                  key={strategy.stix_id}
                  strategy={strategy}
                  onClick={() => onSelectStrategy(strategy.stix_id)}
                  onTechniqueClick={onNavigateToTechnique}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard: React.FC<{ label: string; value: number; icon: IconName; color: string }> = ({ label, value, icon, color }) => (
  <div className="bg-surface-container rounded-xl border border-outline-variant/10 p-3 flex items-center gap-3">
    <div className={`w-8 h-8 rounded-lg bg-${color}/10 flex items-center justify-center flex-shrink-0`}>
      <Icon name={icon} className={`w-4 h-4 text-${color}`} />
    </div>
    <div>
      <p className="text-lg font-semibold text-on-surface tabular-nums">{value.toLocaleString()}</p>
      <p className="text-[10px] text-on-surface-variant/50 uppercase tracking-wider">{label}</p>
    </div>
  </div>
);

// Strategy Card for Grid View
const StrategyCard: React.FC<{ 
  strategy: DetectionStrategy; 
  onClick: () => void;
  onTechniqueClick?: (techniqueId: string) => void;
  onCreateDetection?: (strategy: DetectionStrategy) => void;
}> = ({ strategy, onClick, onTechniqueClick, onCreateDetection }) => {
  return (
    <div
      onClick={onClick}
      className="group p-5 bg-surface-container rounded-xl border border-outline-variant/10 hover:border-tertiary/30 hover:bg-surface-container-high cursor-pointer transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-bold text-tertiary bg-tertiary/10 px-2 py-0.5 rounded">
            {strategy.mitre_id}
          </span>
          {strategy.technique_id && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTechniqueClick?.(strategy.technique_id!);
              }}
              className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded hover:bg-primary/20 transition-colors"
            >
              {strategy.technique_id}
            </button>
          )}
          {strategy.impact_score !== undefined && strategy.impact_score > 0 && (
            <ImpactScoreBadge score={strategy.impact_score} size="sm" showLabel={false} animate={false} />
          )}
        </div>
        <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/30 group-hover:text-on-surface-variant transition-colors" />
      </div>

      {/* Name */}
      <h3 className="font-medium text-on-surface mb-2 line-clamp-2 group-hover:text-tertiary transition-colors">
        {strategy.name}
      </h3>

      {/* Description */}
      <p className="text-xs text-on-surface-variant/60 line-clamp-3 mb-4">
        {strategy.description || 'No description available'}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-outline-variant/10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
            <Icon name="spark" className="w-3.5 h-3.5 text-tertiary" />
            <span>{strategy.analytic_count} analytic{strategy.analytic_count !== 1 ? 's' : ''}</span>
          </div>
          {strategy.impact_score !== undefined && strategy.impact_score > 0 && (
            <div className="text-xs text-on-surface-variant/60">
              Impact: <span className="font-semibold text-on-surface">{Math.round(strategy.impact_score)}</span>
            </div>
          )}
        </div>
        {onCreateDetection && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateDetection(strategy);
            }}
            className="flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary text-xs font-medium rounded-lg hover:bg-primary/20 transition-colors"
          >
            <Icon name="plus" className="w-3 h-3" />
            Create
          </button>
        )}
      </div>
    </div>
  );
};

// Strategy Row for List View
const StrategyRow: React.FC<{ 
  strategy: DetectionStrategy; 
  onClick: () => void;
  onTechniqueClick?: (techniqueId: string) => void;
}> = ({ strategy, onClick, onTechniqueClick }) => {
  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-4 p-4 bg-surface-container rounded-xl border border-outline-variant/10 hover:border-tertiary/30 hover:bg-surface-container-high cursor-pointer transition-all"
    >
      {/* IDs */}
      <div className="flex-shrink-0 flex items-center gap-2">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs font-bold text-tertiary bg-tertiary/10 px-2 py-0.5 rounded text-center">
            {strategy.mitre_id}
          </span>
          {strategy.technique_id && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTechniqueClick?.(strategy.technique_id!);
              }}
              className="font-mono text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded hover:bg-primary/20 transition-colors text-center"
            >
              {strategy.technique_id}
            </button>
          )}
        </div>
        {strategy.impact_score !== undefined && strategy.impact_score > 0 && (
          <ImpactScoreBadge score={strategy.impact_score} size="sm" showLabel={false} animate={false} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-on-surface truncate group-hover:text-tertiary transition-colors">
          {strategy.name}
        </h3>
        <p className="text-xs text-on-surface-variant/60 truncate mt-0.5">
          {strategy.description || 'No description available'}
        </p>
      </div>

      {/* Stats */}
      <div className="flex-shrink-0 flex items-center gap-6">
        <div className="text-right">
          <div className="text-sm font-medium text-on-surface">{strategy.analytic_count}</div>
          <div className="text-[10px] text-on-surface-variant/50 uppercase">Analytics</div>
        </div>
        {strategy.impact_score !== undefined && strategy.impact_score > 0 && (
          <div className="text-right">
            <div className="text-sm font-medium text-on-surface">{Math.round(strategy.impact_score)}</div>
            <div className="text-[10px] text-on-surface-variant/50 uppercase">Impact</div>
          </div>
        )}
        <Icon name="chevron-right" className="w-4 h-4 text-on-surface-variant/30 group-hover:text-on-surface-variant transition-colors" />
      </div>
    </div>
  );
};

export default DetectionStrategiesLibrary;
