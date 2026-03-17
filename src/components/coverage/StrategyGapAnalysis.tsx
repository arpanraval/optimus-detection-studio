import React, { useState, useMemo } from 'react';
import { useStrategyGaps, TechniqueStrategyGap, StrategyGap, GapSummary } from '../../hooks/useStrategyGaps';
import { Detection } from '../../types';
import { Icon } from '../Icon';

interface StrategyGapAnalysisProps {
  detections: Detection[];
  onCreateDetection?: (prefill: DetectionPrefill) => void;
  onNavigateToTechnique?: (techniqueId: string) => void;
  onNavigateToStrategy?: (strategyStixId: string) => void;
}

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

type ViewMode = 'summary' | 'by-technique' | 'all-gaps';
type FilterMode = 'all' | 'uncovered' | 'partial' | 'covered';

export const StrategyGapAnalysis: React.FC<StrategyGapAnalysisProps> = ({
  detections,
  onCreateDetection,
  onNavigateToTechnique,
  onNavigateToStrategy
}) => {
  const { gapsByTechnique, uncoveredGaps, summary, loading, error } = useStrategyGaps(detections);
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [filterMode, setFilterMode] = useState<FilterMode>('uncovered');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTechnique, setExpandedTechnique] = useState<string | null>(null);

  // Filter techniques based on filter mode
  const filteredTechniques = useMemo(() => {
    let result = [...gapsByTechnique];

    // Apply filter
    switch (filterMode) {
      case 'uncovered':
        result = result.filter(t => t.uncovered_strategies > 0);
        break;
      case 'partial':
        result = result.filter(t => t.covered_strategies > 0 && t.uncovered_strategies > 0);
        break;
      case 'covered':
        result = result.filter(t => t.uncovered_strategies === 0);
        break;
    }

    // Apply search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      result = result.filter(t => 
        t.technique_mitre_id.toLowerCase().includes(search) ||
        t.technique_name.toLowerCase().includes(search) ||
        t.strategies.some(s => s.strategy_name.toLowerCase().includes(search))
      );
    }

    return result;
  }, [gapsByTechnique, filterMode, searchTerm]);

  const handleCreateFromStrategy = (strategy: StrategyGap) => {
    if (!onCreateDetection) return;

    const prefill: DetectionPrefill = {
      name: `${strategy.technique_mitre_id} - ${strategy.strategy_name}`,
      description: strategy.strategy_description || `Detection based on MITRE strategy: ${strategy.strategy_name}`,
      mitreAttackIds: [strategy.technique_mitre_id],
      sourceStrategy: {
        strategyId: strategy.strategy_stix_id,
        strategyName: strategy.strategy_name,
        analyticCount: strategy.analytic_count
      }
    };

    onCreateDetection(prefill);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Icon name="spinner" className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-on-surface-variant">Analyzing strategy coverage...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <Icon name="alert-triangle" className="w-10 h-10 text-error/60 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-on-surface mb-2">Analysis Failed</h3>
        <p className="text-sm text-on-surface-variant">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Strategies"
          value={summary.total_strategies}
          icon="spark"
          variant="primary"
        />
        <SummaryCard
          label="Covered"
          value={summary.covered_strategies}
          icon="shield-check"
          variant="tertiary"
          subtitle={`${summary.coverage_percent}%`}
        />
        <SummaryCard
          label="Gaps"
          value={summary.uncovered_strategies}
          icon="alert-triangle"
          variant="warning"
          highlight={summary.uncovered_strategies > 0}
        />
        <SummaryCard
          label="Techniques with Gaps"
          value={summary.techniques_with_gaps}
          icon="matrix"
          variant="error"
          subtitle={`of ${summary.total_techniques_with_strategies}`}
        />
      </div>

      {/* Coverage Progress */}
      <div className="bg-surface-container rounded-xl border border-outline-variant/10 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-on-surface">Strategy Coverage</h3>
            <p className="text-xs text-on-surface-variant/60">
              {summary.covered_strategies} of {summary.total_strategies} MITRE strategies have detections
            </p>
          </div>
          <span className={`text-2xl font-bold ${
            summary.coverage_percent >= 70 ? 'text-tertiary' :
            summary.coverage_percent >= 40 ? 'text-warning' : 'text-error'
          }`}>
            {summary.coverage_percent}%
          </span>
        </div>
        <div className="h-2.5 bg-surface-container-high rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-500 rounded-full ${
              summary.coverage_percent >= 70 ? 'bg-tertiary' :
              summary.coverage_percent >= 40 ? 'bg-warning' : 'bg-error'
            }`}
            style={{ width: `${summary.coverage_percent}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40" />
          <input
            type="text"
            placeholder="Search techniques or strategies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-surface-container rounded-xl border border-outline-variant/10 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Filter */}
        <select
          value={filterMode}
          onChange={(e) => setFilterMode(e.target.value as FilterMode)}
          className="px-4 py-2.5 bg-surface-container rounded-xl border border-outline-variant/10 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="all">All Techniques</option>
          <option value="uncovered">With Gaps</option>
          <option value="partial">Partial Coverage</option>
          <option value="covered">Fully Covered</option>
        </select>

        {/* View Toggle */}
        <div className="flex items-center bg-surface-container rounded-xl border border-outline-variant/10 p-1">
          <button
            onClick={() => setViewMode('by-technique')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'by-technique'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            By Technique
          </button>
          <button
            onClick={() => setViewMode('all-gaps')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'all-gaps'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            All Gaps
          </button>
        </div>
      </div>

      {/* Technique Cards View */}
      {viewMode === 'by-technique' && (
        <div className="space-y-3">
          {filteredTechniques.length === 0 ? (
            <div className="text-center py-12 bg-surface-container rounded-xl border border-outline-variant/10">
              <Icon name="shield-check" className="w-12 h-12 text-tertiary/40 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-on-surface mb-1">
                {filterMode === 'covered' ? 'Full Coverage!' : 'No Results'}
              </h3>
              <p className="text-sm text-on-surface-variant/60">
                {filterMode === 'covered' 
                  ? 'All MITRE strategies have detection coverage'
                  : 'No techniques match your current filters'}
              </p>
            </div>
          ) : (
            filteredTechniques.map(technique => (
              <TechniqueGapCard
                key={technique.technique_stix_id}
                technique={technique}
                isExpanded={expandedTechnique === technique.technique_stix_id}
                onToggle={() => setExpandedTechnique(
                  expandedTechnique === technique.technique_stix_id ? null : technique.technique_stix_id
                )}
                onCreateDetection={onCreateDetection ? handleCreateFromStrategy : undefined}
                onNavigateToTechnique={onNavigateToTechnique}
                onNavigateToStrategy={onNavigateToStrategy}
              />
            ))
          )}
        </div>
      )}

      {/* All Gaps View */}
      {viewMode === 'all-gaps' && (
        <div className="space-y-2">
          {uncoveredGaps.length === 0 ? (
            <div className="text-center py-12 bg-surface-container rounded-xl border border-outline-variant/10">
              <Icon name="shield-check" className="w-12 h-12 text-tertiary/40 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-on-surface mb-1">Full Coverage!</h3>
              <p className="text-sm text-on-surface-variant/60">
                All MITRE strategies have detection coverage
              </p>
            </div>
          ) : (
            uncoveredGaps.map(gap => (
              <GapRow
                key={gap.strategy_stix_id}
                gap={gap}
                onCreateDetection={onCreateDetection ? () => handleCreateFromStrategy(gap) : undefined}
                onNavigateToTechnique={onNavigateToTechnique}
                onNavigateToStrategy={onNavigateToStrategy}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

// Summary Card Component
const SummaryCard: React.FC<{
  label: string;
  value: number;
  icon: string;
  variant: 'primary' | 'tertiary' | 'warning' | 'error';
  subtitle?: string;
  highlight?: boolean;
}> = ({ label, value, icon, variant, subtitle, highlight }) => {
  const variantStyles = {
    primary: 'text-primary bg-primary/10',
    tertiary: 'text-tertiary bg-tertiary/10',
    warning: 'text-warning bg-warning/10',
    error: 'text-error bg-error/10',
  };

  return (
    <div className={`bg-surface-container rounded-xl border p-4 ${
      highlight ? 'border-warning/30 bg-warning/5' : 'border-outline-variant/10'
    }`}>
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${variantStyles[variant]}`}>
          <Icon name={icon} className="w-4.5 h-4.5" />
        </div>
        {subtitle && (
          <span className="text-xs text-on-surface-variant/50 font-medium">{subtitle}</span>
        )}
      </div>
      <p className="text-2xl font-bold text-on-surface mt-3 tabular-nums">{value.toLocaleString()}</p>
      <p className="text-xs text-on-surface-variant/60 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
};

// Technique Gap Card Component
const TechniqueGapCard: React.FC<{
  technique: TechniqueStrategyGap;
  isExpanded: boolean;
  onToggle: () => void;
  onCreateDetection?: (strategy: StrategyGap) => void;
  onNavigateToTechnique?: (id: string) => void;
  onNavigateToStrategy?: (id: string) => void;
}> = ({ technique, isExpanded, onToggle, onCreateDetection, onNavigateToTechnique, onNavigateToStrategy }) => {
  const statusColor = technique.uncovered_strategies === 0 ? 'tertiary' :
    technique.covered_strategies > 0 ? 'warning' : 'error';

  return (
    <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-surface-container-high/50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <button
            onClick={(e) => { e.stopPropagation(); onNavigateToTechnique?.(technique.technique_mitre_id); }}
            className="font-mono text-sm font-bold text-primary bg-primary/10 px-2.5 py-1 rounded hover:bg-primary/20 transition-colors"
          >
            {technique.technique_mitre_id}
          </button>
          <span className="text-sm font-medium text-on-surface">{technique.technique_name}</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Coverage indicator */}
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-surface-container-high rounded-full overflow-hidden">
              <div 
                className={`h-full bg-${statusColor}`}
                style={{ width: `${technique.coverage_percent}%` }}
              />
            </div>
            <span className={`text-xs font-medium text-${statusColor}`}>
              {technique.covered_strategies}/{technique.total_strategies}
            </span>
          </div>

          {technique.uncovered_strategies > 0 && (
            <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full font-medium">
              {technique.uncovered_strategies} gap{technique.uncovered_strategies !== 1 ? 's' : ''}
            </span>
          )}

          <Icon 
            name={isExpanded ? 'chevron-up' : 'chevron-down'} 
            className="w-4 h-4 text-on-surface-variant/40" 
          />
        </div>
      </button>

      {/* Expanded Strategies */}
      {isExpanded && (
        <div className="border-t border-outline-variant/10 divide-y divide-outline-variant/5">
          {technique.strategies.map(strategy => (
            <div 
              key={strategy.strategy_stix_id}
              className={`px-5 py-3 flex items-center justify-between ${
                strategy.has_coverage ? 'bg-tertiary/5' : 'bg-surface-container-low'
              }`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Icon 
                  name={strategy.has_coverage ? 'shield-check' : 'alert-circle'} 
                  className={`w-4 h-4 flex-shrink-0 ${
                    strategy.has_coverage ? 'text-tertiary' : 'text-warning'
                  }`} 
                />
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => onNavigateToStrategy?.(strategy.strategy_stix_id)}
                    className="text-sm font-medium text-on-surface hover:text-primary transition-colors truncate block text-left"
                  >
                    {strategy.strategy_name}
                  </button>
                  <p className="text-xs text-on-surface-variant/50">
                    {strategy.analytic_count} analytic{strategy.analytic_count !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {!strategy.has_coverage && onCreateDetection && (
                <button
                  onClick={() => onCreateDetection(strategy)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Icon name="plus" className="w-3.5 h-3.5" />
                  Create
                </button>
              )}

              {strategy.has_coverage && (
                <span className="text-xs text-tertiary font-medium">Covered</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Gap Row Component (for flat list view)
const GapRow: React.FC<{
  gap: StrategyGap;
  onCreateDetection?: () => void;
  onNavigateToTechnique?: (id: string) => void;
  onNavigateToStrategy?: (id: string) => void;
}> = ({ gap, onCreateDetection, onNavigateToTechnique, onNavigateToStrategy }) => (
  <div className="flex items-center gap-4 p-4 bg-surface-container rounded-xl border border-outline-variant/10 hover:border-warning/30 transition-colors">
    <Icon name="alert-circle" className="w-5 h-5 text-warning flex-shrink-0" />
    
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={() => onNavigateToTechnique?.(gap.technique_mitre_id)}
          className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded hover:bg-primary/20 transition-colors"
        >
          {gap.technique_mitre_id}
        </button>
        <button
          onClick={() => onNavigateToStrategy?.(gap.strategy_stix_id)}
          className="text-sm font-medium text-on-surface hover:text-primary transition-colors truncate"
        >
          {gap.strategy_name}
        </button>
      </div>
      <p className="text-xs text-on-surface-variant/50">
        {gap.technique_name} • {gap.analytic_count} analytics
      </p>
    </div>

    {onCreateDetection && (
      <button
        onClick={onCreateDetection}
        className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors flex-shrink-0"
      >
        <Icon name="plus" className="w-4 h-4" />
        Create Detection
      </button>
    )}
  </div>
);

export default StrategyGapAnalysis;
