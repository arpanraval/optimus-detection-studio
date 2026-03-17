import React, { useState, useMemo } from 'react';
import { useEntityStrategyRecommendations, StrategyGap } from '../../hooks/useStrategyGaps';
import { Detection } from '../../types';
import { Icon } from '../Icon';

interface DetectionRecommendationsProps {
  entityType: 'group' | 'campaign' | 'software';
  entityName: string;
  entityMitreId: string;
  techniqueIds: string[];
  detections: Detection[];
  onCreateDetection?: (prefill: DetectionPrefill) => void;
  onCreateDetectionPack?: (strategies: StrategyGap[], packName: string) => void;
  onNavigateToTechnique?: (techniqueId: string) => void;
  onNavigateToStrategy?: (strategyStixId: string) => void;
}

export interface DetectionPrefill {
  name?: string;
  description?: string;
  mitreAttackIds?: string[];
  logSources?: string[];
  platforms?: string[];
  linkedGroups?: { stix_id: string; mitre_id: string; name: string }[];
  linkedCampaigns?: { stix_id: string; mitre_id: string; name: string }[];
  sourceStrategy?: {
    strategyId: string;
    strategyName: string;
    analyticCount: number;
  };
}

export const DetectionRecommendations: React.FC<DetectionRecommendationsProps> = ({
  entityType,
  entityName,
  entityMitreId,
  techniqueIds,
  detections,
  onCreateDetection,
  onCreateDetectionPack,
  onNavigateToTechnique,
  onNavigateToStrategy
}) => {
  const { recommendations, priorityRecommendations, stats, loading, error } = 
    useEntityStrategyRecommendations(techniqueIds, detections);
  
  const [selectedStrategies, setSelectedStrategies] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'priority' | 'all'>('priority');

  // Group recommendations by technique for better organization
  const groupedByTechnique = useMemo(() => {
    const grouped = new Map<string, StrategyGap[]>();
    
    const list = viewMode === 'priority' ? priorityRecommendations : recommendations;
    list.forEach(r => {
      const existing = grouped.get(r.technique_mitre_id) || [];
      grouped.set(r.technique_mitre_id, [...existing, r]);
    });

    return Array.from(grouped.entries()).map(([techniqueId, strategies]) => ({
      techniqueId,
      techniqueName: strategies[0]?.technique_name || '',
      strategies,
      hasGaps: strategies.some(s => !s.has_coverage)
    })).sort((a, b) => {
      // Sort by number of gaps descending
      const aGaps = a.strategies.filter(s => !s.has_coverage).length;
      const bGaps = b.strategies.filter(s => !s.has_coverage).length;
      return bGaps - aGaps;
    });
  }, [recommendations, priorityRecommendations, viewMode]);

  const toggleStrategy = (strategyId: string) => {
    const newSelected = new Set(selectedStrategies);
    if (newSelected.has(strategyId)) {
      newSelected.delete(strategyId);
    } else {
      newSelected.add(strategyId);
    }
    setSelectedStrategies(newSelected);
  };

  const selectAllGaps = () => {
    const gaps = priorityRecommendations.map(r => r.strategy_stix_id);
    setSelectedStrategies(new Set(gaps));
  };

  const clearSelection = () => {
    setSelectedStrategies(new Set());
  };

  const handleCreateFromStrategy = (strategy: StrategyGap) => {
    if (!onCreateDetection) return;

    const prefill: DetectionPrefill = {
      name: `${strategy.technique_mitre_id} - ${strategy.strategy_name}`,
      description: strategy.strategy_description || 
        `Detection for ${entityName} (${entityMitreId}) based on MITRE strategy: ${strategy.strategy_name}`,
      mitreAttackIds: [strategy.technique_mitre_id],
      sourceStrategy: {
        strategyId: strategy.strategy_stix_id,
        strategyName: strategy.strategy_name,
        analyticCount: strategy.analytic_count
      }
    };

    // Link to entity
    if (entityType === 'group') {
      prefill.linkedGroups = [{ stix_id: '', mitre_id: entityMitreId, name: entityName }];
    } else if (entityType === 'campaign') {
      prefill.linkedCampaigns = [{ stix_id: '', mitre_id: entityMitreId, name: entityName }];
    }

    onCreateDetection(prefill);
  };

  const handleGeneratePack = () => {
    if (!onCreateDetectionPack || selectedStrategies.size === 0) return;

    const selectedList = priorityRecommendations.filter(r => selectedStrategies.has(r.strategy_stix_id));
    const packName = `${entityName} Detection Pack`;
    onCreateDetectionPack(selectedList, packName);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Icon name="spinner" className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-on-surface-variant">Analyzing detection gaps...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <Icon name="alert-triangle" className="w-10 h-10 text-error/60 mx-auto mb-3" />
        <p className="text-sm text-on-surface-variant">{error.message}</p>
      </div>
    );
  }

  if (techniqueIds.length === 0) {
    return (
      <div className="p-8 text-center">
        <Icon name="matrix" className="w-12 h-12 text-on-surface-variant/20 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-on-surface mb-2">No Techniques</h3>
        <p className="text-sm text-on-surface-variant/60">
          This {entityType} doesn't have any associated techniques
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Banner */}
      <div className={`rounded-xl border p-5 ${
        stats.uncovered_strategies > 0 
          ? 'bg-warning/5 border-warning/20' 
          : 'bg-tertiary/5 border-tertiary/20'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              stats.uncovered_strategies > 0 ? 'bg-warning/10' : 'bg-tertiary/10'
            }`}>
              <Icon 
                name={stats.uncovered_strategies > 0 ? 'alert-triangle' : 'shield-check'} 
                className={`w-6 h-6 ${stats.uncovered_strategies > 0 ? 'text-warning' : 'text-tertiary'}`} 
              />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-on-surface mb-1">
                {stats.uncovered_strategies > 0 
                  ? `${stats.uncovered_strategies} Detection Opportunities`
                  : 'Full Strategy Coverage'}
              </h3>
              <p className="text-sm text-on-surface-variant/70">
                {stats.uncovered_strategies > 0 ? (
                  <>
                    Based on {techniqueIds.length} techniques used by <strong>{entityName}</strong>, 
                    there are {stats.uncovered_strategies} MITRE detection strategies without coverage.
                  </>
                ) : (
                  <>
                    All {stats.total_strategies} detection strategies for techniques used by{' '}
                    <strong>{entityName}</strong> have detections.
                  </>
                )}
              </p>
            </div>
          </div>

          {stats.uncovered_strategies > 0 && onCreateDetectionPack && (
            <button
              onClick={handleGeneratePack}
              disabled={selectedStrategies.size === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary font-medium rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Icon name="plus" className="w-4 h-4" />
              Generate Pack ({selectedStrategies.size})
            </button>
          )}
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-outline-variant/10">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-on-surface">{stats.total_techniques}</span>
            <span className="text-xs text-on-surface-variant/50 uppercase">Techniques</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-on-surface">{stats.total_strategies}</span>
            <span className="text-xs text-on-surface-variant/50 uppercase">Strategies</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-tertiary">{stats.covered_strategies}</span>
            <span className="text-xs text-on-surface-variant/50 uppercase">Covered</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${stats.uncovered_strategies > 0 ? 'text-warning' : 'text-tertiary'}`}>
              {stats.uncovered_strategies}
            </span>
            <span className="text-xs text-on-surface-variant/50 uppercase">Gaps</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-32 h-2 bg-surface-container rounded-full overflow-hidden">
              <div 
                className="h-full bg-tertiary"
                style={{ width: `${stats.coverage_percent}%` }}
              />
            </div>
            <span className="text-sm font-medium text-on-surface">{stats.coverage_percent}%</span>
          </div>
        </div>
      </div>

      {/* Only show content if there are gaps */}
      {stats.uncovered_strategies > 0 && (
        <>
          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setViewMode('priority')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'priority'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Priority Gaps ({priorityRecommendations.length})
              </button>
              <button
                onClick={() => setViewMode('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'all'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                }`}
              >
                All Strategies ({recommendations.length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={selectAllGaps}
                className="text-xs text-primary hover:underline"
              >
                Select All Gaps
              </button>
              {selectedStrategies.size > 0 && (
                <>
                  <span className="text-on-surface-variant/30">•</span>
                  <button
                    onClick={clearSelection}
                    className="text-xs text-on-surface-variant hover:text-on-surface"
                  >
                    Clear ({selectedStrategies.size})
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Recommendations List */}
          <div className="space-y-4">
            {groupedByTechnique.map(({ techniqueId, techniqueName, strategies, hasGaps }) => (
              <div 
                key={techniqueId}
                className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden"
              >
                {/* Technique Header */}
                <div className="px-5 py-3 bg-surface-container-low border-b border-outline-variant/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onNavigateToTechnique?.(techniqueId)}
                      className="font-mono text-sm font-bold text-primary bg-primary/10 px-2.5 py-1 rounded hover:bg-primary/20 transition-colors"
                    >
                      {techniqueId}
                    </button>
                    <span className="text-sm font-medium text-on-surface">{techniqueName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-on-surface-variant/50">
                      {strategies.filter(s => s.has_coverage).length}/{strategies.length} covered
                    </span>
                    {hasGaps && (
                      <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full font-medium">
                        {strategies.filter(s => !s.has_coverage).length} gaps
                      </span>
                    )}
                  </div>
                </div>

                {/* Strategies */}
                <div className="divide-y divide-outline-variant/5">
                  {strategies.map(strategy => (
                    <div 
                      key={strategy.strategy_stix_id}
                      className={`px-5 py-3 flex items-center gap-4 ${
                        strategy.has_coverage ? 'bg-tertiary/5' : 'hover:bg-surface-container-high/50'
                      }`}
                    >
                      {/* Checkbox for uncovered strategies */}
                      {!strategy.has_coverage && onCreateDetectionPack && (
                        <input
                          type="checkbox"
                          checked={selectedStrategies.has(strategy.strategy_stix_id)}
                          onChange={() => toggleStrategy(strategy.strategy_stix_id)}
                          className="w-4 h-4 rounded border-outline-variant/30 text-primary focus:ring-primary/30"
                        />
                      )}
                      
                      {strategy.has_coverage && (
                        <Icon name="shield-check" className="w-4 h-4 text-tertiary" />
                      )}

                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => onNavigateToStrategy?.(strategy.strategy_stix_id)}
                          className="text-sm font-medium text-on-surface hover:text-primary transition-colors text-left truncate block"
                        >
                          {strategy.strategy_name}
                        </button>
                        <p className="text-xs text-on-surface-variant/50 truncate">
                          {strategy.analytic_count} analytic{strategy.analytic_count !== 1 ? 's' : ''}
                          {strategy.strategy_description && ` • ${strategy.strategy_description.slice(0, 80)}...`}
                        </p>
                      </div>

                      {!strategy.has_coverage && onCreateDetection && (
                        <button
                          onClick={() => handleCreateFromStrategy(strategy)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary text-xs font-medium rounded-lg hover:bg-primary/20 transition-colors"
                        >
                          <Icon name="plus" className="w-3.5 h-3.5" />
                          Create
                        </button>
                      )}

                      {strategy.has_coverage && (
                        <span className="text-xs text-tertiary font-medium px-2">✓ Covered</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty state when fully covered */}
      {stats.uncovered_strategies === 0 && stats.total_strategies > 0 && (
        <div className="text-center py-8">
          <Icon name="shield-check" className="w-16 h-16 text-tertiary/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-on-surface mb-2">Excellent Coverage!</h3>
          <p className="text-sm text-on-surface-variant/60 max-w-md mx-auto">
            You have detections covering all {stats.total_strategies} MITRE detection strategies 
            associated with techniques used by <strong>{entityName}</strong>.
          </p>
        </div>
      )}
    </div>
  );
};

export default DetectionRecommendations;
